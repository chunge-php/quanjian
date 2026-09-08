/** 街道级批量体检：runBatch 事件顺序 / 单点失败跳过 / 样例回放，以及 route 校验 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runBatch, FAST_BEARINGS } from '@/lib/batch/run'
import { batchToSse, parseBatchSse } from '@/lib/batch/sse'
import { batchRequestSchema, parseBatchQuery } from '@/lib/batch/schema'
import type { BatchSampleFile } from '@/lib/batch/sample'
import { POST as batchPost, GET as batchGet } from '@/app/api/batch/route'
import type { BatchEvent, BatchRequest, IsochroneSample, LngLat } from '@/lib/types'
import { CENTER, makeStubDeps } from './pipeline-stubs.test'

const req: BatchRequest = {
  area: { kind: 'circle', center: CENTER, radiusM: 1000 },
  spacingM: 500,
  maxPoints: 9,
}

async function collect(r: BatchRequest, faults = {}, over = {}) {
  const { deps, calls } = makeStubDeps(faults, over)
  const events: BatchEvent[] = []
  const report = await runBatch(r, (e) => events.push(e), deps)
  return { events, report, calls, deps }
}

describe('runBatch · 事件流', () => {
  it('plan → (progress… point)×N → done，串行且 index 递增', async () => {
    const { events, report } = await collect(req)
    expect(events[0].type).toBe('plan')
    expect(events.at(-1)?.type).toBe('done')
    const plan = events[0] as Extract<BatchEvent, { type: 'plan' }>
    expect(plan.points.length).toBeLessThanOrEqual(9)
    expect(plan.spacingM).toBeGreaterThanOrEqual(500)
    const points = events.filter((e) => e.type === 'point') as Extract<
      BatchEvent,
      { type: 'point' }
    >[]
    expect(points.map((p) => p.index)).toEqual(plan.points.map((_, i) => i))
    expect(points.every((p) => p.total === plan.points.length)).toBe(true)
    // 每个 point 之前必然有它自己的 progress 事件，且 progress 不会晚于该点的 point
    for (const p of points) {
      const idx = events.indexOf(p)
      const prog = events.slice(0, idx).filter((e) => e.type === 'progress' && e.index === p.index)
      expect(prog.length).toBeGreaterThan(0)
    }
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(report.points).toHaveLength(plan.points.length)
    expect(report.reports).toHaveLength(plan.points.length)
  })
  it('progress 事件带 index/total/stage，不透传 partial', async () => {
    const { events } = await collect(req)
    const prog = events.filter((e) => e.type === 'progress') as Extract<
      BatchEvent,
      { type: 'progress' }
    >[]
    expect(prog[0]).toMatchObject({ index: 0, stage: 'geocode' })
    expect(prog.some((p) => p.stage === 'done')).toBe(true)
    expect(events.some((e) => (e as { type: string }).type === 'partial')).toBe(false)
  })
  it('快速模式默认开启：bearings=8 并传 radiiM', async () => {
    const seen: { bearings: number; radiiM?: number[] }[] = []
    const { deps } = makeStubDeps()
    const orig = deps.buildSamples
    deps.buildSamples = (c, o) => {
      seen.push({ ...(o as { bearings: number; radiiM?: number[] }) })
      return orig(c, o)
    }
    await runBatch({ ...req, maxPoints: 2 }, () => {}, deps)
    expect(seen[0].bearings).toBe(FAST_BEARINGS)
    expect(seen[0].radiiM).toEqual([300, 600, 900, 1200, 1600])
  })
  it('fast=false 时用默认 16 方向且不传 radiiM', async () => {
    const seen: { bearings: number; radiiM?: number[] }[] = []
    const { deps } = makeStubDeps()
    const orig = deps.buildSamples
    deps.buildSamples = (c, o) => {
      seen.push({ ...(o as { bearings: number; radiiM?: number[] }) })
      return orig(c, o)
    }
    await runBatch({ ...req, maxPoints: 1, fast: false }, () => {}, deps)
    expect(seen[0]).toEqual({ bearings: 16 })
  })
  it('apiStats 跨点累计，单点报告为本点增量', async () => {
    const { report, calls } = await collect({ ...req, maxPoints: 4 })
    // 内层的 resetStats 被替换成空操作：只在批量开始时清零一次
    expect(calls.filter((c) => c === 'resetStats')).toHaveLength(1)
    const n = report.points.length
    expect(report.apiStats.routeMatrix).toBe(2 * n)
    expect(report.apiStats.placeSearch).toBe(10 * n)
    for (const r of report.reports) {
      expect(r.apiStats.routeMatrix).toBe(2)
      expect(r.apiStats.placeSearch).toBe(10)
    }
    expect(report.apiStats.elapsedMs).toBeGreaterThanOrEqual(0)
  })
})

describe('runBatch · 容错', () => {
  it('单点失败 emit error(recoverable=true, index) 后跳过，不中断整批', async () => {
    const { deps } = makeStubDeps()
    const orig = deps.buildSamples
    let n = 0
    deps.buildSamples = (c: LngLat, o: { bearings: number }): IsochroneSample[] => {
      if (n++ === 1) throw new Error('第二个点炸了')
      return orig(c, o)
    }
    const events: BatchEvent[] = []
    const report = await runBatch(req, (e) => events.push(e), deps)
    const errs = events.filter((e) => e.type === 'error') as Extract<
      BatchEvent,
      { type: 'error' }
    >[]
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatchObject({ recoverable: true, index: 1 })
    expect(errs[0].message).toContain('第二个点炸了')
    const plan = events[0] as Extract<BatchEvent, { type: 'plan' }>
    expect(report.points).toHaveLength(plan.points.length - 1)
    expect(report.points.map((p) => p.index)).not.toContain(1)
    expect(report.warnings[0]).toContain('1/')
    expect(events.at(-1)?.type).toBe('done')
  })
  it('内层降级（recoverable）不会打断，报告 dataSource=mixed 且 warnings 合并去重', async () => {
    const { report, events } = await collect({ ...req, maxPoints: 3 }, { routingThrows: true })
    expect(events.filter((e) => e.type === 'error')).toHaveLength(0)
    expect(report.dataSource).toBe('mixed')
    expect(report.warnings.filter((w) => w.includes('批量步行算路失败'))).toHaveLength(1)
  })
  it('无 AK 且附近没有批量样例 → error(recoverable=false) 并抛出', async () => {
    const { deps } = makeStubDeps({}, { hasAk: false })
    const events: BatchEvent[] = []
    await expect(runBatch(req, (e) => events.push(e), deps)).rejects.toThrow('未配置')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', recoverable: false })
  })
})

describe('runBatch · 批量样例回放', () => {
  let dir: string
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qj-batch-'))
    // 先用 stub 跑一份真实结构的报告，录成样例文件
    const { events, report } = await collect({ ...req, maxPoints: 5 })
    const file: BatchSampleFile = {
      slug: 'batch-test',
      name: '测试样例',
      description: '',
      center: CENTER,
      area: req.area,
      createdAt: '2026-09-08T00:00:00.000Z',
      batchEvents: events.filter((e) => e.type !== 'done'),
      report,
    }
    fs.writeFileSync(path.join(dir, 'batch-test.json'), JSON.stringify(file))
    // 一个远处的单点样例文件：批量加载器不该读它，单点回退也匹配不到（>3 km）
    fs.writeFileSync(
      path.join(dir, 'other.json'),
      JSON.stringify({ center: { lng: CENTER.lng + 1, lat: CENTER.lat }, events: [] })
    )
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('无 AK 时回放最近样例：事件顺序保留，dataSource=sample，warnings 带说明', async () => {
    const { deps } = makeStubDeps({}, { hasAk: false, samplesDir: dir })
    const events: BatchEvent[] = []
    const report = await runBatch(req, (e) => events.push(e), deps)
    expect(events[0].type).toBe('plan')
    expect(events.at(-1)?.type).toBe('done')
    expect(events.filter((e) => e.type === 'point')).toHaveLength(5)
    expect(report.dataSource).toBe('sample')
    expect(report.reports.every((r) => r.dataSource === 'sample')).toBe(true)
    expect(report.warnings[0]).toContain('测试样例')
    expect(report.warnings[0]).toContain('未配置百度服务端 AK')
  })
  it('区域中心离样例超过 3 km 不回放', async () => {
    const { deps } = makeStubDeps({}, { hasAk: false, samplesDir: dir })
    const far: BatchRequest = {
      area: { kind: 'circle', center: { lng: CENTER.lng + 0.05, lat: CENTER.lat }, radiusM: 800 },
    }
    await expect(runBatch(far, () => {}, deps)).rejects.toThrow('没有内置批量样例')
  })
  it('有 AK 但内层已退到单点样例（API 不可用）→ 整批改用批量样例', async () => {
    const { deps } = makeStubDeps(
      { reverseThrows: true, routingThrows: true, searchThrows: true },
      { allowSampleFallback: true, samplesDir: dir }
    )
    // 单点样例目录里没有可用的单点样例，内层会 fatal 抛出"API 暂不可用"
    const events: BatchEvent[] = []
    const report = await runBatch(req, (e) => events.push(e), deps)
    expect(report.dataSource).toBe('sample')
    expect(report.warnings[0]).toContain('API 暂不可用')
    // 只跑了第一个点就切换：只有 1 条 error，且随后是回放的 plan
    const firstErr = events.findIndex((e) => e.type === 'error')
    expect(firstErr).toBeGreaterThan(0)
    expect(events[firstErr + 1].type).toBe('plan')
  })
})

describe('批量 SSE 与 route 校验', () => {
  it('batchToSse 返回 event-stream，可解析回 plan…done', async () => {
    const { deps } = makeStubDeps()
    const res = batchToSse({ ...req, maxPoints: 2 }, deps)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const events = parseBatchSse(await res.text())
    expect(events[0].type).toBe('plan')
    expect(events.at(-1)?.type).toBe('done')
  })
  it('schema：半径 / 点数 / 间距 / 矩形对角线越界拒绝', () => {
    const ok = batchRequestSchema.safeParse(req)
    expect(ok.success).toBe(true)
    expect(
      batchRequestSchema.safeParse({ area: { kind: 'circle', center: CENTER, radiusM: 100 } })
        .success
    ).toBe(false)
    expect(batchRequestSchema.safeParse({ ...req, maxPoints: 26 }).success).toBe(false)
    expect(batchRequestSchema.safeParse({ ...req, spacingM: 100 }).success).toBe(false)
    const rectOk = batchRequestSchema.safeParse({
      area: { kind: 'rect', sw: CENTER, ne: { lng: CENTER.lng + 0.02, lat: CENTER.lat + 0.02 } },
    })
    expect(rectOk.success).toBe(true)
    const rectFar = batchRequestSchema.safeParse({
      area: { kind: 'rect', sw: CENTER, ne: { lng: CENTER.lng + 0.06, lat: CENTER.lat + 0.06 } },
    })
    expect(rectFar.success).toBe(false)
    const rectFlip = batchRequestSchema.safeParse({
      area: { kind: 'rect', sw: { lng: CENTER.lng + 0.01, lat: CENTER.lat }, ne: CENTER },
    })
    expect(rectFlip.success).toBe(false)
  })
  it('GET query 解析 lng/lat/radius/max 为圆形请求', () => {
    const r = parseBatchQuery(new URLSearchParams('lng=106.2277&lat=29.5921&radius=1500&max=16'))
    expect(r.success).toBe(true)
    if (r.success)
      expect(r.data).toEqual({
        area: { kind: 'circle', center: CENTER, radiusM: 1500 },
        maxPoints: 16,
      })
    expect(parseBatchQuery(new URLSearchParams('lng=abc')).success).toBe(false)
  })
  it('POST 非法 JSON / 非法字段 → 400；GET 缺参数 → 400', async () => {
    const bad = await batchPost(new Request('http://x/api/batch', { method: 'POST', body: '{x' }))
    expect(bad.status).toBe(400)
    const bad2 = await batchPost(
      new Request('http://x/api/batch', {
        method: 'POST',
        body: JSON.stringify({ area: { kind: 'circle', center: CENTER, radiusM: 9999 } }),
      })
    )
    expect(bad2.status).toBe(400)
    expect((await bad2.json()).error).toContain('radiusM')
    expect((await batchGet(new Request('http://x/api/batch?lng=106'))).status).toBe(400)
  })
  it('GET 合法请求（测试环境无 AK）→ 回放内置 batch-bishan 样例', async () => {
    if (process.env.BAIDU_SERVER_AK || !fs.existsSync('data/samples/batch-bishan.json')) return
    const res = await batchGet(
      new Request('http://x/api/batch?lng=106.2277&lat=29.5921&radius=1500&max=16')
    )
    expect(res.status).toBe(200)
    const events = parseBatchSse(await res.text())
    expect(events[0].type).toBe('plan')
    const done = events.at(-1)
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.report.dataSource).toBe('sample')
      expect(done.report.points.length).toBeGreaterThan(0)
    }
  })
})
