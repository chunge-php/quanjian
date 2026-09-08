import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { HealthReport } from '@/lib/types'
import { buildComparison } from '@/lib/ui/compare'
import { buildMockReport } from '@/lib/ui/mockReport'
import {
  blindDirRows,
  blindSummary,
  reachRows,
  strongWeak,
  walkerVerdict,
} from '@/lib/ui/compareRows'
import {
  explainCompareBlind,
  explainCompareEssentials,
  explainCompareIso,
  explainCompareMap,
  explainCompareRadar,
  explainCompareScores,
  explainCompareSuggestions,
  explainCompareTable,
  explainCompareWalk,
  readerSummary,
} from '@/lib/ui/compareExplain'

function sampleReport(): HealthReport {
  const raw = JSON.parse(readFileSync('data/samples/bishan-biquan.json', 'utf8')) as {
    events: { type: string; report?: HealthReport }[]
  }
  return raw.events.find((e) => e.type === 'done')!.report!
}

describe('对比 PDF 派生数据与说明', () => {
  const a = sampleReport()
  const b = buildMockReport({ lng: 106.24, lat: 29.6 })
  const c = buildComparison(a, b)

  it('reachRows：与 A 的方向数一致，含中文方位与差值', () => {
    const rows = reachRows(c)
    expect(rows).toHaveLength(a.isochrone.reachRadiusByBearing.length)
    for (const r of rows) {
      expect(r.dir).toMatch(/^[东南西北]+$/)
      expect(r.diff).toBe(r.b - r.a)
    }
  })

  it('strongWeak / blindSummary / blindDirRows', () => {
    const sw = strongWeak(a)
    expect(sw.strong).toHaveLength(3)
    expect(sw.weak).toHaveLength(3)
    expect(sw.strong[0].score).toBeGreaterThanOrEqual(sw.weak[0].score)
    const s = blindSummary(a)
    expect(s.total).toBe(a.blindSpots.length)
    expect(s.inner).toBeLessThanOrEqual(s.total)
    expect(s.areaKm2).toBeCloseTo(a.blindSpots.length * 0.04, 6)
    const rows = blindDirRows(c)
    for (const r of rows) expect(r.a || r.b).toBeTruthy()
  })

  it('walkerVerdict 给出赢家与至多三类差距', () => {
    const v = walkerVerdict(c)
    expect(['A', 'B', 'tie']).toContain(v.winner)
    expect(v.top.length).toBeLessThanOrEqual(3)
  })

  it('每节说明都把真实数字写进句子', () => {
    const texts = [
      explainCompareMap(c),
      explainCompareScores(c),
      explainCompareRadar(c),
      explainCompareWalk(c),
      explainCompareTable(c),
      explainCompareEssentials(c),
      explainCompareIso(c),
      explainCompareBlind(c),
      explainCompareSuggestions(c),
      readerSummary(c),
    ]
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(20)
      expect(t).toMatch(/\d/)
    }
    expect(explainCompareScores(c)).toContain(String(Math.abs(c.scoreDiff)))
    expect(explainCompareIso(c)).toContain(String(Math.round(a.isochrone.equivalentRadiusM)))
    expect(readerSummary(c)).toMatch(/步行生活/)
  })
})
