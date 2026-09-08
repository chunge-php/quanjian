/**
 * 圈见 · 服务盲区识别（赛题：周边 1 公里内没有菜市场 / 药店 / 小学的点位）
 *
 * 算法：
 * 1. 以体检中心为原点铺 cellM（默认 200 m）见方的正方形网格，只保留网格中心
 *    落在 extentM（默认 1500 m）半径圆内的单元（约 176 个）；
 * 2. 每个网格中心对每个硬指标类别（ESSENTIAL_CATEGORIES）检查 radiusM（默认 1000 m）
 *    直线范围内是否至少有一个 POI；缺失的类别写入 missing；
 * 3. severity = 缺失类别数 / 硬指标类别数；inIsochrone 用 15 分钟环做射线法判断，
 *    圈内盲区意味着"步行可达却无服务"，优先级更高；
 * 4. 只返回 missing 非空的单元，前端可直接按 severity 渲染热力网格。
 *
 * 复杂度 O(cells × pois)，1500 m 范围 + 几百个 POI 在 1 ms 量级，无需空间索引。
 */
import { ESSENTIAL_CATEGORIES, FACILITY_CATEGORIES } from '../categories'
import type { BlindSpotCell, FacilityCategory, Isochrone, LngLat, Poi } from '../types'
import { centroidOf, haversineM, offsetMeters, pointInPolygon } from '../isochrone/geo'
import { ring15Of } from '../isochrone/build'

export interface BlindSpotOptions {
  /** 网格边长（米），默认 200 */
  cellM?: number
  /** 分析范围半径（米），默认 1500 */
  extentM?: number
  /** 判定半径（米，直线），默认 1000 */
  radiusM?: number
}

export const DEFAULT_CELL_M = 200
export const DEFAULT_EXTENT_M = 1500
export const DEFAULT_BLIND_RADIUS_M = 1000

/** 生成分析范围内的网格中心点（含中心网格，按行列对称铺设） */
export function buildGridCenters(
  center: LngLat,
  cellM = DEFAULT_CELL_M,
  extentM = DEFAULT_EXTENT_M
): LngLat[] {
  const n = Math.floor(extentM / cellM)
  const out: LngLat[] = []
  for (let iy = -n; iy <= n; iy++) {
    for (let ix = -n; ix <= n; ix++) {
      const dx = ix * cellM
      const dy = iy * cellM
      if (Math.hypot(dx, dy) > extentM) continue
      out.push(offsetMeters(center, dx, dy))
    }
  }
  return out
}

/**
 * 盲区检测主入口。返回的每个单元都至少缺失一个硬指标类别。
 */
export function detectBlindSpots(
  center: LngLat,
  pois: Poi[],
  isochrone: Isochrone,
  opts: BlindSpotOptions = {}
): BlindSpotCell[] {
  const cellM = opts.cellM ?? DEFAULT_CELL_M
  const extentM = opts.extentM ?? DEFAULT_EXTENT_M
  const radiusM = opts.radiusM ?? DEFAULT_BLIND_RADIUS_M
  const ring15 = ring15Of(isochrone)

  // 预先按类别分桶，避免每个网格都全量扫描
  const byCategory = new Map<FacilityCategory, LngLat[]>()
  for (const key of ESSENTIAL_CATEGORIES) byCategory.set(key, [])
  for (const poi of pois) {
    const bucket = byCategory.get(poi.category)
    if (bucket) bucket.push(poi.location)
  }

  const cells: BlindSpotCell[] = []
  for (const cellCenter of buildGridCenters(center, cellM, extentM)) {
    const missing: FacilityCategory[] = []
    for (const key of ESSENTIAL_CATEGORIES) {
      const locs = byCategory.get(key)!
      const covered = locs.some((loc) => haversineM(cellCenter, loc) <= radiusM)
      if (!covered) missing.push(key)
    }
    if (missing.length === 0) continue
    cells.push({
      center: cellCenter,
      sizeM: cellM,
      missing,
      severity: missing.length / ESSENTIAL_CATEGORIES.length,
      inIsochrone: ring15.length >= 3 && pointInPolygon(cellCenter, ring15),
    })
  }
  return cells
}

/** 盲区汇总（内部扩展了 centroidByCategory，供建议文案计算方位） */
export interface BlindSpotSummary {
  cellCount: number
  /** 盲区网格总面积（平方公里）= 单元数 × 边长² */
  areaKm2: number
  /** 各类别缺失的网格数（非硬指标恒为 0） */
  byCategory: Record<FacilityCategory, number>
  inIsochroneCount: number
  /** 各类别缺失网格的质心（无则不存在该键），用于"在东北方向 600 米内增设"这类建议 */
  centroidByCategory: Partial<Record<FacilityCategory, LngLat>>
}

export function summarizeBlindSpots(cells: BlindSpotCell[]): BlindSpotSummary {
  const byCategory = Object.fromEntries(FACILITY_CATEGORIES.map((c) => [c.key, 0])) as Record<
    FacilityCategory,
    number
  >
  const pointsByCategory = new Map<FacilityCategory, LngLat[]>()
  let inIsochroneCount = 0
  let areaM2 = 0
  for (const cell of cells) {
    areaM2 += cell.sizeM * cell.sizeM
    if (cell.inIsochrone) inIsochroneCount++
    for (const key of cell.missing) {
      byCategory[key] = (byCategory[key] ?? 0) + 1
      const arr = pointsByCategory.get(key)
      if (arr) arr.push(cell.center)
      else pointsByCategory.set(key, [cell.center])
    }
  }
  const centroidByCategory: Partial<Record<FacilityCategory, LngLat>> = {}
  for (const [key, pts] of pointsByCategory) {
    const c = centroidOf(pts)
    if (c) centroidByCategory[key] = c
  }
  return {
    cellCount: cells.length,
    areaKm2: Math.round((areaM2 / 1e6) * 1000) / 1000,
    byCategory,
    inIsochroneCount,
    centroidByCategory,
  }
}
