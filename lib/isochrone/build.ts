/**
 * 圈见 · 由扇形采样的算路结果推导等时圈（空间插值核心）
 *
 * 算法（不依赖任何路网数据）：
 * 1. 按方位角分组，每组按半径升序排列，得到一条"半径 → 步行秒数"的径向曲线；
 * 2. 单调修正：远点不可能比近点更快，对 walkSec 取运行最大值，抑制 API 抖动；
 *    null（水域 / 算路失败）视为不可达，该半径及更远的样点全部截断；
 * 3. 对 5/10/15 分钟三个阈值，在相邻样点之间做线性插值求出"该方向恰好用尽阈值时间的半径"：
 *    - 第一个样点已超阈值 → 在 0 ~ 第一半径之间按比例插值；
 *    - 全部样点都未超阈值 → 取最大采样半径并标记外推（extrapolated）；
 *    - 首个样点即不可达 → 半径 0；
 * 4. 圆周方向做一次 [0.25, 0.5, 0.25] 平滑，抑制相邻方向因单个样点异常造成的锯齿；
 * 5. 逐方向取 max 保证三环嵌套（5 ≤ 10 ≤ 15）；
 * 6. 用球面正解生成闭合多边形，计算面积、等效半径、圆度 4πA/P²。
 */
import type { Isochrone, IsochroneRing, IsochroneSample, LngLat, GeoJsonPolygon } from '../types'
import { destinationPoint, polygonAreaKm2, polygonPerimeterM } from './geo'

/** 三环阈值（分钟） */
export const RING_MINUTES = [5, 10, 15] as const
type RingMinutes = (typeof RING_MINUTES)[number]

/** 内部类型：某方向某阈值的可达半径 */
export interface ReachRadius {
  bearingDeg: number
  radiusM: number
  /** 采样全部未超阈值，半径被截到最大采样半径（真实可达范围可能更大） */
  extrapolated: boolean
  /** 该方向第一个样点即不可达 */
  unreachable: boolean
}

/** 内部类型：一个方向上的径向曲线（已单调修正、已截断） */
export interface RadialProfile {
  bearingDeg: number
  /** 半径升序；walkSec 单调不减；到达第一个 null 为止 */
  points: { radiusM: number; walkSec: number }[]
  /** 是否在某个半径处被 null 截断 */
  truncatedAtM: number | null
}

/** 圆周平滑核，和为 1 */
const SMOOTH_KERNEL = [0.25, 0.5, 0.25] as const

/** 按方位角分组并做单调修正 + null 截断 */
export function buildRadialProfiles(samples: IsochroneSample[]): RadialProfile[] {
  const groups = new Map<number, IsochroneSample[]>()
  for (const s of samples) {
    const key = +s.bearingDeg.toFixed(6)
    const arr = groups.get(key)
    if (arr) arr.push(s)
    else groups.set(key, [s])
  }
  const bearings = [...groups.keys()].sort((a, b) => a - b)
  return bearings.map((bearingDeg) => {
    const sorted = [...groups.get(bearingDeg)!].sort((a, b) => a.radiusM - b.radiusM)
    const points: RadialProfile['points'] = []
    let runningMax = 0
    let truncatedAtM: number | null = null
    for (const s of sorted) {
      if (s.walkSec === null || !Number.isFinite(s.walkSec)) {
        truncatedAtM = s.radiusM
        break
      }
      runningMax = Math.max(runningMax, s.walkSec)
      points.push({ radiusM: s.radiusM, walkSec: runningMax })
    }
    return { bearingDeg, points, truncatedAtM }
  })
}

/**
 * 在径向曲线上求"步行 thresholdSec 秒可达的半径"（线性插值）。
 * 被 null 截断时，可达半径不会超过截断半径（保守估计）。
 */
export function reachRadiusOnProfile(profile: RadialProfile, thresholdSec: number): ReachRadius {
  const { bearingDeg, points, truncatedAtM } = profile
  if (points.length === 0) return { bearingDeg, radiusM: 0, extrapolated: false, unreachable: true }

  const first = points[0]
  if (first.walkSec > thresholdSec) {
    const r = (first.radiusM * thresholdSec) / first.walkSec
    return { bearingDeg, radiusM: r, extrapolated: false, unreachable: false }
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (b.walkSec > thresholdSec) {
      const span = b.walkSec - a.walkSec
      const t = span <= 0 ? 1 : (thresholdSec - a.walkSec) / span
      const r = a.radiusM + (b.radiusM - a.radiusM) * Math.min(1, Math.max(0, t))
      return { bearingDeg, radiusM: r, extrapolated: false, unreachable: false }
    }
  }
  // 所有样点都在阈值内：受截断限制或取最大采样半径（外推）
  const last = points[points.length - 1]
  if (truncatedAtM !== null) {
    // 最后一个可达点到截断点之间不可知，取二者中点作为保守边界
    return {
      bearingDeg,
      radiusM: (last.radiusM + truncatedAtM) / 2,
      extrapolated: false,
      unreachable: false,
    }
  }
  return { bearingDeg, radiusM: last.radiusM, extrapolated: true, unreachable: false }
}

/** 圆周 [0.25,0.5,0.25] 平滑（首尾相接） */
export function smoothCircular(values: number[]): number[] {
  const n = values.length
  if (n < 3) return [...values]
  return values.map((_, i) => {
    const prev = values[(i - 1 + n) % n]
    const next = values[(i + 1) % n]
    return SMOOTH_KERNEL[0] * prev + SMOOTH_KERNEL[1] * values[i] + SMOOTH_KERNEL[2] * next
  })
}

/** 由各方向半径生成闭合 GeoJSON 多边形（首尾点相同） */
export function ringPolygon(
  center: LngLat,
  reach: { bearingDeg: number; radiusM: number }[]
): GeoJsonPolygon {
  const pts = reach.map((r) => destinationPoint(center, r.bearingDeg, Math.max(0, r.radiusM)))
  const coords: [number, number][] = pts.map((p) => [p.lng, p.lat])
  if (coords.length > 0) coords.push([coords[0][0], coords[0][1]])
  return { type: 'Polygon', coordinates: [coords] }
}

function polygonToLngLat(polygon: GeoJsonPolygon): LngLat[] {
  return polygon.coordinates[0].map(([lng, lat]) => ({ lng, lat }))
}

/**
 * 主入口：采样点 + 算路结果 → 三环等时圈。
 * samples 中 walkSec 为 null 的点视为不可达；不含任何样点时返回退化结果（半径全 0）。
 */
export function buildIsochrone(center: LngLat, samples: IsochroneSample[]): Isochrone {
  const profiles = buildRadialProfiles(samples)
  const bearings = profiles.map((p) => p.bearingDeg)

  // 每个阈值一组原始半径 → 平滑
  const smoothed = new Map<RingMinutes, number[]>()
  for (const minutes of RING_MINUTES) {
    const raw = profiles.map((p) => reachRadiusOnProfile(p, minutes * 60).radiusM)
    smoothed.set(minutes, smoothCircular(raw))
  }

  // 嵌套保证：逐方向 r10 = max(r5, r10)，r15 = max(r10, r15)
  const nested = new Map<RingMinutes, number[]>()
  let prev: number[] | null = null
  for (const minutes of RING_MINUTES) {
    const cur = smoothed.get(minutes)!
    const lower = prev
    const fixed: number[] = lower ? cur.map((r, i) => Math.max(r, lower[i])) : [...cur]
    nested.set(minutes, fixed)
    prev = fixed
  }

  const rings: IsochroneRing[] = RING_MINUTES.map((minutes) => {
    const reach = bearings.map((bearingDeg, i) => ({
      bearingDeg,
      radiusM: nested.get(minutes)![i],
    }))
    const polygon = ringPolygon(center, reach)
    return { minutes, polygon, areaKm2: round(polygonAreaKm2(polygonToLngLat(polygon)), 4) }
  })

  const ring15 = rings[rings.length - 1]
  const reach15 = nested.get(15)!
  const reachRadiusByBearing = bearings.map((bearingDeg, i) => ({
    bearingDeg,
    radiusM: Math.round(reach15[i]),
  }))
  const areaM2 = ring15.areaKm2 * 1e6
  const perimeterM = polygonPerimeterM(polygonToLngLat(ring15.polygon))
  const circularity =
    perimeterM > 0 ? clamp01((4 * Math.PI * areaM2) / (perimeterM * perimeterM)) : 0

  return {
    center,
    rings,
    samples,
    reachRadiusByBearing,
    equivalentRadiusM: Math.round(Math.sqrt(areaM2 / Math.PI)),
    circularity: round(circularity, 3),
  }
}

/** 取 15 分钟环的顶点（LngLat），供盲区 / 评分做点在多边形内判断 */
export function ring15Of(isochrone: Isochrone): LngLat[] {
  const ring =
    isochrone.rings.find((r) => r.minutes === 15) ?? isochrone.rings[isochrone.rings.length - 1]
  return ring ? polygonToLngLat(ring.polygon) : []
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}
function round(v: number, digits: number): number {
  const k = 10 ** digits
  return Math.round(v * k) / k
}
