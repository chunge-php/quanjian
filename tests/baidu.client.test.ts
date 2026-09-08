import { describe, it, expect, vi } from 'vitest'
import { createBaiduClient, BaiduConfigError, BaiduApiError } from '@/lib/baidu'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

type Handler = (url: URL) => unknown
/** 造一个假 fetch：按 pathname 分发，记录每次请求 URL */
function fakeFetch(handler: Handler) {
  const calls: URL[] = []
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url)
    const body = handler(url)
    if (body instanceof Error) throw body
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const mk = (handler: Handler, extra: Record<string, unknown> = {}) => {
  const f = fakeFetch(handler)
  const client = createBaiduClient({
    ak: 'TESTAK',
    cacheDir: null,
    retryBaseMs: 1,
    qps: 1000,
    concurrency: 8,
    fetchImpl: f.impl,
    ...extra,
  })
  return { client, ...f }
}

describe('createBaiduClient 基础', () => {
  it('缺 AK 可创建但调用抛 BaiduConfigError', async () => {
    const saved = process.env.BAIDU_SERVER_AK
    delete process.env.BAIDU_SERVER_AK
    try {
      const client = createBaiduClient({ ak: '', cacheDir: null })
      expect(client.hasAk).toBe(false)
      await expect(client.geocode('上海')).rejects.toBeInstanceOf(BaiduConfigError)
      await expect(
        client.routeMatrixWalking([{ lng: 1, lat: 1 }], [{ lng: 1, lat: 1 }])
      ).rejects.toBeInstanceOf(BaiduConfigError)
    } finally {
      if (saved !== undefined) process.env.BAIDU_SERVER_AK = saved
    }
  })

  it('geocode：传参带 ak，返回 LngLat，乱码地址(comprehension=0)返回 null', async () => {
    const { client, calls } = mk((u) =>
      u.searchParams.get('address') === '乱码'
        ? {
            status: 0,
            result: {
              location: { lng: 110.3, lat: 20.0 },
              precise: 0,
              confidence: 70,
              comprehension: 0,
              level: '地产小区',
            },
          }
        : {
            status: 0,
            result: {
              location: { lng: 121.48149, lat: 31.23473 },
              precise: 1,
              confidence: 70,
              comprehension: 100,
              level: '休闲娱乐',
            },
          }
    )
    const r = await client.geocode('上海市人民广场')
    expect(r?.location).toEqual({ lng: 121.48149, lat: 31.23473 })
    expect(r?.precise).toBe(1)
    expect(calls[0].pathname).toBe('/geocoding/v3/')
    expect(calls[0].searchParams.get('ak')).toBe('TESTAK')
    expect(await client.geocode('乱码')).toBeNull()
    expect(client.stats.geocode).toBe(2)
  })

  it('reverseGeocode：location 参数是 lat,lng 顺序，返回 address 形状', async () => {
    const { client, calls } = mk(() => ({
      status: 0,
      result: {
        formatted_address: '上海市黄浦区南京东路街道九江路915号',
        addressComponent: {
          province: '上海市',
          city: '上海市',
          district: '黄浦区',
          street: '九江路',
          town: '南京东路街道',
        },
      },
    }))
    const a = await client.reverseGeocode({ lng: 121.4797, lat: 31.2397 })
    expect(calls[0].searchParams.get('location')).toBe('31.239700,121.479700')
    expect(a).toEqual({
      formatted: '上海市黄浦区南京东路街道九江路915号',
      province: '上海市',
      city: '上海市',
      district: '黄浦区',
      street: '九江路',
    })
  })

  it('placeSearchNearby：自动翻页直到不满一页，page_size 封顶 20', async () => {
    const page = (n: number, size: number) =>
      Array.from({ length: size }, (_, i) => ({
        uid: `u${n}-${i}`,
        name: `药店${n}-${i}`,
        location: { lng: 121, lat: 31 },
      }))
    const { client, calls } = mk((u) => {
      const p = Number(u.searchParams.get('page_num'))
      return { status: 0, total: 45, results: p < 2 ? page(p, 20) : page(p, 5) }
    })
    const res = await client.placeSearchNearby({
      query: '药店$大药房',
      location: { lng: 121.4797, lat: 31.2397 },
      radius: 1000,
      pageSize: 50,
      maxPages: 5,
    })
    expect(res).toHaveLength(45)
    expect(calls).toHaveLength(3)
    expect(calls[0].searchParams.get('page_size')).toBe('20')
    expect(calls[0].searchParams.get('query')).toBe('药店$大药房')
    expect(calls[0].searchParams.get('location')).toBe('31.239700,121.479700')
    expect(client.stats.placeSearch).toBe(3)
  })

  it('非 0 且不可重试的错误码直接抛 BaiduApiError', async () => {
    const { client, calls } = mk(() => ({ status: 240, message: 'APP 服务被禁用' }))
    await expect(client.reverseGeocode({ lng: 1, lat: 1 })).rejects.toBeInstanceOf(BaiduApiError)
    expect(calls).toHaveLength(1)
    expect(client.stats.rateLimited).toBe(0)
  })
})

describe('routeMatrixWalking 分批合并', () => {
  const pt = (i: number) => ({ lng: 121 + i * 0.001, lat: 31 + i * 0.001 })
  /** 假算路：distance = originIdx*1000 + destIdx，方便验证位置 */
  const matrixHandler = (u: URL) => {
    const os = u.searchParams.get('origins')!.split('|')
    const ds = u.searchParams.get('destinations')!.split('|')
    const idx = (s: string) => Math.round((Number(s.split(',')[0]) - 31) / 0.001)
    const result: unknown[] = []
    for (const o of os)
      for (const d of ds)
        result.push({ distance: { value: idx(o) * 1000 + idx(d) }, duration: { value: 7 } })
    return { status: 0, result }
  }

  it('1 origin × 230 dests → 3 批(100/100/30)，结果按位置正确合并', async () => {
    const { client, calls } = mk(matrixHandler)
    const dests = Array.from({ length: 230 }, (_, i) => pt(i))
    const m = await client.routeMatrixWalking([pt(0)], dests)
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.searchParams.get('destinations')!.split('|').length)).toEqual([
      100, 100, 30,
    ])
    expect(m).toHaveLength(1)
    expect(m[0]).toHaveLength(230)
    expect(m[0][0]).toEqual({ distanceM: 0, durationSec: 7 })
    expect(m[0][157]?.distanceM).toBe(157)
    expect(m[0][229]?.distanceM).toBe(229)
    expect(client.stats.routeMatrix).toBe(3)
    expect(client.stats.routeMatrixPairs).toBe(230)
  })

  it('5 origins × 25 dests → 每批 4×25=100 对，共 2 批', async () => {
    const { client, calls } = mk(matrixHandler)
    const m = await client.routeMatrixWalking(
      Array.from({ length: 5 }, (_, i) => pt(i)),
      Array.from({ length: 25 }, (_, i) => pt(i))
    )
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      const pairs =
        c.searchParams.get('origins')!.split('|').length *
        c.searchParams.get('destinations')!.split('|').length
      expect(pairs).toBeLessThanOrEqual(100)
    }
    expect(m[4][3]?.distanceM).toBe(4003)
    expect(m[2][24]?.distanceM).toBe(2024)
  })

  it('某一批失败 → 该批单元为 null，其他批正常，不抛', async () => {
    const { client } = mk((u) =>
      u.searchParams.get('destinations')!.split('|').length === 100
        ? { status: 2, message: '点对数量超出限制' }
        : matrixHandler(u)
    )
    const m = await client.routeMatrixWalking(
      [pt(0)],
      Array.from({ length: 130 }, (_, i) => pt(i))
    )
    expect(m[0].slice(0, 100).every((c) => c === null)).toBe(true)
    expect(m[0][100]?.distanceM).toBe(100)
  })
})

describe('401 退避重试', () => {
  it('前两次 401 第三次成功，rateLimited=2', async () => {
    let n = 0
    const { client, calls } = mk(() =>
      ++n < 3
        ? { status: 401, message: '当前并发量已经超过约定并发配额，限制访问' }
        : { status: 0, result: { formatted_address: 'x', addressComponent: {} } }
    )
    const a = await client.reverseGeocode({ lng: 1, lat: 1 })
    expect(a.formatted).toBe('x')
    expect(calls).toHaveLength(3)
    expect(client.stats.rateLimited).toBe(2)
  })

  it('一直 401 → 重试 3 次后抛出，共 4 次请求', async () => {
    const { client, calls } = mk(() => ({ status: 401, message: '并发超限' }))
    await expect(client.reverseGeocode({ lng: 1, lat: 1 })).rejects.toMatchObject({ status: 401 })
    expect(calls).toHaveLength(4)
    expect(client.stats.rateLimited).toBe(3)
  })

  it('网络错误也退避重试', async () => {
    let n = 0
    const { client } = mk(() =>
      ++n === 1
        ? new TypeError('fetch failed')
        : { status: 0, result: { formatted_address: 'ok', addressComponent: {} } }
    )
    expect((await client.reverseGeocode({ lng: 1, lat: 1 })).formatted).toBe('ok')
    expect(client.stats.rateLimited).toBe(1)
  })
})

describe('缓存', () => {
  it('同参数第二次命中内存缓存，不再 fetch，cacheHits=1', async () => {
    const { client, calls } = mk(() => ({
      status: 0,
      result: { formatted_address: 'x', addressComponent: {} },
    }))
    await client.reverseGeocode({ lng: 121.4797, lat: 31.2397 })
    await client.reverseGeocode({ lng: 121.4797, lat: 31.2397 })
    expect(calls).toHaveLength(1)
    expect(client.stats.cacheHits).toBe(1)
    expect(client.stats.geocode).toBe(2)
  })

  it('磁盘缓存：新 client 能命中旧文件，文件名与内容不含 AK', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'qj-cache-'))
    try {
      const handler = () => ({
        status: 0,
        result: { formatted_address: 'disk', addressComponent: {} },
      })
      const a = mk(handler, { cacheDir: dir, ak: 'SECRET_AK_123' })
      await a.client.reverseGeocode({ lng: 1, lat: 2 })
      const files = readdirSync(dir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^[0-9a-f]{40}\.json$/)
      expect(readFileSync(path.join(dir, files[0]), 'utf8')).not.toContain('SECRET_AK_123')

      const b = mk(handler, { cacheDir: dir, ak: 'ANOTHER_AK' })
      const r = await b.client.reverseGeocode({ lng: 1, lat: 2 })
      expect(r.formatted).toBe('disk')
      expect(b.calls).toHaveLength(0)
      expect(b.client.stats.cacheHits).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('失败响应不写缓存', async () => {
    let n = 0
    const { client, calls } = mk(() =>
      ++n === 1
        ? { status: 240, message: '禁用' }
        : { status: 0, result: { formatted_address: 'ok', addressComponent: {} } }
    )
    await expect(client.reverseGeocode({ lng: 1, lat: 1 })).rejects.toBeInstanceOf(BaiduApiError)
    expect((await client.reverseGeocode({ lng: 1, lat: 1 })).formatted).toBe('ok')
    expect(calls).toHaveLength(2)
  })
})
