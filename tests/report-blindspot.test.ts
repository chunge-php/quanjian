import { describe, expect, it } from 'vitest'
import type { Poi } from '@/lib/types'
import { buildIsochrone, buildSamples, offsetMeters, haversineM } from '@/lib/isochrone'
import { buildGridCenters, detectBlindSpots, summarizeBlindSpots } from '@/lib/report/blindspot'

const C = { lng: 121.4737, lat: 31.2304 }
const iso = buildIsochrone(
  C,
  buildSamples(C).map((s) => ({ ...s, walkSec: s.radiusM / 1.2, source: 'api' as const }))
)

function poi(category: Poi['category'], dx: number, dy: number): Poi {
  const location = offsetMeters(C, dx, dy)
  return {
    uid: `${category}-${dx}-${dy}`,
    name: category,
    category,
    location,
    straightM: haversineM(C, location),
    walkM: null,
    walkSec: null,
    walkSource: 'estimate',
    inIsochrone: false,
  }
}

/** 除 skip 外的硬指标按 500 m 网格密铺（保证全范围覆盖） */
function denseExcept(skip: Poi['category']): Poi[] {
  const out: Poi[] = []
  for (const c of ['market', 'pharmacy', 'primary_school'] as const) {
    if (c === skip) continue
    for (let dx = -1500; dx <= 1500; dx += 500)
      for (let dy = -1500; dy <= 1500; dy += 500) out.push(poi(c, dx, dy))
  }
  return out
}

describe('detectBlindSpots', () => {
  it('网格铺设：1500 m 半径内 200 m 网格约 176 个', () => {
    const n = buildGridCenters(C).length
    expect(n).toBeGreaterThan(160)
    expect(n).toBeLessThan(190)
  })
  it('三类硬指标都在中心附近 → 中心网格不是盲区，远端网格可能是', () => {
    const pois = [poi('market', 0, 0), poi('pharmacy', 50, 0), poi('primary_school', 0, 50)]
    const cells = detectBlindSpots(C, pois, iso)
    const atCenter = cells.find((c) => haversineM(c.center, C) < 1)
    expect(atCenter).toBeUndefined()
    // 距中心 1400 m 的网格离所有 POI > 1000 m，应为盲区且缺三类
    const far = cells.find((c) => Math.abs(haversineM(c.center, C) - 1400) < 1)
    expect(far).toBeDefined()
    expect(far!.missing.sort()).toEqual(['market', 'pharmacy', 'primary_school'])
    expect(far!.severity).toBeCloseTo(1)
    expect(far!.inIsochrone).toBe(false) // 15 分钟半径 ≈ 1080 m
  })
  it('只缺小学：所有盲区单元 missing 只含 primary_school，圈内标记正确', () => {
    const cells = detectBlindSpots(C, denseExcept('primary_school'), iso)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((c) => c.missing.length === 1 && c.missing[0] === 'primary_school')).toBe(
      true
    )
    expect(cells.every((c) => Math.abs(c.severity - 1 / 3) < 1e-9)).toBe(true)
    const center = cells.find((c) => haversineM(c.center, C) < 1)!
    expect(center.inIsochrone).toBe(true)
    expect(cells.some((c) => !c.inIsochrone)).toBe(true)
  })
  it('三类硬指标全部密集覆盖 → 零盲区', () => {
    const pois: Poi[] = []
    for (let dx = -1500; dx <= 1500; dx += 500)
      for (let dy = -1500; dy <= 1500; dy += 500)
        pois.push(poi('market', dx, dy), poi('pharmacy', dx, dy), poi('primary_school', dx, dy))
    expect(detectBlindSpots(C, pois, iso)).toHaveLength(0)
  })
  it('非硬指标 POI 不影响盲区判定；自定义参数生效', () => {
    const pois = [poi('park', 0, 0), poi('bank', 0, 0)]
    const cells = detectBlindSpots(C, pois, iso, { cellM: 500, extentM: 1000, radiusM: 800 })
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.every((c) => c.sizeM === 500 && c.missing.length === 3)).toBe(true)
  })
})

describe('summarizeBlindSpots', () => {
  it('统计数量、面积、分类别计数、质心', () => {
    const pois = [...denseExcept('primary_school'), poi('primary_school', -1200, 0)]
    const cells = detectBlindSpots(C, pois, iso)
    const s = summarizeBlindSpots(cells)
    expect(s.cellCount).toBe(cells.length)
    expect(s.areaKm2).toBeCloseTo(cells.length * 0.04, 6)
    expect(s.byCategory.primary_school).toBeGreaterThan(0)
    expect(s.byCategory.park).toBe(0)
    expect(s.inIsochroneCount).toBe(cells.filter((c) => c.inIsochrone).length)
    // 小学在西侧，缺小学的网格质心应偏东
    expect(s.centroidByCategory.primary_school!.lng).toBeGreaterThan(C.lng)
    expect(s.centroidByCategory.market).toBeUndefined()
  })
  it('空输入', () => {
    const s = summarizeBlindSpots([])
    expect(s.cellCount).toBe(0)
    expect(s.areaKm2).toBe(0)
    expect(s.inIsochroneCount).toBe(0)
  })
})
