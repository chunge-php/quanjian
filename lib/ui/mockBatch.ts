/**
 * 街道级批量体检 · 假事件流（后端 /api/batch 未落地或 ?mock=1 / ?mockBatch=1 时使用）
 * 16 个网格点、分数 40~92 固定种子随机，中心 106.2277,29.5921（重庆璧山）。
 */
import type {
  AnalyzeStage,
  BatchEvent,
  BatchPointSummary,
  BatchReport,
  BatchRequest,
  FacilityCategory,
  HealthReport,
  LngLat,
} from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import { buildMockReport } from '@/lib/ui/mockReport'
import { areaKm2, planGrid } from '@/components/batch/batchGeo'

export const MOCK_BATCH_CENTER: LngLat = { lng: 106.2277, lat: 29.5921 }

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const STREETS = [
  '东林大道',
  '双星大道',
  '金剑路',
  '文风路',
  '黛山大道',
  '璧泉街',
  '南门街',
  '北街',
  '茅莱山路',
  '秀湖路',
  '剑山路',
  '中山路',
  '西山路',
  '汇文路',
  '青杠街',
  '御湖路',
]

const grade = (s: number): 'A' | 'B' | 'C' | 'D' =>
  s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : 'D'

const ESSENTIAL: ('market' | 'pharmacy' | 'primary_school')[] = [
  'market',
  'pharmacy',
  'primary_school',
]

function buildPoint(index: number, center: LngLat, rnd: () => number): BatchPointSummary {
  const score = Math.round(40 + rnd() * 52)
  // 分数越高硬指标越近：基础分钟 4~26
  const base = 4 + (1 - (score - 40) / 52) * 18
  const walk = (k: number) => {
    const m = Math.round(base * (0.7 + rnd() * 0.8) + k)
    return m > 24 && rnd() < 0.35 ? null : m
  }
  const essentialWalkMin = {
    market: walk(0),
    pharmacy: walk(-2),
    primary_school: walk(3),
  }
  const reachable = Object.fromEntries(
    FACILITY_CATEGORIES.map((c) => {
      if (ESSENTIAL.includes(c.key as (typeof ESSENTIAL)[number])) {
        const m = essentialWalkMin[c.key as (typeof ESSENTIAL)[number]]
        return [c.key, m != null && m <= 15]
      }
      const p = 0.25 + ((score - 40) / 52) * 0.7
      return [c.key, rnd() < p]
    })
  ) as Record<FacilityCategory, boolean>
  const street = STREETS[index % STREETS.length]
  const no = 20 + Math.round(rnd() * 180)
  return {
    index,
    center,
    address: `重庆市璧山区璧泉街道${street} ${no} 号`,
    overallScore: score,
    overallGrade: grade(score),
    isoAreaKm2: +(1.2 + rnd() * 1.6).toFixed(2),
    essentialWalkMin,
    blindInIso: Math.round(Math.max(0, (70 - score) / 5) * rnd() + (score < 55 ? 3 : 0)),
    reachable,
    reportId: `mock-batch-${index + 1}`,
  }
}

function buildPointReport(p: BatchPointSummary): HealthReport {
  const r = buildMockReport(p.center)
  const categories = r.categories.map((c) => {
    const ess = ESSENTIAL.find((k) => k === c.category)
    const nearestWalkMin = ess ? p.essentialWalkMin[ess] : c.nearestWalkMin
    const score = Math.max(
      0,
      Math.min(100, Math.round(c.score * (0.6 + (p.overallScore / 100) * 0.5)))
    )
    return { ...c, nearestWalkMin, score, grade: grade(score) }
  })
  return {
    ...r,
    id: p.reportId,
    center: p.center,
    address: { ...r.address, formatted: p.address },
    categories,
    overallScore: p.overallScore,
    overallGrade: p.overallGrade,
    blindSpots: r.blindSpots.slice(0, Math.max(p.blindInIso, 4)),
    warnings: ['当前为内置样例数据，非实时调用结果'],
  }
}

const CAT_LABEL = Object.fromEntries(FACILITY_CATEGORIES.map((c) => [c.key, c.label])) as Record<
  FacilityCategory,
  string
>

export function buildMockBatchReport(req: BatchRequest): {
  plan: { points: LngLat[]; spacingM: number; areaKm2: number }
  report: BatchReport
} {
  const spacingM = req.spacingM ?? 500
  const maxPoints = Math.min(25, req.maxPoints ?? 16)
  const grid = planGrid(req.area, spacingM, maxPoints)
  const rnd = seeded(20260908)
  const points = grid.map((c, i) => buildPoint(i, c, rnd))
  const reports = points.map(buildPointReport)
  const scores = points.map((p) => p.overallScore)
  const scoreAvg = Math.round(scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length))
  const ranked = points.slice().sort((a, b) => b.overallScore - a.overallScore)
  const coverageByCategory = FACILITY_CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    essential: c.essential,
    ratio: +(points.filter((p) => p.reachable[c.key]).length / Math.max(1, points.length)).toFixed(
      2
    ),
  }))
  const worstCov = coverageByCategory
    .filter((c) => c.essential)
    .sort((a, b) => a.ratio - b.ratio)[0]
  const worst3 = ranked.slice(-3).reverse()
  const belowC = points.filter((p) => p.overallScore < 50).length
  const km2 = areaKm2(req.area)
  const report: BatchReport = {
    id: `mock-batch-${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    area: req.area,
    areaKm2: +km2.toFixed(2),
    spacingM,
    points,
    reports,
    scoreAvg,
    scoreMax: Math.max(...scores),
    scoreMin: Math.min(...scores),
    coverageByCategory,
    worst: worst3.map((p) => p.index),
    best: ranked.slice(0, 3).map((p) => p.index),
    headline: [
      `${points.length} 个体检点平均 ${scoreAvg} 分，最高 ${Math.max(...scores)} 分、最低 ${Math.min(...scores)} 分，街道内部差距明显`,
      `${CAT_LABEL[worstCov.category]}覆盖最弱，只有 ${Math.round(worstCov.ratio * 100)}% 的点位 15 分钟内能走到`,
      belowC > 0
        ? `${belowC} 个点位综合评级为「差」，集中在范围${worst3.length ? '南侧与东侧' : ''}`
        : '没有评级为「差」的点位',
      `最差三点位于 ${worst3.map((p) => p.address.replace(/^.*街道/, '')).join('、')}`,
    ],
    suggestions: [
      {
        priority: 'high',
        text: `在${worst3[0]?.address.replace(/^.*街道/, '') ?? '范围南侧'}一带增设一处社区菜市场或生鲜超市，可让 ${Math.max(2, Math.round(points.length * (1 - worstCov.ratio) * 0.6))} 个点位补齐硬指标`,
        category: worstCov.category,
      },
      {
        priority: 'high',
        text: '范围东侧 3 个低分点位 1 公里内均无小学，建议结合新建居住区预留一处 18 班小学用地',
        category: 'primary_school',
      },
      {
        priority: 'medium',
        text: '沿主干道增设 2 处 24 小时药店，可覆盖当前步行超过 15 分钟的点位',
        category: 'pharmacy',
      },
      {
        priority: 'medium',
        text: '养老服务设施在全部点位中覆盖率不足一半，建议依托社区卫生服务中心增设日间照料点',
        category: 'elderly',
      },
      {
        priority: 'low',
        text: '打通范围内断头路与滨河步道，可使多个点位的 15 分钟圈面积扩大 15% 以上',
      },
    ],
    apiStats: {
      geocode: points.length,
      placeSearch: points.length * 10,
      routeMatrix: points.length * 4,
      routeMatrixPairs: points.length * 68,
      cacheHits: 22,
      rateLimited: 1,
      degraded: 3,
      elapsedMs: points.length * 5800,
    },
    dataSource: 'sample',
    warnings: ['当前为内置样例数据，非实时调用结果'],
  }
  return { plan: { points: grid, spacingM, areaKm2: +km2.toFixed(2) }, report }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

const STAGES: [AnalyzeStage, string][] = [
  ['routing', '8 方向步行算路'],
  ['poi_search', '检索十类设施'],
  ['scoring', '评分与盲区'],
]

/** 模拟 SSE：plan → 每点 3 条 progress + 1 条 point（第 7 点先报一次可恢复错误）→ done */
export async function runMockBatch(
  req: BatchRequest,
  emit: (ev: BatchEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const { plan, report } = buildMockBatchReport(req)
  emit({ type: 'plan', ...plan })
  await wait(350, signal)
  const total = report.points.length
  for (let i = 0; i < total; i++) {
    if (signal.aborted) return
    for (const [stage, message] of STAGES) {
      emit({ type: 'progress', index: i, total, stage, message })
      await wait(90, signal)
    }
    if (i === 6)
      emit({ type: 'error', message: '第 7 点批量算路限流，改用估算', recoverable: true, index: i })
    emit({ type: 'point', index: i, total, summary: report.points[i] })
    await wait(80, signal)
  }
  emit({ type: 'done', report })
}
