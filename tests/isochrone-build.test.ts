import { describe, expect, it } from 'vitest'
import type { IsochroneSample } from '@/lib/types'
import {
  buildIsochrone,
  reachRadiusOnProfile,
  buildRadialProfiles,
  smoothCircular,
} from '@/lib/isochrone/build'
import { buildSamples, samplePoints, DEFAULT_RADII_M } from '@/lib/isochrone/sampling'
import { haversineM } from '@/lib/isochrone/geo'

const C = { lng: 121.4737, lat: 31.2304 }

/** 理想均匀路网：步速 1.2 m/s，任意方向步行时间 = 半径 / 1.2 */
function uniformSamples(
  speed = 1.2,
  mutate?: (s: IsochroneSample) => IsochroneSample
): IsochroneSample[] {
  return buildSamples(C).map((s) => {
    const withTime: IsochroneSample = { ...s, walkSec: s.radiusM / speed, source: 'api' }
    return mutate ? mutate(withTime) : withTime
  })
}

describe('sampling', () => {
  it('默认 16 方向 × 7 半径 = 112 点，占位 walkSec=null', () => {
    const s = buildSamples(C)
    expect(s).toHaveLength(16 * DEFAULT_RADII_M.length)
    expect(s.every((x) => x.walkSec === null && x.source === 'estimate')).toBe(true)
    expect(haversineM(C, s[6].point)).toBeCloseTo(1800, 2)
    expect(samplePoints(s)).toHaveLength(112)
  })
  it('自定义方向与半径', () => {
    const s = buildSamples(C, { bearings: 8, radiiM: [300, 600] })
    expect(s).toHaveLength(16)
    expect(new Set(s.map((x) => x.bearingDeg)).size).toBe(8)
  })
})

describe('buildIsochrone: 理想均匀路网', () => {
  const iso = buildIsochrone(C, uniformSamples())
  it('15 分钟半径 ≈ 1080 m（900 s × 1.2 m/s），各方向一致', () => {
    for (const r of iso.reachRadiusByBearing) expect(r.radiusM).toBeCloseTo(1080, -1)
  })
  it('三环嵌套且面积递增，5 分钟 ≈ 360 m', () => {
    const [r5, r10, r15] = iso.rings
    expect(r5.minutes).toBe(5)
    expect(r5.areaKm2).toBeLessThan(r10.areaKm2)
    expect(r10.areaKm2).toBeLessThan(r15.areaKm2)
    const p5 = r5.polygon.coordinates[0][0]
    expect(haversineM(C, { lng: p5[0], lat: p5[1] })).toBeCloseTo(360, -1)
  })
  it('多边形闭合、等效半径与圆度接近圆', () => {
    const coords = iso.rings[2].polygon.coordinates[0]
    expect(coords[0]).toEqual(coords[coords.length - 1])
    expect(coords).toHaveLength(17)
    expect(iso.equivalentRadiusM).toBeGreaterThan(1050)
    expect(iso.equivalentRadiusM).toBeLessThan(1085)
    expect(iso.circularity).toBeGreaterThan(0.95)
    expect(iso.circularity).toBeLessThanOrEqual(1)
  })
})

describe('buildIsochrone: 截断 / 单调 / 平滑', () => {
  it('null 样点截断：东向 750 m 起不可达，则东向 15 分钟半径不超过 750 m', () => {
    const samples = uniformSamples(1.2, (s) =>
      s.bearingDeg === 90 && s.radiusM >= 750 ? { ...s, walkSec: null } : s
    )
    const iso = buildIsochrone(C, samples)
    const east = iso.reachRadiusByBearing.find((r) => r.bearingDeg === 90)!
    const north = iso.reachRadiusByBearing.find((r) => r.bearingDeg === 0)!
    expect(east.radiusM).toBeLessThan(north.radiusM)
    // 平滑后仍明显小于均匀值 1080
    expect(east.radiusM).toBeLessThan(950)
    expect(iso.circularity).toBeLessThan(1)
  })
  it('第一个样点即不可达 → 该方向半径 0（平滑后接近 0）', () => {
    const samples = uniformSamples(1.2, (s) => (s.bearingDeg === 180 ? { ...s, walkSec: null } : s))
    const profiles = buildRadialProfiles(samples)
    const south = profiles.find((p) => p.bearingDeg === 180)!
    expect(reachRadiusOnProfile(south, 900)).toMatchObject({ radiusM: 0, unreachable: true })
  })
  it('单调修正：远点比近点快的异常被抹平', () => {
    const profiles = buildRadialProfiles([
      { bearingDeg: 0, radiusM: 250, point: C, walkSec: 400, source: 'api' },
      { bearingDeg: 0, radiusM: 500, point: C, walkSec: 300, source: 'api' },
      { bearingDeg: 0, radiusM: 750, point: C, walkSec: 700, source: 'api' },
    ])
    expect(profiles[0].points.map((p) => p.walkSec)).toEqual([400, 400, 700])
  })
  it('全部未超阈值 → 取最大半径并标记外推；第一个样点已超 → 按比例插值到 0~首半径', () => {
    const fast = buildRadialProfiles([
      { bearingDeg: 0, radiusM: 250, point: C, walkSec: 100, source: 'api' },
      { bearingDeg: 0, radiusM: 500, point: C, walkSec: 200, source: 'api' },
    ])[0]
    expect(reachRadiusOnProfile(fast, 900)).toMatchObject({ radiusM: 500, extrapolated: true })
    const slow = buildRadialProfiles([
      { bearingDeg: 0, radiusM: 250, point: C, walkSec: 1000, source: 'api' },
    ])[0]
    expect(reachRadiusOnProfile(slow, 500).radiusM).toBeCloseTo(125, 6)
  })
  it('圆周平滑核和为 1 且首尾相接', () => {
    expect(smoothCircular([0, 0, 4, 0])).toEqual([0, 1, 2, 1])
    expect(smoothCircular([4, 0, 0, 0])).toEqual([2, 1, 0, 1])
  })
  it('三环嵌套在非均匀输入下仍成立', () => {
    const samples = uniformSamples(1.2, (s) => ({
      ...s,
      walkSec: s.walkSec! * (1 + (Math.sin(s.bearingDeg) + 1) * 0.6),
    }))
    const iso = buildIsochrone(C, samples)
    const radiusAt = (ringIdx: number, i: number) => {
      const [lng, lat] = iso.rings[ringIdx].polygon.coordinates[0][i]
      return haversineM(C, { lng, lat })
    }
    for (let i = 0; i < 16; i++) {
      expect(radiusAt(0, i)).toBeLessThanOrEqual(radiusAt(1, i) + 1e-6)
      expect(radiusAt(1, i)).toBeLessThanOrEqual(radiusAt(2, i) + 1e-6)
    }
  })
  it('无样点返回退化结果', () => {
    const iso = buildIsochrone(C, [])
    expect(iso.rings).toHaveLength(3)
    expect(iso.equivalentRadiusM).toBe(0)
    expect(iso.circularity).toBe(0)
  })
})
