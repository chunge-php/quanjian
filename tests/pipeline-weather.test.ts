/** 天气旁路：成功带回、失败静默、超时不阻塞、未注入不调用 */
import { describe, expect, it } from 'vitest'
import { runAnalysis, WEATHER_WAIT_MS } from '@/lib/pipeline/analyze'
import type { AnalyzeEvent } from '@/lib/types'
import { CENTER, makeStubDeps, STUB_WEATHER, type StubFaults } from './pipeline-stubs.test'

async function run(faults: StubFaults = {}) {
  const { deps, calls } = makeStubDeps(faults)
  const events: AnalyzeEvent[] = []
  const t0 = Date.now()
  const report = await runAnalysis({ center: CENTER }, (e) => events.push(e), deps)
  return { events, report, calls, elapsed: Date.now() - t0 }
}
const errorsOf = (events: AnalyzeEvent[]) => events.filter((e) => e.type === 'error')

describe('runAnalysis 天气旁路', () => {
  it('天气可用时挂到 report.weather，不改动 apiStats 与 warnings', async () => {
    const { report, calls } = await run()
    expect(calls).toContain('weather')
    expect(report.weather).toEqual(STUB_WEATHER)
    expect(report.warnings).toEqual([])
    expect(report.dataSource).toBe('live')
    // 天气不计入统计：geocode 只有逆地理编码那 1 次
    expect(report.apiStats.geocode).toBe(1)
  })

  it('天气接口抛错：静默降级，无 error 事件、无 warning、评分不受影响', async () => {
    const ok = await run()
    const { report, events } = await run({ weatherThrows: true })
    expect(report.weather).toBeUndefined()
    expect(errorsOf(events)).toHaveLength(0)
    expect(report.warnings).toEqual([])
    expect(report.dataSource).toBe('live')
    expect(report.overallScore).toBe(ok.report.overallScore)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('天气接口过慢：最多等 WEATHER_WAIT_MS，报告照常 done 且不带天气', async () => {
    const { report, events, elapsed } = await run({ weatherDelayMs: WEATHER_WAIT_MS + 2000 })
    expect(report.weather).toBeUndefined()
    expect(errorsOf(events)).toHaveLength(0)
    expect(elapsed).toBeLessThan(WEATHER_WAIT_MS + 800)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('未注入 weather 依赖：不调用、字段缺省', async () => {
    const { report, calls } = await run({ noWeather: true })
    expect(calls).not.toContain('weather')
    expect(report.weather).toBeUndefined()
  })
})
