/** 街道级批量体检：汇总 summarizePoint / buildBatchReport */
import { describe, expect, it } from 'vitest'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import {
  buildBatchReport,
  coverageOf,
  mergeDataSource,
  shortAddress,
  summarizePoint,
} from '@/lib/batch/aggregate'
import { planGrid } from '@/lib/batch/grid'
import { emptyStats } from '@/lib/pipeline/util'
import type { BatchArea, CategoryScore, HealthReport, LngLat } from '@/lib/types'

const C: LngLat = { lng: 106.2277, lat: 29.5921 }
const area: BatchArea = { kind: 'circle', center: C, radiusM: 1500 }

/** 构造一份最小可用报告；walkMin 指定各类别最近步行分钟（缺省 5，null=没有） */
function fakeReport(
  opts: {
    score?: number
    center?: LngLat
    street?: string
    walkMin?: Partial<Record<string, number | null>>
    blindInIso?: number
    dataSource?: HealthReport['dataSource']
    warnings?: string[]
  } = {}
): HealthReport {
  const categories: CategoryScore[] = FACILITY_CATEGORIES.map((c) => {
    const m = opts.walkMin && c.key in opts.walkMin ? opts.walkMin[c.key]! : 5
    return {
      category: c.key,
      label: c.label,
      essential: c.essential,
      countInIsochrone: m !== null && m <= 15 ? 1 : 0,
      countWithin1km: m !== null && m <= 15 ? 1 : 0,
      nearestWalkMin: m,
      score: m === null ? 0 : 80,
      grade: 'B',
      diagnosis: '',
    }
  })
  const score = opts.score ?? 70
  const center = opts.center ?? C
  return {
    id: `r-${score}`,
    generatedAt: '',
    center,
    address: { formatted: `重庆市璧山区璧泉街道${opts.street ?? '东林大道'}`, street: '璧泉街道' },
    isochrone: {
      center,
      rings: [{ minutes: 15, polygon: { type: 'Polygon', coordinates: [[]] }, areaKm2: 1.234 }],
      samples: [],
      reachRadiusByBearing: [],
      equivalentRadiusM: 600,
      circularity: 1,
    },
    pois: [],
    categories,
    blindSpots: Array.from({ length: opts.blindInIso ?? 0 }, () => ({
      center,
      sizeM: 200,
      missing: ['market'],
      severity: 1 / 3,
      inIsochrone: true,
    })),
    overallScore: score,
    overallGrade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D',
    headline: [],
    suggestions: [],
    apiStats: emptyStats(),
    dataSource: opts.dataSource ?? 'live',
    warnings: opts.warnings ?? [],
  }
}

describe('summarizePoint', () => {
  it('压缩硬指标步行分钟、圈内盲区数、可达性', () => {
    const s = summarizePoint(3, fakeReport({ walkMin: { market: 20, bank: null }, blindInIso: 4 }))
    expect(s.index).toBe(3)
    expect(s.isoAreaKm2).toBe(1.234)
    expect(s.essentialWalkMin).toEqual({ market: 20, pharmacy: 5, primary_school: 5 })
    expect(s.blindInIso).toBe(4)
    expect(s.reachable.market).toBe(false)
    expect(s.reachable.bank).toBe(false)
    expect(s.reachable.pharmacy).toBe(true)
    expect(s.address).toContain('东林大道')
  })
  it('shortAddress 去掉省市区街道前缀', () => {
    expect(shortAddress('重庆市璧山区璧泉街道东林大道 88 号')).toBe('东林大道 88 号')
    expect(shortAddress('四川省成都市武侯区凝山路')).toBe('凝山路')
    expect(shortAddress('', '第 7 点')).toBe('第 7 点')
  })
})

describe('buildBatchReport', () => {
  const plan = planGrid(area, 500, 25)
  it('覆盖率 = 该类别 15 分钟内可达的点位占比', () => {
    const reports = [
      fakeReport({ walkMin: { market: 20 } }),
      fakeReport({ walkMin: { market: 10 } }),
      fakeReport({ walkMin: { market: null } }),
      fakeReport({ walkMin: { market: 15 } }),
    ]
    const cov = coverageOf(reports.map((r, i) => summarizePoint(i, r)))
    expect(cov.find((c) => c.category === 'market')?.ratio).toBe(0.5)
    expect(cov.find((c) => c.category === 'pharmacy')?.ratio).toBe(1)
  })
  it('worst/best 各 3 个 index，分数统计正确', () => {
    const scores = [71, 92, 48, 60, 85, 77]
    const reports = scores.map((s, i) => fakeReport({ score: s, street: `路${i}` }))
    const r = buildBatchReport(area, plan, reports, emptyStats(), 1234)
    expect(r.scoreAvg).toBe(Math.round(433 / 6))
    expect(r.scoreMax).toBe(92)
    expect(r.scoreMin).toBe(48)
    expect(r.worst).toEqual([2, 3, 0])
    expect(r.best).toEqual([1, 4, 5])
    expect(r.points).toHaveLength(6)
    expect(r.reports).toHaveLength(6)
    expect(r.apiStats.elapsedMs).toBe(1234)
    expect(r.dataSource).toBe('live')
  })
  it('失败点位为 null：index 保持网格序号，warnings 注明跳过', () => {
    const r = buildBatchReport(
      area,
      plan,
      [fakeReport({ score: 60 }), null, fakeReport({ score: 90 })],
      emptyStats(),
      0
    )
    expect(r.points.map((p) => p.index)).toEqual([0, 2])
    expect(r.worst).toEqual([0, 2])
    expect(r.warnings[0]).toContain('1/3 个点位体检失败')
  })
  it('headline ≤4 条且带数字：平均分 / 最好最差 / 最短板 / 盲区最多', () => {
    const reports = [
      fakeReport({ score: 92, street: '东林大道', walkMin: { market: 20 } }),
      fakeReport({ score: 48, street: '凝山路', walkMin: { market: 30 }, blindInIso: 20 }),
      fakeReport({ score: 73, street: '金剑路', walkMin: { market: 5 }, blindInIso: 2 }),
    ]
    const r = buildBatchReport(area, plan, reports, emptyStats(), 0)
    expect(r.headline.length).toBeLessThanOrEqual(4)
    expect(r.headline[0]).toBe('3 个点平均 71 分，最好 92（东林大道），最差 48（凝山路）')
    expect(r.headline[1]).toContain('菜市场 15 分钟可达的点位只有 33%')
    expect(r.headline[1]).toContain('最短板')
    expect(r.headline[2]).toBe('圈内盲区最多的是第 2 点（凝山路），20 格')
    expect(r.headline[3]).toContain('1 个点位为 D 级')
  })
  it('建议：硬指标可达率 <60% 为 high，加分项为 medium，文案含方位与距离', () => {
    const east = { lng: C.lng + 0.01, lat: C.lat } // 约 970 m 正东
    const reports = [
      fakeReport({ center: C, walkMin: { market: 5, park: null, bank: null } }),
      fakeReport({ center: east, walkMin: { market: null, park: null } }),
      fakeReport({ center: east, walkMin: { market: 25, park: null } }),
    ]
    const r = buildBatchReport(area, plan, reports, emptyStats(), 0)
    // 银行只有 1/3 不可达（可达率 67%）→ 不给建议；不可达点位就在中心 → 若给建议会写"区域中心附近"
    expect(r.suggestions.find((s) => s.category === 'bank')).toBeUndefined()
    const market = r.suggestions.find((s) => s.category === 'market')
    const park = r.suggestions.find((s) => s.category === 'park')
    expect(market?.priority).toBe('high')
    expect(park?.priority).toBe('medium')
    expect(market?.text).toContain('菜市场 15 分钟可达率仅 33%')
    expect(market?.text).toMatch(/在区域中心东方向约 \d+ 米附近增设一处菜市场/)
    // 三个点都不可达，质心在中心偏东约 650 m
    expect(park?.text).toMatch(/建议在区域中心东方向约 \d+ 米附近增设一处公园绿地/)
    expect(r.suggestions.find((s) => s.category === 'pharmacy')).toBeUndefined()
    expect(r.suggestions[0].priority).toBe('high')
  })
  it('dataSource 合并与 warnings 去重', () => {
    expect(mergeDataSource(['live', 'live'])).toBe('live')
    expect(mergeDataSource(['live', 'mixed'])).toBe('mixed')
    expect(mergeDataSource(['mixed', 'sample'])).toBe('sample')
    const r = buildBatchReport(
      area,
      plan,
      [
        fakeReport({ warnings: ['a', 'b'], dataSource: 'mixed' }),
        fakeReport({ warnings: ['b', 'c'] }),
      ],
      emptyStats(),
      0
    )
    expect(r.warnings).toEqual(['a', 'b', 'c'])
    expect(r.dataSource).toBe('mixed')
  })
  it('没有任何成功点位也不崩溃', () => {
    const r = buildBatchReport(area, plan, [null, null], emptyStats(), 0)
    expect(r.points).toEqual([])
    expect(r.scoreAvg).toBe(0)
    expect(r.headline[0]).toContain('没有任何点位体检成功')
    expect(r.suggestions).toEqual([])
    expect(r.dataSource).toBe('mixed')
  })
})
