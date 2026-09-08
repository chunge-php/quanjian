/**
 * 流水线内部小工具：距离、估算、短 id、空统计。
 * 这里刻意不依赖 lib/baidu / lib/isochrone，保证在其它层未落地时也能跑通测试。
 */
import type { ApiStats, LngLat } from '@/lib/types'

/** 步行绕行系数：直线距离 × 1.3 ≈ 路网步行距离（城市平均经验值） */
export const DETOUR_FACTOR = 1.3
/** 步行速度 1.2 m/s（≈ 72 m/min，规划指南常用 1.2） */
export const WALK_SPEED_MPS = 1.2

/** 两点球面距离（米），BD-09 直接按球面近似即可 */
export function haversineM(a: LngLat, b: LngLat): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** 本地兜底的步行估算（真实层 estimateWalk 不可用时使用） */
export function estimateWalkLocal(straightM: number): { walkM: number; walkSec: number } {
  const walkM = Math.round(straightM * DETOUR_FACTOR)
  return { walkM, walkSec: Math.round(walkM / WALK_SPEED_MPS) }
}

/** 短 uuid（8 位），报告 id 用 */
export function shortId(): string {
  const raw =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(16).slice(2) + Date.now().toString(16)
  return raw.replace(/-/g, '').slice(0, 8)
}

/** 全 0 的 ApiStats */
export function emptyStats(): ApiStats {
  return {
    geocode: 0,
    placeSearch: 0,
    routeMatrix: 0,
    routeMatrixPairs: 0,
    cacheHits: 0,
    rateLimited: 0,
    degraded: 0,
    elapsedMs: 0,
  }
}

/** 把任意异常转成中文可读的一句话 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

/** 用简单的射线法判断点是否在环内（本地兜底，真实层 pointInPolygon 不可用时使用） */
export function pointInRingLocal(p: LngLat, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
