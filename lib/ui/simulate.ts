/**
 * 圈见 · 「假如在这里新建一处 X」模拟（纯函数，浏览器本地重算）
 *
 * 规划人员在地图上放置若干"拟建设施"（菜市场 / 药店 / 小学），本模块把它们
 * 转成 Poi 并入原报告，重跑评分 / 盲区 / 综合结论，给出前后对比。
 * 全部依赖 lib/report 的纯函数，不发网络请求；步行分钟由调用方（useSimulate）
 * 通过 /api/walk 取得后写在 VirtualFacility 上，缺失时按直线距离估算。
 */
import type { CategoryScore, FacilityCategory, HealthReport, LngLat, Poi } from '@/lib/types'
import { ESSENTIAL_CATEGORIES } from '@/lib/categories'
import { bearingBetween, haversineM, pointInPolygon } from '@/lib/isochrone/geo'
import { ring15Of } from '@/lib/isochrone/build'
import {
  bearingToChinese,
  buildOverall,
  detectBlindSpots,
  scoreCategories,
  summarizeBlindSpots,
} from '@/lib/report'
import { CATEGORY_LABEL } from '@/lib/ui/theme'

/** 拟建设施（由用户在地图上放置） */
export interface VirtualFacility {
  id: string
  category: FacilityCategory
  location: LngLat
  /** 新点到体检中心的步行秒数；null = 尚未取得，评分时按直线估算 */
  walkSec: number | null
  walkM: number | null
  source: 'api' | 'estimate'
  /** 步行时间仍在请求中（仅 UI 展示用） */
  pending?: boolean
}

/** 单类别前后对比（只列有变化的） */
export interface CategoryDiff {
  category: FacilityCategory
  label: string
  scoreBefore: number
  scoreAfter: number
  walkMinBefore: number | null
  walkMinAfter: number | null
}

export interface SimulationDiff {
  overallBefore: number
  overallAfter: number
  gradeBefore: HealthReport['overallGrade']
  gradeAfter: HealthReport['overallGrade']
  blindBefore: number
  blindAfter: number
  blindInIsoBefore: number
  blindInIsoAfter: number
  categories: CategoryDiff[]
  /** 中文一句话结论 */
  headline: string
}

export interface SimulationResult {
  /** 并入拟建设施后的新报告（dataSource 不变，warnings 追加模拟说明） */
  report: HealthReport
  diff: SimulationDiff
}

/** 可模拟的类别：赛题三项硬指标 */
export const SIMULATABLE_CATEGORIES: FacilityCategory[] = [...ESSENTIAL_CATEGORIES]

/** 拟建设施 Poi 的 uid 前缀 */
export const VIRTUAL_UID_PREFIX = 'virtual:'

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

/** 序号 → 带圈数字（超过 20 退回普通数字） */
export function circledNumber(n: number): string {
  return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : String(n)
}

/** 是否为拟建设施转成的 Poi */
export function isVirtualPoi(poi: Pick<Poi, 'uid'>): boolean {
  return poi.uid.startsWith(VIRTUAL_UID_PREFIX)
}

/**
 * 拟建设施的显示名："拟建菜市场 ①"，序号按同类别内的放置顺序。
 * 列表 / 地图标记 / Poi.name 三处共用，保证一致。
 */
export function virtualLabel(v: VirtualFacility, all: VirtualFacility[]): string {
  const sameCategory = all.filter((x) => x.category === v.category)
  const idx = sameCategory.findIndex((x) => x.id === v.id)
  return `拟建${CATEGORY_LABEL[v.category]} ${circledNumber(idx + 1)}`
}

/** 相对体检中心的方位与直线距离（米），供列表显示"东北 · 620 m" */
export function virtualPosition(
  v: Pick<VirtualFacility, 'location'>,
  center: LngLat
): { direction: string; distM: number } {
  const distM = Math.round(haversineM(center, v.location))
  return {
    direction: distM < 15 ? '中心' : bearingToChinese(bearingBetween(center, v.location)),
    distM,
  }
}

/** 拟建设施 → Poi（inIsochrone 用 15 分钟环判定，straightM 用大圆距离） */
export function virtualToPoi(
  v: VirtualFacility,
  all: VirtualFacility[],
  report: Pick<HealthReport, 'center' | 'isochrone'>
): Poi {
  const ring15 = ring15Of(report.isochrone)
  const walkSec = v.walkSec !== null && Number.isFinite(v.walkSec) ? v.walkSec : null
  return {
    uid: `${VIRTUAL_UID_PREFIX}${v.id}`,
    name: virtualLabel(v, all),
    category: v.category,
    location: v.location,
    address: '拟建（模拟）',
    straightM: haversineM(report.center, v.location),
    walkM: walkSec === null ? null : v.walkM,
    walkSec,
    walkSource: walkSec === null ? 'estimate' : v.source,
    inIsochrone: ring15.length >= 3 && pointInPolygon(v.location, ring15),
  }
}

/**
 * 把拟建设施并入报告并全量重算。
 * - 传入的 report 若已含拟建 Poi（例如把上一次模拟结果再传回来），会先剔除，保证幂等；
 * - 不修改入参；返回的新报告 id / generatedAt / apiStats / dataSource 保持不变。
 */
export function applyVirtualFacilities(
  report: HealthReport,
  virtuals: VirtualFacility[]
): SimulationResult {
  const basePois = report.pois.filter((p) => !isVirtualPoi(p))
  const virtualPois = virtuals.map((v) => virtualToPoi(v, virtuals, report))
  const pois = [...basePois, ...virtualPois]

  const categories = scoreCategories(pois, report.isochrone)
  const blindSpots = detectBlindSpots(report.center, pois, report.isochrone)
  const blindSummary = summarizeBlindSpots(blindSpots)
  const overall = buildOverall(categories, blindSummary, report.isochrone)

  const beforeSummary = summarizeBlindSpots(report.blindSpots.slice())
  const warnings = report.warnings.filter((w) => !w.includes('拟建设施（模拟）'))
  if (virtuals.length > 0) warnings.push(`含 ${virtuals.length} 处拟建设施（模拟）`)

  const next: HealthReport = {
    ...report,
    pois,
    categories,
    blindSpots,
    overallScore: overall.overallScore,
    overallGrade: overall.overallGrade,
    headline: overall.headline,
    suggestions: overall.suggestions,
    warnings,
  }

  const categoryDiffs = diffCategories(report.categories, categories)
  const diff: SimulationDiff = {
    overallBefore: report.overallScore,
    overallAfter: next.overallScore,
    gradeBefore: report.overallGrade,
    gradeAfter: next.overallGrade,
    blindBefore: beforeSummary.cellCount,
    blindAfter: blindSummary.cellCount,
    blindInIsoBefore: beforeSummary.inIsochroneCount,
    blindInIsoAfter: blindSummary.inIsochroneCount,
    categories: categoryDiffs,
    headline: '',
  }
  diff.headline = buildSimulationHeadline(virtuals, diff)
  return { report: next, diff }
}

/** 只保留分数或最近步行分钟有变化的类别 */
function diffCategories(before: CategoryScore[], after: CategoryScore[]): CategoryDiff[] {
  const byKey = new Map(before.map((c) => [c.category, c]))
  const out: CategoryDiff[] = []
  for (const a of after) {
    const b = byKey.get(a.category)
    if (!b) continue
    const scoreChanged = a.score !== b.score
    const walkChanged = (a.nearestWalkMin ?? null) !== (b.nearestWalkMin ?? null)
    if (!scoreChanged && !walkChanged) continue
    out.push({
      category: a.category,
      label: a.label,
      scoreBefore: b.score,
      scoreAfter: a.score,
      walkMinBefore: b.nearestWalkMin,
      walkMinAfter: a.nearestWalkMin,
    })
  }
  return out
}

/** 拟建设施按类别计数："菜市场 ×2、药店 ×1" */
export function describeVirtuals(virtuals: VirtualFacility[]): string {
  const count = new Map<FacilityCategory, number>()
  for (const v of virtuals) count.set(v.category, (count.get(v.category) ?? 0) + 1)
  return [...count.entries()].map(([k, n]) => `${CATEGORY_LABEL[k]} ×${n}`).join('、')
}

function fmtMin(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return '无'
  return min < 1 ? '<1' : String(Math.round(min))
}

/** 一句话结论 */
export function buildSimulationHeadline(virtuals: VirtualFacility[], d: SimulationDiff): string {
  if (virtuals.length === 0) return '尚未放置拟建设施，选好类别后在地图上点一下'
  const prefix =
    virtuals.length === 1
      ? `新建一处${CATEGORY_LABEL[virtuals[0].category]}后：`
      : `新建 ${virtuals.length} 处设施（${describeVirtuals(virtuals)}）后：`
  const parts: string[] = []
  parts.push(
    d.overallAfter === d.overallBefore
      ? `综合分不变（${d.overallBefore}）`
      : `综合 ${d.overallBefore} → ${d.overallAfter}${d.gradeAfter !== d.gradeBefore ? `（${d.gradeBefore} → ${d.gradeAfter}）` : ''}`
  )
  const removed = d.blindBefore - d.blindAfter
  const removedInIso = d.blindInIsoBefore - d.blindInIsoAfter
  if (removed > 0)
    parts.push(
      `消除 ${removed} 个盲区网格${removedInIso > 0 ? `（其中圈内 ${removedInIso} 个）` : ''}`
    )
  else parts.push('盲区网格数不变')
  for (const c of d.categories) {
    if (c.walkMinBefore === c.walkMinAfter) continue
    parts.push(`${c.label}最近步行 ${fmtMin(c.walkMinBefore)} → ${fmtMin(c.walkMinAfter)} 分钟`)
  }
  return prefix + parts.join('，')
}
