/**
 * 百度地图 Web 服务 API 客户端（服务端专用，AK 不下发浏览器）。
 *
 * 覆盖：地理编码 / 逆地理编码 / 地点检索（周边）/ 批量算路（步行）。
 * 统一处理：限流 + 并发 + 退避重试 + 缓存 + 统计计数。
 *
 * 坐标约定：内部 LngLat={lng,lat}；百度传参是 "lat,lng"，返回是 {lng,lat}。
 *
 * 实测上限（2026-09-08，个人开发者 AK，详见 LIMITS.md）：
 * - routematrix/walking：单次 origins×destinations ≤ 100 对（1×100 ✔，1×101 ✘，2×50 ✔，3×50 ✘，4×25 ✔，5×25 ✘）
 * - place/v2/search：page_size 上限 20（传 50 也只回 20）
 * - 并发：≥3 稳定 401；2 偶发；单次 routematrix 耗时 ≈0.9s
 */
import type { ApiStats, HealthReport, LngLat } from '../types'
import { BaiduApiError, BaiduConfigError, BaiduNetworkError, isRetryableError } from './errors'
import { cacheKey, createCache, stripSecrets, type ResponseCache } from './cache'
import { createLimiter, withRetry, type Limiter } from './limiter'
import { fromBaiduLocation, joinLatLng, toLatLngParam } from './geo'

export const BAIDU_API_BASE = 'https://api.map.baidu.com'
/** 批量算路单次请求最多点对数（实测） */
export const ROUTE_MATRIX_MAX_PAIRS = 100
/** 地点检索每页上限（实测） */
export const PLACE_PAGE_SIZE_MAX = 20
/** 默认 QPS / 并发（实测得出，可用 BAIDU_QPS / BAIDU_MAX_CONCURRENCY 覆盖） */
export const DEFAULT_QPS = 3
export const DEFAULT_CONCURRENCY = 2

export interface BaiduClientOptions {
  ak?: string
  qps?: number
  concurrency?: number
  /** 磁盘缓存目录，默认 data/cache；传 null 关闭磁盘缓存（内存缓存仍在） */
  cacheDir?: string | null
  fetchImpl?: typeof fetch
  /** 退避重试基准毫秒，默认 500（测试可调小） */
  retryBaseMs?: number
  /** 最多重试次数，默认 3 */
  retries?: number
  /** 是否跳过缓存读取（仍会写入） */
  noCache?: boolean
  /** 单次 fetch 超时毫秒，默认 10000 */
  timeoutMs?: number
}

export interface GeocodeResult {
  location: LngLat
  /** 1=精确打点 0=模糊 */
  precise: number
  /** 可信度 0-100 */
  confidence: number
  /** 地址理解程度 0-100（实测：乱码地址也返回 status 0，但 comprehension=0） */
  comprehension: number
  level: string
}

/** 批量算路单元格 */
export interface RouteMatrixCell {
  distanceM: number
  durationSec: number
}

/** 地点检索原始 POI（只声明我们会用到的字段） */
export interface BaiduPlaceResult {
  uid: string
  name: string
  location: { lng: number; lat: number }
  address?: string
  province?: string
  city?: string
  area?: string
  telephone?: string
  detail_info?: {
    tag?: string
    classified_poi_tag?: string
    distance?: number
    type?: string
    label?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface PlaceSearchNearbyParams {
  /** 关键词，多个用 $ 拼接（最多 10 个） */
  query: string
  location: LngLat
  radius: number
  /** 百度 tag 过滤（如 "医疗;药店"） */
  tag?: string
  /** 每页数量 ≤20 */
  pageSize?: number
  /** 最多翻几页，默认 3 */
  maxPages?: number
}

export interface BaiduClient {
  /** 是否配置了 AK（无 AK 时调用会抛 BaiduConfigError） */
  readonly hasAk: boolean
  /** 地理编码：地址 → 坐标；找不到返回 null */
  geocode(address: string): Promise<GeocodeResult | null>
  /** 逆地理编码：坐标 → 结构化地址 */
  reverseGeocode(p: LngLat): Promise<HealthReport['address']>
  /** 周边地点检索，自动翻页，返回原始 POI 数组 */
  placeSearchNearby(params: PlaceSearchNearbyParams): Promise<BaiduPlaceResult[]>
  /**
   * 批量步行算路：返回 [origin][destination] 矩阵；自动按 100 对分批 + 并发 + 合并；
   * 单元失败为 null，不抛（只有缺 AK 时抛 BaiduConfigError）
   */
  routeMatrixWalking(
    origins: LngLat[],
    destinations: LngLat[]
  ): Promise<(RouteMatrixCell | null)[][]>
  /** 累计统计 */
  readonly stats: ApiStats
  resetStats(): void
}

export function emptyStats(): ApiStats {
  return {
    geocode: 0,
    placeSearch: 0,
    routeMatrix: 0,
    routeMatrixPairs: 0,
    cacheHits: 0,
    rateLimited: 0,
    degraded: 0,
    elapsedMs: 0,
  }
}

type Json = Record<string, unknown>

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/**
 * 创建客户端。AK 缺省读 process.env.BAIDU_SERVER_AK；
 * qps/concurrency 缺省读 BAIDU_QPS / BAIDU_MAX_CONCURRENCY，再缺省用实测默认值。
 */
export function createBaiduClient(opts: BaiduClientOptions = {}): BaiduClient {
  const ak = (opts.ak ?? process.env.BAIDU_SERVER_AK ?? '').trim()
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const limiter: Limiter = createLimiter({
    qps: opts.qps ?? envNum('BAIDU_QPS', DEFAULT_QPS),
    concurrency: opts.concurrency ?? envNum('BAIDU_MAX_CONCURRENCY', DEFAULT_CONCURRENCY),
  })
  const cache: ResponseCache = createCache({
    cacheDir: opts.cacheDir === undefined ? 'data/cache' : opts.cacheDir,
  })
  const stats = emptyStats()
  const timeoutMs = opts.timeoutMs ?? 10000

  function buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
    const u = new URL(endpoint, BAIDU_API_BASE)
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== '') u.searchParams.set(k, String(v))
    u.searchParams.set('output', 'json')
    u.searchParams.set('ak', ak)
    return u.toString()
  }

  async function fetchJson(endpoint: string, url: string): Promise<Json> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal })
      if (!res.ok) throw new BaiduNetworkError(endpoint, `HTTP ${res.status}`)
      const data = (await res.json()) as Json
      const status = Number(data.status)
      if (status !== 0) throw new BaiduApiError(endpoint, status, String(data.message ?? ''))
      return data
    } catch (err) {
      if (err instanceof BaiduApiError) throw err
      throw new BaiduNetworkError(endpoint, err)
    } finally {
      clearTimeout(timer)
    }
  }

  /** 统一请求：缓存 → 限流 → 重试 → 计时 */
  async function request(
    endpoint: string,
    params: Record<string, string | number | undefined>
  ): Promise<Json> {
    if (!ak) throw new BaiduConfigError()
    const url = buildUrl(endpoint, params)
    const key = cacheKey(url)
    if (!opts.noCache) {
      const hit = await cache.get(key)
      if (hit !== undefined) {
        stats.cacheHits += 1
        return hit as Json
      }
    }
    const t0 = Date.now()
    try {
      const data = await withRetry(() => limiter.schedule(() => fetchJson(endpoint, url)), {
        retries: opts.retries ?? 3,
        baseDelayMs: opts.retryBaseMs ?? 500,
        shouldRetry: isRetryableError,
        onRetry: () => {
          stats.rateLimited += 1
        },
      })
      await cache.set(key, data)
      return data
    } finally {
      stats.elapsedMs += Date.now() - t0
    }
  }

  const client: BaiduClient = {
    hasAk: ak.length > 0,
    stats,
    resetStats() {
      Object.assign(stats, emptyStats())
    },

    async geocode(address) {
      stats.geocode += 1
      let data: Json
      try {
        data = await request('/geocoding/v3/', { address })
      } catch (err) {
        if (err instanceof BaiduApiError && !err.retryable && err.status === 1) return null
        throw err
      }
      const r = data.result as Json | undefined
      const location = fromBaiduLocation(r?.location)
      if (!location) return null
      const precise = Number(r?.precise ?? 0)
      const comprehension = Number(r?.comprehension ?? 100)
      // 实测：无法理解的地址也会回 status 0 + 一个兜底坐标，靠 comprehension=0 且 precise=0 识别
      if (comprehension === 0 && precise === 0) return null
      return {
        location,
        precise,
        confidence: Number(r?.confidence ?? 0),
        comprehension,
        level: String(r?.level ?? ''),
      }
    },

    async reverseGeocode(p) {
      stats.geocode += 1
      const data = await request('/reverse_geocoding/v3/', { location: toLatLngParam(p) })
      const r = (data.result ?? {}) as Json
      const ac = (r.addressComponent ?? {}) as Json
      const pick = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
      return {
        formatted: String(r.formatted_address ?? ''),
        province: pick(ac.province),
        city: pick(ac.city),
        district: pick(ac.district),
        street: pick(ac.street) ?? pick(ac.town),
      }
    },

    async placeSearchNearby({ query, location, radius, tag, pageSize, maxPages }) {
      const size = Math.min(PLACE_PAGE_SIZE_MAX, Math.max(1, pageSize ?? PLACE_PAGE_SIZE_MAX))
      const pages = Math.max(1, maxPages ?? 3)
      const out: BaiduPlaceResult[] = []
      for (let page = 0; page < pages; page++) {
        stats.placeSearch += 1
        const data = await request('/place/v2/search', {
          query,
          tag,
          location: toLatLngParam(location),
          radius: Math.round(radius),
          radius_limit: 'true',
          scope: 2,
          page_size: size,
          page_num: page,
        })
        const results = (Array.isArray(data.results) ? data.results : []) as BaiduPlaceResult[]
        out.push(...results)
        const total = Number(data.total ?? NaN)
        if (results.length < size) break
        if (Number.isFinite(total) && out.length >= total) break
      }
      return out
    },

    async routeMatrixWalking(origins, destinations) {
      if (!ak) throw new BaiduConfigError()
      const matrix: (RouteMatrixCell | null)[][] = origins.map(() => destinations.map(() => null))
      if (!origins.length || !destinations.length) return matrix
      // 分批：每批 oChunk×dChunk ≤ 100 对；优先让 destinations 尽量多
      const dChunk = Math.min(destinations.length, ROUTE_MATRIX_MAX_PAIRS)
      const oChunk = Math.max(1, Math.floor(ROUTE_MATRIX_MAX_PAIRS / dChunk))
      const jobs: Promise<void>[] = []
      for (let oi = 0; oi < origins.length; oi += oChunk) {
        const os = origins.slice(oi, oi + oChunk)
        for (let di = 0; di < destinations.length; di += dChunk) {
          const ds = destinations.slice(di, di + dChunk)
          jobs.push(
            fetchBatch(os, ds)
              .then((cells) => {
                for (let a = 0; a < os.length; a++)
                  for (let b = 0; b < ds.length; b++)
                    matrix[oi + a][di + b] = cells[a * ds.length + b] ?? null
              })
              .catch(() => undefined)
          )
        }
      }
      await Promise.all(jobs)
      return matrix
    },
  }

  async function fetchBatch(os: LngLat[], ds: LngLat[]): Promise<(RouteMatrixCell | null)[]> {
    stats.routeMatrix += 1
    stats.routeMatrixPairs += os.length * ds.length
    const data = await request('/routematrix/v2/walking', {
      origins: joinLatLng(os),
      destinations: joinLatLng(ds),
    })
    const list = (Array.isArray(data.result) ? data.result : []) as Json[]
    return list.map((c) => {
      const dist = Number((c.distance as Json | undefined)?.value)
      const dur = Number((c.duration as Json | undefined)?.value)
      if (!Number.isFinite(dist) || !Number.isFinite(dur) || dist < 0) return null
      return { distanceM: dist, durationSec: dur }
    })
  }

  return client
}

/** 供日志使用：去掉 AK 的 URL */
export { stripSecrets }
