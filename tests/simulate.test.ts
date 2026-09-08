import { describe, expect, it } from 'vitest'
import type { HealthReport, Poi } from '@/lib/types'
import { buildIsochrone, buildSamples, haversineM, offsetMeters } from '@/lib/isochrone'
import {
  buildOverall,
  detectBlindSpots,
  scoreCategories,
  summarizeBlindSpots,
  walkMinutesOf,
} from '@/lib/report'
import {
  applyVirtualFacilities,
  describeVirtuals,
  isVirtualPoi,
  virtualLabel,
  virtualPosition,
  virtualToPoi,
  type VirtualFacility,
} from '@/lib/ui/simulate'

const C = { lng: 121.4737, lat: 31.2304 }
const iso = buildIsochrone(
  C,
  buildSamples(C).map((s) => ({ ...s, walkSec: s.radiusM / 1.2, source: 'api' as const }))
)

function poi(category: Poi['category'], dx: number, dy: number): Poi {
  const location = offsetMeters(C, dx, dy)
  return {
    uid: `${category}-${dx}-${dy}`,
    name: category,
    category,
    location,
    straightM: haversineM(C, location),
    walkM: null,
    walkSec: null,
    walkSource: 'estimate',
    inIsochrone: haversineM(C, location) < 1000,
  }
}

/** 药店 + 小学密铺，菜市场只有东侧 1400 m 一处（中心附近为菜市场盲区） */
function scenarioPois(): Poi[] {
  const out: Poi[] = []
  for (const c of ['pharmacy', 'primary_school'] as const)
    for (let dx = -1500; dx <= 1500; dx += 500)
      for (let dy = -1500; dy <= 1500; dy += 500) out.push(poi(c, dx, dy))
  out.push(poi('market', 1400, 0))
  return out
}

function makeReport(pois: Poi[]): HealthReport {
  const categories = scoreCategories(pois, iso)
  const blindSpots = detectBlindSpots(C, pois, iso)
  const overall = buildOverall(categories, summarizeBlindSpots(blindSpots), iso)
  return {
    id: 'r1',
    generatedAt: '2026-09-08T00:00:00.000Z',
    center: C,
    address: { formatted: '测试地址' },
    isochrone: iso,
    pois,
    categories,
    blindSpots,
    ...overall,
    apiStats: {
      geocode: 0,
      placeSearch: 0,
      routeMatrix: 0,
      routeMatrixPairs: 0,
      cacheHits: 0,
      rateLimited: 0,
      degraded: 0,
      elapsedMs: 0,
    },
    dataSource: 'sample',
    warnings: ['原有提示'],
  }
}

function virtual(
  category: VirtualFacility['category'],
  dx: number,
  dy: number,
  extra: Partial<VirtualFacility> = {}
): VirtualFacility {
  return {
    id: `${category}-${dx}-${dy}`,
    category,
    location: offsetMeters(C, dx, dy),
    walkSec: null,
    walkM: null,
    source: 'estimate',
    ...extra,
  }
}

describe('applyVirtualFacilities', () => {
  const base = makeReport(scenarioPois())

  it('没有拟建设施：前后完全一致，headline 提示先放置', () => {
    const { report, diff } = applyVirtualFacilities(base, [])
    expect(diff.overallBefore).toBe(diff.overallAfter)
    expect(diff.blindBefore).toBe(diff.blindAfter)
    expect(diff.categories).toEqual([])
    expect(diff.headline).toContain('尚未放置')
    expect(report.pois).toHaveLength(base.pois.length)
    expect(report.warnings).toEqual(['原有提示'])
  })

  it('在中心新建菜市场：盲区减少、菜市场分数上升、综合分上升、步行分钟下降', () => {
    const { report, diff } = applyVirtualFacilities(base, [
      virtual('market', 0, 0, { walkSec: 60, walkM: 80, source: 'api' }),
    ])
    expect(diff.blindBefore).toBeGreaterThan(0)
    expect(diff.blindAfter).toBeLessThan(diff.blindBefore)
    expect(diff.blindInIsoAfter).toBeLessThan(diff.blindInIsoBefore)
    expect(diff.overallAfter).toBeGreaterThan(diff.overallBefore)
    const m = diff.categories.find((c) => c.category === 'market')!
    expect(m).toBeDefined()
    expect(m.scoreAfter).toBeGreaterThan(m.scoreBefore)
    expect(m.walkMinAfter!).toBeLessThan(m.walkMinBefore!)
    expect(m.walkMinAfter).toBe(1)
    expect(report.overallScore).toBe(diff.overallAfter)
    expect(report.overallGrade).toBe(diff.gradeAfter)
    expect(diff.headline).toContain('新建一处菜市场后')
    expect(diff.headline).toContain(`综合 ${diff.overallBefore} → ${diff.overallAfter}`)
    expect(diff.headline).toContain(`消除 ${diff.blindBefore - diff.blindAfter} 个盲区网格`)
    expect(diff.headline).toContain('菜市场最近步行')
  })

  it('圈外远点（东 3000 m）：inIsochrone=false，圈内数量与盲区计数都不变', () => {
    const far = virtual('market', 3000, 0)
    const { report, diff } = applyVirtualFacilities(base, [far])
    const vp = report.pois.find(isVirtualPoi)!
    expect(vp.inIsochrone).toBe(false)
    const before = base.categories.find((c) => c.category === 'market')!
    const after = report.categories.find((c) => c.category === 'market')!
    expect(after.countInIsochrone).toBe(before.countInIsochrone)
    expect(diff.blindAfter).toBe(diff.blindBefore)
    expect(diff.blindInIsoAfter).toBe(diff.blindInIsoBefore)
    expect(diff.headline).toContain('盲区网格数不变')
  })

  it('只列有变化的类别：新建药店（已密铺）不改分数时不出现在 categories', () => {
    const { diff } = applyVirtualFacilities(base, [virtual('pharmacy', 2000, 2000)])
    expect(diff.categories.find((c) => c.category === 'pharmacy')).toBeUndefined()
    expect(diff.categories.find((c) => c.category === 'market')).toBeUndefined()
  })

  it('不修改入参；warnings 追加模拟说明；dataSource / id 不变', () => {
    const poisBefore = base.pois.length
    const blindRef = base.blindSpots
    const { report } = applyVirtualFacilities(base, [
      virtual('market', 100, 0),
      virtual('pharmacy', -100, 0),
    ])
    expect(base.pois).toHaveLength(poisBefore)
    expect(base.blindSpots).toBe(blindRef)
    expect(report.pois).toHaveLength(poisBefore + 2)
    expect(report.warnings).toEqual(['原有提示', '含 2 处拟建设施（模拟）'])
    expect(report.dataSource).toBe('sample')
    expect(report.id).toBe('r1')
    expect(report.blindSpots).not.toBe(blindRef)
  })

  it('幂等：把模拟结果再传回来不会重复计入拟建 Poi', () => {
    const vs = [virtual('market', 0, 0)]
    const first = applyVirtualFacilities(base, vs)
    const second = applyVirtualFacilities(first.report, vs)
    expect(second.report.pois.filter(isVirtualPoi)).toHaveLength(1)
    expect(second.report.pois).toHaveLength(first.report.pois.length)
    expect(second.report.warnings.filter((w) => w.includes('拟建'))).toHaveLength(1)
    expect(second.diff.overallAfter).toBe(first.diff.overallAfter)
  })

  it('多处设施：headline 用"N 处设施（类别 ×n）"，并出现评级变化', () => {
    const vs = [virtual('market', 0, 0), virtual('market', 400, 400), virtual('pharmacy', 0, 200)]
    const { diff } = applyVirtualFacilities(base, vs)
    expect(describeVirtuals(vs)).toBe('菜市场 ×2、药店 ×1')
    expect(diff.headline).toContain('新建 3 处设施（菜市场 ×2、药店 ×1）后')
    if (diff.gradeAfter !== diff.gradeBefore)
      expect(diff.headline).toContain(`${diff.gradeBefore} → ${diff.gradeAfter}`)
  })
})

describe('virtualToPoi / virtualLabel / virtualPosition', () => {
  const base = makeReport(scenarioPois())

  it('uid 以 virtual: 开头，同类别按顺序编号 ①②，straightM 为大圆距离', () => {
    const vs = [virtual('market', 300, 0), virtual('pharmacy', 0, 300), virtual('market', 0, -600)]
    const p0 = virtualToPoi(vs[0], vs, base)
    const p2 = virtualToPoi(vs[2], vs, base)
    expect(p0.uid.startsWith('virtual:')).toBe(true)
    expect(p0.name).toBe('拟建菜市场 ①')
    expect(virtualLabel(vs[1], vs)).toBe('拟建药店 ①')
    expect(p2.name).toBe('拟建菜市场 ②')
    expect(p0.straightM).toBeCloseTo(300, 0)
    expect(p0.inIsochrone).toBe(true)
  })

  it('walkSec 为 null 时 walkSource=estimate 且评分按直线估算；有 API 值时原样保留', () => {
    const est = virtualToPoi(virtual('market', 600, 0), [], base)
    expect(est.walkSource).toBe('estimate')
    expect(est.walkSec).toBeNull()
    expect(walkMinutesOf(est)).toBeGreaterThan(5)
    const api = virtualToPoi(
      virtual('market', 600, 0, { walkSec: 420, walkM: 700, source: 'api' }),
      [],
      base
    )
    expect(api.walkSec).toBe(420)
    expect(api.walkM).toBe(700)
    expect(api.walkSource).toBe('api')
  })

  it('方位与距离：东北 700 m；中心附近显示"中心"', () => {
    const p = virtualPosition(virtual('market', 500, 500), C)
    expect(p.direction).toBe('东北')
    expect(p.distM).toBeCloseTo(707, -1)
    expect(virtualPosition(virtual('market', 0, 0), C).direction).toBe('中心')
  })
})
