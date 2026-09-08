/** SSE 封装与 route 校验（不启动 next dev，直接调 handler） */
import { describe, expect, it } from 'vitest'
import { analyzeToSse, parseSse, encodeEvent } from '@/lib/pipeline/sse'
import { analyzeRequestSchema, parseAnalyzeQuery } from '@/lib/pipeline/schema'
import { GET as healthGet } from '@/app/api/health/route'
import { GET as samplesGet } from '@/app/api/samples/route'
import { POST as analyzePost, GET as analyzeGet } from '@/app/api/analyze/route'
import { CENTER, makeStubDeps } from './pipeline-stubs.test'

describe('SSE 编码', () => {
  it('每个事件一帧 data: json\\n\\n，可解析回来', () => {
    const frame = encodeEvent({ type: 'stage', stage: 'geocode', message: '中文', progress: 3 })
    expect(frame.startsWith('data: {')).toBe(true)
    expect(frame.endsWith('\n\n')).toBe(true)
    expect(parseSse(frame)).toEqual([
      { type: 'stage', stage: 'geocode', message: '中文', progress: 3 },
    ])
  })
  it('analyzeToSse 返回 event-stream 头且以 done 结尾', async () => {
    const { deps } = makeStubDeps()
    const res = analyzeToSse({ center: CENTER }, deps)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toContain('no-cache')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    const events = parseSse(await res.text())
    expect(events[0]).toMatchObject({ type: 'stage', stage: 'geocode' })
    expect(events.at(-1)?.type).toBe('done')
  })
  it('致命错误以 error 事件结束流而不是抛出', async () => {
    const { deps } = makeStubDeps({ geocodeNull: true })
    const res = analyzeToSse({ center: CENTER, address: 'nowhere' }, deps)
    const events = parseSse(await res.text())
    expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false })
  })
})

describe('请求校验', () => {
  it('schema 接受合法 body，拒绝越界坐标', () => {
    expect(analyzeRequestSchema.safeParse({ center: CENTER, bearings: 8 }).success).toBe(true)
    expect(analyzeRequestSchema.safeParse({ center: { lng: 200, lat: 1 } }).success).toBe(false)
    expect(analyzeRequestSchema.safeParse({}).success).toBe(false)
  })
  it('GET query 解析 lng/lat/bearings 为数字', () => {
    const r = parseAnalyzeQuery(
      new URLSearchParams('lng=106.2277&lat=29.5921&bearings=12&noCache=1')
    )
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).toEqual({ center: CENTER, bearings: 12, noCache: true })
    expect(parseAnalyzeQuery(new URLSearchParams('lng=abc')).success).toBe(false)
  })
  it('POST 非法 JSON / 非法字段 → 400', async () => {
    const bad = await analyzePost(
      new Request('http://x/api/analyze', { method: 'POST', body: '{oops' })
    )
    expect(bad.status).toBe(400)
    const bad2 = await analyzePost(
      new Request('http://x/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ center: { lng: 1 } }),
      })
    )
    expect(bad2.status).toBe(400)
    expect((await bad2.json()).error).toContain('center.lat')
  })
  it('GET 缺参数 → 400', async () => {
    const res = await analyzeGet(new Request('http://x/api/analyze?lng=106'))
    expect(res.status).toBe(400)
  })
})

describe('辅助路由', () => {
  it('/api/health 不泄露 AK', async () => {
    const body = await (await healthGet(new Request('http://localhost/api/health'))).json()
    expect(body.ok).toBe(true)
    expect(typeof body.hasServerAk).toBe('boolean')
    expect(typeof body.sampleCount).toBe('number')
    expect(JSON.stringify(body)).not.toContain(process.env.BAIDU_SERVER_AK ?? '__none__')
  })
  it('/api/samples 返回摘要数组', async () => {
    const body = await (await samplesGet()).json()
    expect(Array.isArray(body.samples)).toBe(true)
    for (const s of body.samples)
      expect(s).toMatchObject({
        slug: expect.any(String),
        name: expect.any(String),
        center: { lng: expect.any(Number), lat: expect.any(Number) },
      })
  })
})
