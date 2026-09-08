/**
 * 圈见 · 街道级批量体检的网格布点（纯函数，零 I/O）
 *
 * 以区域中心为原点铺正方网格：圆形区域只保留落在圆内的点，矩形区域铺满矩形。
 * 点数超过 maxPoints 时按 √(面积 / maxPoints) 放大间距重铺（再逐步微调），保证 ≤ maxPoints；
 * 无论如何至少返回 1 个点（区域中心）。输出按"离区域中心由近到远"排序，
 * 这样串行体检时中心点最先出结果，演示时先有东西看。
 */
import type { BatchArea, LngLat } from '@/lib/types'
import { haversineM, offsetMeters, polygonAreaKm2 } from '@/lib/isochrone/geo'

/** 默认网格间距（米） */
export const DEFAULT_SPACING_M = 500
/** 默认 / 上限点数 */
export const DEFAULT_MAX_POINTS = 16
export const HARD_MAX_POINTS = 25

/** 布点结果 */
export interface GridPlan {
  /** 按离中心由近到远排序的网格点 */
  points: LngLat[]
  /** 实际采用的间距（米，可能已被放大） */
  spacingM: number
  /** 区域面积（平方公里） */
  areaKm2: number
}

/** 区域的几何中心：圆取圆心，矩形取对角中点 */
export function areaCenter(area: BatchArea): LngLat {
  if (area.kind === 'circle') return area.center
  return { lng: (area.sw.lng + area.ne.lng) / 2, lat: (area.sw.lat + area.ne.lat) / 2 }
}

/** 区域面积（平方公里）：圆用 πr²，矩形用四角多边形的球面近似面积 */
export function areaKm2Of(area: BatchArea): number {
  if (area.kind === 'circle') return (Math.PI * area.radiusM * area.radiusM) / 1e6
  const { sw, ne } = area
  return polygonAreaKm2([
    { lng: sw.lng, lat: sw.lat },
    { lng: ne.lng, lat: sw.lat },
    { lng: ne.lng, lat: ne.lat },
    { lng: sw.lng, lat: ne.lat },
  ])
}

/** 矩形东西向 / 南北向的边长（米） */
function rectSizeM(area: Extract<BatchArea, { kind: 'rect' }>): { wM: number; hM: number } {
  const { sw, ne } = area
  const wM = haversineM({ lng: sw.lng, lat: sw.lat }, { lng: ne.lng, lat: sw.lat })
  const hM = haversineM({ lng: sw.lng, lat: sw.lat }, { lng: sw.lng, lat: ne.lat })
  return { wM, hM }
}

/** 以给定间距铺一次网格（未排序、未限点数） */
function tile(area: BatchArea, spacingM: number): LngLat[] {
  const center = areaCenter(area)
  const out: LngLat[] = []
  if (area.kind === 'circle') {
    const n = Math.floor(area.radiusM / spacingM)
    for (let iy = -n; iy <= n; iy++)
      for (let ix = -n; ix <= n; ix++) {
        const dx = ix * spacingM
        const dy = iy * spacingM
        if (Math.hypot(dx, dy) > area.radiusM + 1e-6) continue
        out.push(offsetMeters(center, dx, dy))
      }
    return out
  }
  const { wM, hM } = rectSizeM(area)
  const nx = Math.floor(wM / 2 / spacingM)
  const ny = Math.floor(hM / 2 / spacingM)
  for (let iy = -ny; iy <= ny; iy++)
    for (let ix = -nx; ix <= nx; ix++) out.push(offsetMeters(center, ix * spacingM, iy * spacingM))
  return out
}

/**
 * 规划网格点。
 * @param area 圆或矩形
 * @param spacingM 期望间距（米），默认 500
 * @param maxPoints 点数上限，默认 16（硬上限 25）
 */
export function planGrid(
  area: BatchArea,
  spacingM = DEFAULT_SPACING_M,
  maxPoints = DEFAULT_MAX_POINTS
): GridPlan {
  const areaKm2 = areaKm2Of(area)
  const limit = Math.max(1, Math.min(HARD_MAX_POINTS, Math.floor(maxPoints)))
  let spacing = Math.max(1, spacingM)
  let points = tile(area, spacing)

  if (points.length > limit) {
    // 面积 / 点数 = 每点占地 → 边长即间距；矩形与圆共用此估计
    const ideal = Math.sqrt((areaKm2 * 1e6) / limit)
    spacing = Math.max(spacing, ideal)
    points = tile(area, spacing)
    // 离散化可能仍略超，逐步放大 5% 直到满足
    let guard = 0
    while (points.length > limit && guard++ < 60) {
      spacing *= 1.05
      points = tile(area, spacing)
    }
  }

  const center = areaCenter(area)
  if (points.length === 0) points = [center]
  const ranked = points
    .map((p, i) => ({ p, i, d: haversineM(center, p) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p)

  return { points: ranked.slice(0, limit), spacingM: Math.round(spacing), areaKm2 }
}
