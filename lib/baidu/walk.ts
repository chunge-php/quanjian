/**
 * 步行时间附着：批量算路 + 失败降级估算。
 */
import type { LngLat } from '../types'
import type { BaiduClient } from './client'
import { haversineM } from './geo'

/** 直线距离 → 步行距离折减系数（城市路网绕行经验值） */
export const WALK_DETOUR_FACTOR = 1.3
/** 步行速度 m/s（约 4.3 km/h，老人小孩友好取值） */
export const WALK_SPEED_MPS = 1.2

export interface WalkTime {
  walkM: number | null
  walkSec: number | null
  source: 'api' | 'estimate'
}

/**
 * 用直线距离估算步行距离与时长：walkM = straight×1.3，walkSec = walkM / 1.2。
 * 供算路失败、无 AK、样例模式等场景复用。
 */
export function estimateWalk(straightM: number): WalkTime {
  const walkM = Math.round(straightM * WALK_DETOUR_FACTOR)
  return { walkM, walkSec: Math.round(walkM / WALK_SPEED_MPS), source: 'estimate' }
}

/**
 * 给一批目标点附上从 origin 出发的步行距离/时长。
 * - 走 client.routeMatrixWalking（内部分批/并发/缓存）；
 * - 任一单元失败（null）或整体抛错（含缺 AK）→ 该点降级为估算，source='estimate'，每个点计一次 stats.degraded；
 * - 返回数组与 points 一一对应，永不抛错。
 */
export async function attachWalkTimes(
  client: BaiduClient,
  origin: LngLat,
  points: LngLat[]
): Promise<WalkTime[]> {
  if (!points.length) return []
  let row: (import('./client').RouteMatrixCell | null)[] = points.map(() => null)
  try {
    const m = await client.routeMatrixWalking([origin], points)
    row = m[0] ?? row
  } catch {
    /* 缺 AK 或不可预期错误：整体降级 */
  }
  return points.map((p, i) => {
    const cell = row[i]
    if (cell && cell.distanceM >= 0 && cell.durationSec >= 0) {
      return { walkM: cell.distanceM, walkSec: cell.durationSec, source: 'api' }
    }
    client.stats.degraded += 1
    return estimateWalk(haversineM(origin, p))
  })
}
