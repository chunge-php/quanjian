/**
 * 圈见 · 街道级批量体检的汇总（纯函数）
 *
 * summarizePoint：把单点完整报告压成 BatchPointSummary（给 point 事件与列表用）。
 * buildBatchReport：把全部点位报告汇成街道级结论——分数统计、各类别 15 分钟可达率、
 * 最好 / 最差点、带数字的中文结论、按类别的增设建议（方位 + 距离取自"不可达点位质心"）。
 */
import { FACILITY_CATEGORIES } from '@/lib/categories'
import type {
  ApiStats,
  BatchArea,
  BatchPointSummary,
  BatchReport,
  FacilityCategory,
  HealthReport,
  LngLat,
} from '@/lib/types'
import { bearingBetween, centroidOf, haversineM } from '@/lib/isochrone/geo'
import { bearingToChinese, ceilTo100, formatPercent } from '@/lib/report/format'
import { shortId } from '@/lib/pipeline/util'
import { areaCenter, type GridPlan } from './grid'

type Suggestion = BatchReport['suggestions'][number]
type Essential = keyof BatchPointSummary['essentialWalkMin']

/** 15 分钟可达阈值（分钟） */
export const REACH_MIN = 15
/** 可达率低于此值即给出增设建议 */
export const COVERAGE_WARN_RATIO = 0.6

const PRIORITY_ORDER: Record<Suggestion['priority'], number> = { high: 0, medium: 1, low: 2 }

/** 15 分钟环面积（无环时 0） */
function isoArea(report: HealthReport): number {
  const r = report.isochrone.rings.find((x) => x.minutes === 15) ?? report.isochrone.rings.at(-1)
  return r ? Math.round(r.areaKm2 * 1000) / 1000 : 0
}

/**
 * 把单点报告压成摘要。
 * @param index 该点在网格计划中的序号（从 0 起）
 */
export function summarizePoint(index: number, report: HealthReport): BatchPointSummary {
  const byCat = new Map(report.categories.map((c) => [c.category, c]))
  const walkMin = (k: FacilityCategory): number | null => byCat.get(k)?.nearestWalkMin ?? null
  const reachable = Object.fromEntries(
    FACILITY_CATEGORIES.map((c) => {
      const m = walkMin(c.key)
      return [c.key, m !== null && m <= REACH_MIN]
    })
  ) as Record<FacilityCategory, boolean>
  return {
    index,
    center: report.center,
    address: report.address.formatted || report.address.street || '',
    overallScore: report.overallScore,
    overallGrade: report.overallGrade,
    isoAreaKm2: isoArea(report),
    essentialWalkMin: {
      market: walkMin('market'),
      pharmacy: walkMin('pharmacy'),
      primary_school: walkMin('primary_school'),
    },
    blindInIso: report.blindSpots.filter((b) => b.inIsochrone).length,
    reachable,
    reportId: report.id,
  }
}

/**
 * 地址去掉省市区街道前缀，只留路名 / 小区名，用于结论里的括号标注。
 * 例："重庆市璧山区璧泉街道东林大道 88 号" → "东林大道 88 号"。
 */
export function shortAddress(addr: string, fallback = ''): string {
  const s = addr
    .replace(/^[^省市区县]{1,10}(?:省|自治区)/, '')
    .replace(/^[^市区县]{1,10}市/, '')
    .replace(/^[^区县]{1,10}(?:区|县|自治县)/, '')
    .replace(/^[^街道镇乡]{1,10}(?:街道|镇|乡)/, '')
    .trim()
  const picked = s || addr.trim() || fallback
  return picked.length > 14 ? `${picked.slice(0, 14)}…` : picked
}

/** 点位标签："东林大道 88 号"，无地址时"第 N 点" */
export function pointLabel(p: BatchPointSummary): string {
  return shortAddress(p.address, `第 ${p.index + 1} 点`)
}

/** 合并数据来源：含 sample → sample，含 mixed → mixed，全 live → live；无报告按 mixed */
export function mergeDataSource(list: HealthReport['dataSource'][]): BatchReport['dataSource'] {
  if (list.length === 0) return 'mixed'
  if (list.includes('sample')) return 'sample'
  if (list.includes('mixed')) return 'mixed'
  return 'live'
}

/** 各类别 15 分钟可达率 */
export function coverageOf(points: BatchPointSummary[]): BatchReport['coverageByCategory'] {
  return FACILITY_CATEGORIES.map((c) => {
    const n = points.filter((p) => p.reachable[c.key]).length
    const ratio = points.length === 0 ? 0 : Math.round((n / points.length) * 1000) / 1000
    return { category: c.key, label: c.label, essential: c.essential, ratio }
  })
}

function buildHeadline(
  points: BatchPointSummary[],
  coverage: BatchReport['coverageByCategory'],
  avg: number
): string[] {
  if (points.length === 0) return ['没有任何点位体检成功，无法给出街道级结论']
  const out: string[] = []
  const byScore = [...points].sort((a, b) => b.overallScore - a.overallScore)
  const best = byScore[0]
  const worst = byScore[byScore.length - 1]
  out.push(
    points.length === 1
      ? `仅 1 个点位，综合 ${best.overallScore} 分（${pointLabel(best)}）`
      : `${points.length} 个点平均 ${avg} 分，最好 ${best.overallScore}（${pointLabel(best)}），最差 ${worst.overallScore}（${pointLabel(worst)}）`
  )

  const essential = coverage.filter((c) => c.essential)
  const weakest = [...essential].sort((a, b) => a.ratio - b.ratio)[0]
  if (weakest && weakest.ratio < 1) {
    const n = points.filter((p) => p.reachable[weakest.category]).length
    out.push(
      `${weakest.label} 15 分钟可达的点位只有 ${formatPercent(weakest.ratio)}（${n}/${points.length}），是最短板`
    )
  } else if (essential.length > 0) {
    out.push(`菜市场、药店、小学三项硬指标在全部 ${points.length} 个点位 15 分钟内均可达`)
  }

  const blindTop = [...points].sort((a, b) => b.blindInIso - a.blindInIso)[0]
  if (blindTop && blindTop.blindInIso > 0)
    out.push(
      `圈内盲区最多的是第 ${blindTop.index + 1} 点（${pointLabel(blindTop)}），${blindTop.blindInIso} 格`
    )
  else out.push('各点位 15 分钟圈内均未发现硬指标盲区')

  const dCount = points.filter((p) => p.overallGrade === 'D').length
  const aCount = points.filter((p) => p.overallGrade === 'A').length
  if (dCount > 0) out.push(`${dCount} 个点位为 D 级，需优先补短板`)
  else if (aCount > 0) out.push(`${aCount}/${points.length} 个点位达到 A 级`)
  return out.slice(0, 4)
}

/** "在区域中心东北方向约 600 米附近" 这类方位描述 */
function whereToAdd(regionCenter: LngLat, unreachable: LngLat[]): string {
  const c = centroidOf(unreachable)
  if (!c) return '在区域中心附近'
  const dist = haversineM(regionCenter, c)
  if (dist < 100) return '在区域中心附近'
  return `在区域中心${bearingToChinese(bearingBetween(regionCenter, c))}方向约 ${ceilTo100(dist)} 米附近`
}

function buildSuggestions(
  points: BatchPointSummary[],
  coverage: BatchReport['coverageByCategory'],
  regionCenter: LngLat
): Suggestion[] {
  const out: Suggestion[] = []
  for (const c of coverage) {
    if (points.length === 0 || c.ratio >= COVERAGE_WARN_RATIO) continue
    const missing = points.filter((p) => !p.reachable[c.category])
    const where = whereToAdd(
      regionCenter,
      missing.map((p) => p.center)
    )
    out.push({
      priority: c.essential ? 'high' : 'medium',
      category: c.category,
      text: `${c.label} 15 分钟可达率仅 ${formatPercent(c.ratio)}（${missing.length}/${points.length} 个点位不可达），建议${where}增设一处${c.label}`,
    })
  }
  return out.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

/** 最差 / 最好各取 3 个 index（并列时序号小的在前） */
function rank(points: BatchPointSummary[], dir: 'worst' | 'best'): number[] {
  const sign = dir === 'worst' ? 1 : -1
  return [...points]
    .sort((a, b) => sign * (a.overallScore - b.overallScore) || a.index - b.index)
    .slice(0, 3)
    .map((p) => p.index)
}

/**
 * 汇总街道级报告。
 * @param area 区域
 * @param plan 网格计划（reports 与 plan.points 一一对应，失败的点位为 null）
 * @param reports 各点报告（null = 该点失败被跳过）
 * @param apiStats 整批的 API 累计统计
 * @param elapsedMs 整批耗时
 */
export function buildBatchReport(
  area: BatchArea,
  plan: GridPlan,
  reports: (HealthReport | null)[],
  apiStats: ApiStats,
  elapsedMs: number
): BatchReport {
  const points: BatchPointSummary[] = []
  const ok: HealthReport[] = []
  reports.forEach((r, i) => {
    if (!r) return
    points.push(summarizePoint(i, r))
    ok.push(r)
  })
  const scores = points.map((p) => p.overallScore)
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
  const coverage = coverageOf(points)
  const warnings = [...new Set(ok.flatMap((r) => r.warnings))]
  const failed = reports.length - ok.length
  if (failed > 0) warnings.unshift(`${failed}/${reports.length} 个点位体检失败，已跳过`)

  return {
    id: shortId(),
    generatedAt: new Date().toISOString(),
    area,
    areaKm2: Math.round(plan.areaKm2 * 1000) / 1000,
    spacingM: plan.spacingM,
    points,
    reports: ok,
    scoreAvg: avg,
    scoreMax: scores.length ? Math.max(...scores) : 0,
    scoreMin: scores.length ? Math.min(...scores) : 0,
    coverageByCategory: coverage,
    worst: rank(points, 'worst'),
    best: rank(points, 'best'),
    headline: buildHeadline(points, coverage, avg),
    suggestions: buildSuggestions(points, coverage, areaCenter(area)),
    apiStats: { ...apiStats, elapsedMs },
    dataSource: mergeDataSource(ok.map((r) => r.dataSource)),
    warnings,
  }
}

/** 硬指标键列表（给前端 / 测试复用） */
export const ESSENTIAL_KEYS: Essential[] = ['market', 'pharmacy', 'primary_school']
