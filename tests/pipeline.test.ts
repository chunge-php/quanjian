/** runAnalysis：事件顺序、报告字段、各降级路径 */
import { describe, expect, it } from 'vitest'
import { runAnalysis } from '@/lib/pipeline/analyze'
import type { AnalyzeEvent, AnalyzeStage } from '@/lib/types'
import { CENTER, makeStubDeps } from './pipeline-stubs.test'

const ORDER: AnalyzeStage[] = [
  'geocode',
  'sampling',
  'routing',
  'isochrone',
  'poi_search',
  'poi_routing',
  'scoring',
  'blindspot',
  'done',
]

function stagesOf(events: AnalyzeEvent[]): AnalyzeStage[] {
  const out: AnalyzeStage[] = []
  for (const e of events)
    if (e.type === 'stage' && out[out.length - 1] !== e.stage) out.push(e.stage)
  return out
}
function errorsOf(events: AnalyzeEvent[]) {
  return events.filter((e): e is Extract<AnalyzeEvent, { type: 'error' }> => e.type === 'error')
}
async function run(faults = {}, req = { center: CENTER } as Parameters<typeof runAnalysis>[0]) {
  const { deps, calls } = makeStubDeps(faults)
  const events: AnalyzeEvent[] = []
  const report = await runAnalysis(req, (e) => events.push(e), deps)
  return { events, report, calls }
}

describe('runAnalysis 正常路径', () => {
  it('阶段顺序与 AnalyzeStage 一致，progress 单调递增到 100', async () => {
    const { events, report } = await run()
    expect(stagesOf(events)).toEqual(ORDER)
    const progress = events
      .filter((e) => e.type === 'stage')
      .map((e) => (e as { progress: number }).progress)
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1])
    expect(progress[progress.length - 1]).toBe(100)
    expect(events.at(-1)).toMatchObject({ type: 'done', report: { id: report.id } })
    expect(errorsOf(events)).toHaveLength(0)
  })

  it('partial 事件：isochrone 在 poi_search 之前，pois 在 scoring 之前', async () => {
    const { events } = await run()
    const idx = (pred: (e: AnalyzeEvent) => boolean) => events.findIndex(pred)
    const iIso = idx((e) => e.type === 'partial' && e.key === 'isochrone')
    const iPoiSearch = idx((e) => e.type === 'stage' && e.stage === 'poi_search')
    const iPois = idx((e) => e.type === 'partial' && e.key === 'pois')
    const iScoring = idx((e) => e.type === 'stage' && e.stage === 'scoring')
    expect(iIso).toBeGreaterThan(0)
    expect(iIso).toBeLessThan(iPoiSearch)
    expect(iPois).toBeLessThan(iScoring)
  })

  it('报告字段完整：live 来源、短 id、地址、圈内判定、apiStats 有耗时', async () => {
    const { report } = await run()
    expect(report.id).toMatch(/^[0-9a-f]{8}$/)
    expect(report.dataSource).toBe('live')
    expect(report.warnings).toEqual([])
    expect(report.address.district).toBe('璧山区')
    expect(report.center).toEqual(CENTER)
    expect(report.pois.length).toBe(10)
    // 300/600/900m 在 1080m 圈内，1200m 起在圈外
    expect(
      report.pois
        .filter((p) => p.inIsochrone)
        .map((p) => p.category)
        .sort()
    ).toEqual(['market', 'pharmacy', 'primary_school'])
    expect(report.pois.every((p) => p.walkSec != null && p.walkSource === 'api')).toBe(true)
    expect(report.isochrone.samples.every((s) => s.source === 'api' && s.walkSec != null)).toBe(
      true
    )
    expect(report.apiStats.routeMatrix).toBe(2)
    expect(report.apiStats.elapsedMs).toBeGreaterThanOrEqual(0)
    expect(report.categories).toHaveLength(10)
    expect(report.blindSpots).toHaveLength(1)
    expect(report.overallGrade).toMatch(/[ABCD]/)
  })

  it('带 address 时先地理编码再逆地理编码', async () => {
    const { calls, report } = await run(
      {},
      { center: { lng: 1, lat: 1 } as never, address: '璧山区璧泉街道' }
    )
    expect(calls.slice(0, 3)).toEqual(['resetStats', 'geocode', 'reverseGeocode'])
    expect(report.center).toEqual(CENTER)
  })

  it('bearings 传入生效（默认 16）', async () => {
    const a = await run({}, { center: CENTER, bearings: 8 })
    expect(a.report.isochrone.samples).toHaveLength(24)
    const b = await run()
    expect(b.report.isochrone.samples).toHaveLength(48)
  })
})

describe('runAnalysis 降级路径', () => {
  it('采样点算路失败 → error(recoverable) + 全估算 + mixed', async () => {
    const { events, report } = await run({ routingThrows: true })
    expect(stagesOf(events)).toEqual(ORDER)
    const errs = errorsOf(events)
    expect(errs).toHaveLength(1)
    expect(errs[0].recoverable).toBe(true)
    expect(
      report.isochrone.samples.every((s) => s.source === 'estimate' && s.walkSec != null)
    ).toBe(true)
    expect(report.dataSource).toBe('mixed')
    expect(report.warnings.some((w) => w.includes('算路失败'))).toBe(true)
    // POI 算路是第二次调用，不受影响
    expect(report.pois.every((p) => p.walkSource === 'api')).toBe(true)
  })

  it('POI 算路失败 → 直线估算，圈内判定仍按多边形', async () => {
    const { report } = await run({ poiRoutingThrows: true })
    expect(report.pois.every((p) => p.walkSource === 'estimate' && p.walkM != null)).toBe(true)
    expect(report.pois.filter((p) => p.inIsochrone)).toHaveLength(3)
    expect(report.dataSource).toBe('mixed')
  })

  it('整体检索失败 → pois 为空 + warning，流水线不中断', async () => {
    const { events, report } = await run({ searchThrows: true })
    expect(stagesOf(events)).toEqual(ORDER)
    expect(report.pois).toEqual([])
    expect(report.warnings.some((w) => w.includes('检索失败'))).toBe(true)
    expect(report.categories).toHaveLength(10)
  })

  it('逐类检索：单类失败仅该类为空', async () => {
    const { report, calls } = await run({ perCategory: true, categoryThrows: ['pharmacy'] })
    expect(calls.filter((c) => c.startsWith('searchCategory:'))).toHaveLength(10)
    expect(report.pois.some((p) => p.category === 'pharmacy')).toBe(false)
    expect(report.pois).toHaveLength(9)
    expect(report.warnings.some((w) => w.includes('药店'))).toBe(true)
    expect(report.dataSource).toBe('mixed')
  })

  it('逆地理编码失败 → 地址为空但继续', async () => {
    const { report } = await run({ reverseThrows: true })
    expect(report.address.formatted).toBe('')
    expect(report.warnings.some((w) => w.includes('逆地理编码'))).toBe(true)
  })

  it('等时圈/评分/盲区/综合全部崩溃也能出报告', async () => {
    const { events, report } = await run({
      isochroneThrows: true,
      scoringThrows: true,
      blindspotThrows: true,
      overallThrows: true,
    })
    expect(stagesOf(events)).toEqual(ORDER)
    expect(errorsOf(events).every((e) => e.recoverable)).toBe(true)
    expect(report.isochrone.rings).toHaveLength(3)
    expect(report.isochrone.rings[2].areaKm2).toBeGreaterThan(0)
    expect(report.categories).toEqual([])
    expect(report.blindSpots).toEqual([])
    expect(report.overallGrade).toBe('D')
    expect(report.warnings.length).toBe(4)
  })

  it('地址无法识别 → error(recoverable=false) 并抛出', async () => {
    const { deps } = makeStubDeps({ geocodeNull: true })
    const events: AnalyzeEvent[] = []
    await expect(
      runAnalysis({ center: CENTER, address: '不存在的地方' }, (e) => events.push(e), deps)
    ).rejects.toThrow('无法识别地址')
    expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false })
  })

  it('地理编码网络错误且不允许回退 → 致命错误', async () => {
    const { deps } = makeStubDeps({ geocodeThrows: true })
    const events: AnalyzeEvent[] = []
    await expect(
      runAnalysis({ center: CENTER, address: 'x' }, (e) => events.push(e), deps)
    ).rejects.toThrow('地理编码失败')
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1)
  })
})
