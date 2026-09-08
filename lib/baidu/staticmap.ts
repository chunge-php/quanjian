/**
 * 百度静态图 v2 的纯函数部分（缩放估算），供 /api/staticmap 与测试使用。
 * 百度 2D 底图分辨率 ≈ 2^(18 − zoom) 米/像素。
 */
import type { LngLat } from '../types'

export const STATIC_MAP_ZOOM_MIN = 14
export const STATIC_MAP_ZOOM_MAX = 17

/** 按路径包围盒自动选缩放：包围盒放大 1.2 倍后仍落在 w×h 画幅里，夹在 14~17 */
export function autoZoom(ring: LngLat[], w: number, h: number): number {
  if (ring.length === 0) return 16
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const p of ring) {
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
  }
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180)
  const widthM = (maxLng - minLng) * 111320 * Math.cos(midLat)
  const heightM = (maxLat - minLat) * 110574
  const mpp = Math.max((widthM * 1.2) / w, (heightM * 1.2) / h, 0.5)
  const z = Math.floor(18 - Math.log2(mpp))
  return Math.min(STATIC_MAP_ZOOM_MAX, Math.max(STATIC_MAP_ZOOM_MIN, z))
}
