/** 街道级批量体检：网格布点 planGrid */
import { describe, expect, it } from 'vitest'
import { areaCenter, areaKm2Of, planGrid } from '@/lib/batch/grid'
import { haversineM } from '@/lib/isochrone/geo'
import type { BatchArea, LngLat } from '@/lib/types'

const C: LngLat = { lng: 106.2277, lat: 29.5921 }
const circle: BatchArea = { kind: 'circle', center: C, radiusM: 1500 }

/** 以 C 为原点向东 dx、向北 dy 米的点 */
function off(dxM: number, dyM: number): LngLat {
  return {
    lng: C.lng + dxM / (111320 * Math.cos((C.lat * Math.PI) / 180)),
    lat: C.lat + dyM / 111320,
  }
}

describe('planGrid · 圆', () => {
  it('所有点都在圆内，且第一个点是圆心', () => {
    // r=1200、间距 500：5×5 网格去掉 4 个角 = 21 点，未触发上限
    const plan = planGrid({ kind: 'circle', center: C, radiusM: 1200 }, 500, 25)
    expect(plan.points.length).toBe(21)
    for (const p of plan.points) expect(haversineM(C, p)).toBeLessThanOrEqual(1200 + 1)
    expect(haversineM(C, plan.points[0])).toBeLessThan(1)
    expect(plan.spacingM).toBe(500)
    expect(plan.areaKm2).toBeCloseTo(Math.PI * 1.2 * 1.2, 3)
  })
  it('按离中心由近到远排序', () => {
    const plan = planGrid(circle, 500, 25)
    const d = plan.points.map((p) => haversineM(C, p))
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1] - 1e-6)
  })
  it('超过 maxPoints 时放大间距重铺，点数 ≤ maxPoints', () => {
    const plan = planGrid(circle, 200, 16)
    expect(plan.points.length).toBeLessThanOrEqual(16)
    expect(plan.points.length).toBeGreaterThanOrEqual(9)
    expect(plan.spacingM).toBeGreaterThan(200)
    // 放大后的间距应接近 √(面积/点数)
    expect(plan.spacingM).toBeGreaterThanOrEqual(Math.floor(Math.sqrt((plan.areaKm2 * 1e6) / 16)))
  })
  it('间距大于半径时至少返回中心 1 点', () => {
    const plan = planGrid({ kind: 'circle', center: C, radiusM: 300 }, 1500, 16)
    expect(plan.points).toHaveLength(1)
    expect(haversineM(C, plan.points[0])).toBeLessThan(1)
  })
  it('maxPoints=1 只返回中心', () => {
    const plan = planGrid(circle, 500, 1)
    expect(plan.points).toHaveLength(1)
    expect(haversineM(C, plan.points[0])).toBeLessThan(1)
  })
})

describe('planGrid · 矩形', () => {
  const rect: BatchArea = { kind: 'rect', sw: off(-1000, -600), ne: off(1000, 600) }
  it('铺满矩形内，全部点在包围盒内', () => {
    const plan = planGrid(rect, 400, 100)
    expect(plan.points.length).toBe(5 * 3) // 2000/400 → -2..2 共 5 列；1200/400 → -1..1 共 3 行
    for (const p of plan.points) {
      expect(p.lng).toBeGreaterThanOrEqual(rect.sw.lng - 1e-9)
      expect(p.lng).toBeLessThanOrEqual(rect.ne.lng + 1e-9)
      expect(p.lat).toBeGreaterThanOrEqual(rect.sw.lat - 1e-9)
      expect(p.lat).toBeLessThanOrEqual(rect.ne.lat + 1e-9)
    }
    expect(plan.areaKm2).toBeCloseTo(2.4, 1)
  })
  it('区域中心取对角中点，且为第一个点', () => {
    const c = areaCenter(rect)
    expect(haversineM(c, C)).toBeLessThan(1)
    expect(haversineM(planGrid(rect, 400, 100).points[0], c)).toBeLessThan(1)
  })
  it('上限限制：25 点硬上限', () => {
    const plan = planGrid(rect, 200, 99)
    expect(plan.points.length).toBeLessThanOrEqual(25)
  })
  it('areaKm2Of 与 geo 计算一致', () => {
    expect(areaKm2Of(rect)).toBeCloseTo(2.4, 1)
    expect(areaKm2Of(circle)).toBeCloseTo(7.069, 2)
  })
})
