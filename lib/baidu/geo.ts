import type { LngLat } from '../types'

const EARTH_R = 6371008.8

/**
 * 两点直线距离（米），Haversine。BD-09 与 WGS84 在几百米尺度上的距离差可忽略。
 */
export function haversineM(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * 把内部 LngLat 转成百度 Web 服务 API 的参数格式 "lat,lng"（注意顺序是纬度在前）。
 * 保留 6 位小数，避免 URL 过长且让缓存 key 稳定。
 */
export function toLatLngParam(p: LngLat): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`
}

/** 多个点拼成 "lat,lng|lat,lng" */
export function joinLatLng(points: LngLat[]): string {
  return points.map(toLatLngParam).join('|')
}

/** 百度返回的 {lng,lat}（有时是字符串）转成内部 LngLat；非法时返回 null */
export function fromBaiduLocation(loc: unknown): LngLat | null {
  if (!loc || typeof loc !== 'object') return null
  const o = loc as { lng?: unknown; lat?: unknown }
  const lng = Number(o.lng)
  const lat = Number(o.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { lng, lat }
}
