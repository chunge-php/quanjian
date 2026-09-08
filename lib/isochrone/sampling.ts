/**
 * 圈见 · 等时圈扇形采样
 *
 * 思路（对应赛题"在不获取底层路网数据的前提下，通过扇形采样推导连通区域"）：
 * 以体检中心为原点，向 16 个方位角各铺 7 个半径的采样点，共 112 个 O-D 对，
 * 交给百度批量算路（步行）拿到每点的真实步行时长；本模块只负责铺点，不发请求。
 * 半径序列 250→1800 m 覆盖 1.2 m/s 步速下 3~25 分钟的范围，1500 以后加密到 1800
 * 是为了给"15 分钟远超 1000 m"的通畅方向留出插值余地。
 */
import type { IsochroneSample, LngLat } from '../types'
import { bearingsList, destinationPoint } from './geo'

/** 默认方向数 */
export const DEFAULT_BEARINGS = 16
/** 默认采样半径（米），必须严格递增 */
export const DEFAULT_RADII_M: readonly number[] = [250, 500, 750, 1000, 1250, 1500, 1800]

export interface SamplingOptions {
  /** 方向数，默认 16 */
  bearings?: number
  /** 采样半径列表（米），默认 DEFAULT_RADII_M */
  radiiM?: number[]
}

/**
 * 生成采样点占位（walkSec=null, source='estimate'）。
 * 顺序：先方位角、后半径，便于算路层按批切片；同一方向的点在数组中连续。
 */
export function buildSamples(center: LngLat, opts: SamplingOptions = {}): IsochroneSample[] {
  const bearings = bearingsList(opts.bearings ?? DEFAULT_BEARINGS)
  const radii = [...(opts.radiiM ?? DEFAULT_RADII_M)].filter((r) => r > 0).sort((a, b) => a - b)
  const out: IsochroneSample[] = []
  for (const bearingDeg of bearings) {
    for (const radiusM of radii) {
      out.push({
        bearingDeg,
        radiusM,
        point: destinationPoint(center, bearingDeg, radiusM),
        walkSec: null,
        source: 'estimate',
      })
    }
  }
  return out
}

/** 提取采样点坐标列表（与 samples 顺序一致），供批量算路作为 destinations */
export function samplePoints(samples: IsochroneSample[]): LngLat[] {
  return samples.map((s) => s.point)
}

/**
 * 当 API 失败需要降级时，用"直线距离 × 绕行系数 ÷ 步速"估算步行秒数。
 * 绕行系数 1.25 取自城市路网经验值（曼哈顿型路网约 1.2~1.4）。
 */
export const WALK_SPEED_MPS = 1.2
export const DETOUR_FACTOR = 1.25
export function estimateWalkSec(straightM: number): number {
  return (straightM * DETOUR_FACTOR) / WALK_SPEED_MPS
}
