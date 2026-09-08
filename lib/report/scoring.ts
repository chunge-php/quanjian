/**
 * 圈见 · 设施覆盖评分与综合结论
 *
 * 单类别评分：以"最近一处的步行分钟数"为主（≤5 分钟 100、≤10 分钟 85、≤15 分钟 70、
 * ≤20 分钟 45、>20 分钟 20、完全没有 0），再按 15 分钟圈内数量加成（每处 +2，最多 +10），封顶 100。
 * 综合评分：硬指标（菜市场 / 药店 / 小学）均分权重 0.6，其余类别 0.4，
 * 再按盲区面积占分析范围的比例扣分（最多 15 分）。
 */
import { FACILITY_CATEGORIES } from '../categories'
import type {
  CategoryScore,
  FacilityCategory,
  HealthReport,
  Isochrone,
  LngLat,
  Poi,
} from '../types'
import { bearingBetween, haversineM, pointInPolygon } from '../isochrone/geo'
import { ring15Of } from '../isochrone/build'
import { estimateWalkSec } from '../isochrone/sampling'
import type { BlindSpotSummary } from './blindspot'
import { bearingToChinese, ceilTo100, formatKm2, formatMinutes } from './format'
import { DEFAULT_EXTENT_M } from './blindspot'

type Grade = CategoryScore['grade']
type Suggestion = HealthReport['suggestions'][number]

/** 分钟 → 基础分 */
export function baseScoreByMinutes(min: number | null): number {
  if (min === null) return 0
  if (min <= 5) return 100
  if (min <= 10) return 85
  if (min <= 15) return 70
  if (min <= 20) return 45
  return 20
}

/** 分数 → 评级 */
export function gradeOf(score: number): Grade {
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 50) return 'C'
  return 'D'
}

/** POI 的步行分钟数：优先 API 真实值，缺失时用直线距离估算 */
export function walkMinutesOf(poi: Poi): number {
  const sec =
    poi.walkSec !== null && Number.isFinite(poi.walkSec)
      ? poi.walkSec
      : estimateWalkSec(poi.straightM)
  return sec / 60
}

/** 对 FACILITY_CATEGORIES 每一类计算覆盖评分 */
export function scoreCategories(pois: Poi[], isochrone: Isochrone): CategoryScore[] {
  const ring15 = ring15Of(isochrone)
  return FACILITY_CATEGORIES.map((meta) => {
    const list = pois.filter((p) => p.category === meta.key)
    const inIso = list.filter(
      (p) => p.inIsochrone || (ring15.length >= 3 && pointInPolygon(p.location, ring15))
    )
    const within1km = list.filter((p) => p.straightM <= 1000)
    let nearest: Poi | undefined
    let nearestMin: number | null = null
    for (const p of list) {
      const m = walkMinutesOf(p)
      if (nearestMin === null || m < nearestMin) {
        nearestMin = m
        nearest = p
      }
    }
    const bonus = Math.min(10, inIso.length * 2)
    const score = nearestMin === null ? 0 : Math.min(100, baseScoreByMinutes(nearestMin) + bonus)
    const nearestWalkMin = nearestMin === null ? null : Math.round(nearestMin * 10) / 10
    return {
      category: meta.key,
      label: meta.label,
      essential: meta.essential,
      countInIsochrone: inIso.length,
      countWithin1km: within1km.length,
      nearestWalkMin,
      nearest,
      score,
      grade: gradeOf(score),
      diagnosis: diagnose(
        meta.label,
        meta.essential,
        nearestWalkMin,
        within1km.length,
        inIso.length
      ),
    }
  })
}

function diagnose(
  label: string,
  essential: boolean,
  nearestMin: number | null,
  within1km: number,
  inIso: number
): string {
  if (nearestMin === null) {
    return essential ? `周边没有${label}，属于服务盲区` : `周边没有${label}，建议规划补充`
  }
  if (within1km === 0 && essential) {
    return `1 公里内没有${label}，属于服务盲区（最近的步行 ${formatMinutes(nearestMin)}）`
  }
  const t = formatMinutes(nearestMin)
  if (nearestMin <= 5)
    return `最近的${label}步行 ${t}，${inIso > 1 ? `圈内共 ${inIso} 处，` : ''}覆盖优秀`
  if (nearestMin <= 10) return `最近的${label}步行 ${t}，覆盖良好`
  if (nearestMin <= 15) return `最近的${label}步行 ${t}，勉强在 15 分钟圈内`
  return `最近的${label}步行 ${t}，超出 15 分钟生活圈`
}

export interface OverallResult {
  overallScore: number
  overallGrade: Grade
  headline: string[]
  suggestions: Suggestion[]
}

const PRIORITY_ORDER: Record<Suggestion['priority'], number> = { high: 0, medium: 1, low: 2 }

/**
 * 综合评分 + 首屏结论 + 规划建议。
 * 建议方位由该类别盲区网格质心相对中心的方位角推得，距离为质心直线距离向上取整到 100 m。
 * @param analysisAreaKm2 盲区分析范围面积（默认 π·1.5²），用于计算盲区面积占比
 */
export function buildOverall(
  categories: CategoryScore[],
  blindSummary: BlindSpotSummary,
  isochrone: Isochrone,
  analysisAreaKm2 = (Math.PI * DEFAULT_EXTENT_M * DEFAULT_EXTENT_M) / 1e6
): OverallResult {
  const essential = categories.filter((c) => c.essential)
  const others = categories.filter((c) => !c.essential)
  const essAvg = avg(essential.map((c) => c.score))
  const otherAvg = avg(others.map((c) => c.score))
  const blindRatio = analysisAreaKm2 > 0 ? Math.min(1, blindSummary.areaKm2 / analysisAreaKm2) : 0
  const penalty = Math.min(15, blindRatio * 30)
  const overallScore = Math.round(
    Math.max(0, Math.min(100, essAvg * 0.6 + otherAvg * 0.4 - penalty))
  )

  return {
    overallScore,
    overallGrade: gradeOf(overallScore),
    headline: buildHeadline(essential, blindSummary, isochrone),
    suggestions: buildSuggestions(categories, blindSummary, isochrone),
  }
}

function buildHeadline(
  essential: CategoryScore[],
  blind: BlindSpotSummary,
  iso: Isochrone
): string[] {
  const out: string[] = []
  const ring15 = iso.rings.find((r) => r.minutes === 15)
  if (ring15) {
    let s = `15 分钟步行可达 ${formatKm2(ring15.areaKm2)}，相当于 ${iso.equivalentRadiusM} 米半径的圆，圆度 ${iso.circularity.toFixed(2)}`
    const weakest = weakestDirection(iso)
    if (weakest && (iso.circularity < 0.75 || weakestRatio(iso) < 0.7))
      s += `，${weakest}侧通达性最弱`
    out.push(s)
  }
  const ok = essential.filter((c) => c.countWithin1km > 0)
  const missing = essential.filter((c) => c.countWithin1km === 0)
  if (missing.length === 0) out.push(`菜市场、药店、小学三项硬指标 1 公里内全部达标`)
  else
    out.push(
      `硬指标 ${ok.length}/${essential.length} 达标，1 公里内缺少${missing.map((c) => c.label).join('、')}`
    )
  if (blind.cellCount === 0) out.push('分析范围内未发现服务盲区')
  else
    out.push(
      `发现 ${blind.cellCount} 个盲区网格（约 ${formatKm2(blind.areaKm2)}），其中 ${blind.inIsochroneCount} 个位于 15 分钟圈内`
    )
  return out.slice(0, 3)
}

/** 最弱方向半径 / 最强方向半径（0-1），用于判断是否存在明显的单侧阻隔 */
export function weakestRatio(iso: Isochrone): number {
  const list = iso.reachRadiusByBearing.map((r) => r.radiusM)
  if (list.length === 0) return 1
  const max = Math.max(...list)
  return max > 0 ? Math.min(...list) / max : 1
}

/** 15 分钟可达半径最小的方向（中文），全为 0 或方向数不足时返回 null */
export function weakestDirection(iso: Isochrone): string | null {
  const list = iso.reachRadiusByBearing
  if (list.length < 4) return null
  const max = Math.max(...list.map((r) => r.radiusM))
  if (max <= 0) return null
  const min = list.reduce((a, b) => (b.radiusM < a.radiusM ? b : a))
  return bearingToChinese(min.bearingDeg)
}

function buildSuggestions(
  categories: CategoryScore[],
  blind: BlindSpotSummary,
  iso: Isochrone
): Suggestion[] {
  const out: Suggestion[] = []
  for (const c of categories) {
    if (c.essential && (c.countWithin1km === 0 || c.score < 70)) {
      out.push({
        priority: 'high',
        category: c.category,
        text: essentialText(c, blind, iso.center),
      })
    } else if (c.essential && c.score < 85) {
      out.push({
        priority: 'medium',
        category: c.category,
        text: `${c.label}覆盖一般（最近步行 ${formatMinutes(c.nearestWalkMin)}），建议在 15 分钟圈内补充一处`,
      })
    } else if (!c.essential && c.score < 50) {
      out.push({
        priority: 'medium',
        category: c.category,
        text: `${c.label}覆盖不足（${c.nearestWalkMin === null ? '周边没有' : `最近步行 ${formatMinutes(c.nearestWalkMin)}`}），建议纳入社区配套规划`,
      })
    } else if (!c.essential && c.score < 70) {
      out.push({
        priority: 'low',
        category: c.category,
        text: `${c.label}距离偏远（最近步行 ${formatMinutes(c.nearestWalkMin)}），可结合改造适当加密`,
      })
    }
  }
  const weakest = weakestDirection(iso)
  if (iso.circularity > 0 && iso.circularity < 0.5 && weakest) {
    out.push({
      priority: 'medium',
      text: `等时圈圆度仅 ${iso.circularity.toFixed(2)}，${weakest}侧步行通达性明显受阻，建议打通步行连廊或增设过街设施`,
    })
  }
  return out.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
}

function essentialText(c: CategoryScore, blind: BlindSpotSummary, center: LngLat): string {
  const centroid = blind.centroidByCategory[c.category]
  const count = blind.byCategory[c.category] ?? 0
  if (centroid && count > 0) {
    const dir = bearingToChinese(bearingBetween(center, centroid))
    const dist = ceilTo100(haversineM(center, centroid))
    return `在${dir}方向 ${dist} 米内增设一处${c.label}可消除 ${count} 个盲区网格`
  }
  if (c.nearestWalkMin === null) return `周边没有${c.label}，建议在 15 分钟圈内新增一处`
  return `最近的${c.label}步行 ${formatMinutes(c.nearestWalkMin)}，建议在 15 分钟圈内增设一处`
}

function avg(list: number[]): number {
  return list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length
}
