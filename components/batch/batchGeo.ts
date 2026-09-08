/**
 * 街道级批量体检 · 纯几何与参数常量（浏览器端估算，服务端以 plan 事件为准）
 */
import { planGrid as serverPlanGrid } from '@/lib/batch/grid'
import type { BatchArea, BatchPointSummary, LngLat } from '@/lib/types'

export const SPACING_OPTIONS = [400, 500, 600, 800] as const
export const MAX_POINT_OPTIONS = [9, 16, 25] as const
export const RADIUS_MIN_M = 500
export const RADIUS_MAX_M = 3000
export const RADIUS_DEFAULT_M = 1500
export const RECT_MAX_DIAG_M = 6000
/** 每个点的预估耗时（秒） */
export const SEC_PER_POINT = 6

const M_PER_DEG_LAT = 111320

export function offsetM(c: LngLat, dxM: number, dyM: number): LngLat {
  const lat = c.lat + dyM / M_PER_DEG_LAT
  const lng = c.lng + dxM / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180))
  return { lng: +lng.toFixed(6), lat: +lat.toFixed(6) }
}

export function distM(a: LngLat, b: LngLat): number {
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT
  const dx = (b.lng - a.lng) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/** 圆的近似多边形（首尾不重复，n 个顶点） */
export function circlePolygon(center: LngLat, radiusM: number, n = 48): LngLat[] {
  const pts: LngLat[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push(offsetM(center, Math.sin(a) * radiusM, Math.cos(a) * radiusM))
  }
  return pts
}

export function rectPolygon(sw: LngLat, ne: LngLat): LngLat[] {
  return [
    { lng: sw.lng, lat: sw.lat },
    { lng: ne.lng, lat: sw.lat },
    { lng: ne.lng, lat: ne.lat },
    { lng: sw.lng, lat: ne.lat },
  ]
}

export function areaPolygon(area: BatchArea): LngLat[] {
  return area.kind === 'circle'
    ? circlePolygon(area.center, area.radiusM)
    : rectPolygon(area.sw, area.ne)
}

export function areaCenter(area: BatchArea): LngLat {
  if (area.kind === 'circle') return area.center
  return { lng: (area.sw.lng + area.ne.lng) / 2, lat: (area.sw.lat + area.ne.lat) / 2 }
}

export function areaKm2(area: BatchArea): number {
  if (area.kind === 'circle') return (Math.PI * area.radiusM * area.radiusM) / 1e6
  const w = distM({ lng: area.sw.lng, lat: area.sw.lat }, { lng: area.ne.lng, lat: area.sw.lat })
  const h = distM({ lng: area.sw.lng, lat: area.sw.lat }, { lng: area.sw.lng, lat: area.ne.lat })
  return (w * h) / 1e6
}

export function rectDiagonalM(sw: LngLat, ne: LngLat): number {
  return distM(sw, ne)
}

/** 范围的"半宽"（米）：圆 = 半径；矩形 = 对角线一半 */
export function areaHalfSpanM(area: BatchArea): number {
  return area.kind === 'circle' ? area.radiusM : rectDiagonalM(area.sw, area.ne) / 2
}

function insideArea(area: BatchArea, p: LngLat): boolean {
  if (area.kind === 'circle') return distM(area.center, p) <= area.radiusM + 1
  return (
    p.lng >= area.sw.lng && p.lng <= area.ne.lng && p.lat >= area.sw.lat && p.lat <= area.ne.lat
  )
}

/** 浏览器端点数预估：直接复用服务端的 planGrid，保证"预计 N 点"与实际一致 */
export function planGrid(area: BatchArea, spacingM: number, maxPoints: number): LngLat[] {
  return serverPlanGrid(area, spacingM, maxPoints).points
}

export function estimateMinutes(points: number): number {
  return Math.max(1, Math.round((points * SEC_PER_POINT) / 60))
}

export function areaName(area: BatchArea): string {
  if (area.name) return area.name
  return area.kind === 'circle' ? `半径 ${area.radiusM} m 圆形范围` : '地图框选范围'
}

export function areaSpec(area: BatchArea): string {
  if (area.kind === 'circle') return `圆形 · 半径 ${area.radiusM} m`
  const w = Math.round(
    distM({ lng: area.sw.lng, lat: area.sw.lat }, { lng: area.ne.lng, lat: area.sw.lat })
  )
  const h = Math.round(
    distM({ lng: area.sw.lng, lat: area.sw.lat }, { lng: area.sw.lng, lat: area.ne.lat })
  )
  return `矩形 · ${w} × ${h} m`
}

/** 地址简称：去掉省市区前缀、截到 14 字 */
export function shortPointAddress(address: string, max = 14): string {
  const s = address.replace(/^(.*?省)?(.*?市)?(.*?[区县])?/, '')
  const t = s || address
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function pointLabel(index: number): string {
  return `第 ${index + 1} 点`
}

/** 分数 → 圆标直径 18–28px */
export function scoreDiameter(score: number): number {
  const s = Math.max(0, Math.min(100, score))
  return Math.round(18 + (s / 100) * 10)
}

/** 排名（分数降序，同分按序号） */
export function rankPoints(points: BatchPointSummary[]): BatchPointSummary[] {
  return points.slice().sort((a, b) => b.overallScore - a.overallScore || a.index - b.index)
}

/** 统计：平均 / 最高 / 最低（空数组返回 null） */
export function scoreStats(points: BatchPointSummary[]) {
  if (points.length === 0) return null
  const scores = points.map((p) => p.overallScore)
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return { avg: Math.round(avg), max: Math.max(...scores), min: Math.min(...scores) }
}
