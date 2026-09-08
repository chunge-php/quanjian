import { describe, expect, it } from 'vitest'
import {
  bboxOf,
  bearingBetween,
  bearingsList,
  destinationPoint,
  haversineM,
  offsetMeters,
  pointInPolygon,
  polygonAreaKm2,
  polygonPerimeterM,
} from '@/lib/isochrone/geo'

const SH = { lng: 121.4737, lat: 31.2304 } // 上海人民广场

describe('geo: 距离与方位', () => {
  it('赤道上 1° 纬度 ≈ 111.195 km', () => {
    expect(haversineM({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })).toBeCloseTo(111194.9, 0)
  })
  it('上海人民广场 → 北京天安门 ≈ 1067 km', () => {
    const d = haversineM(SH, { lng: 116.3975, lat: 39.9087 })
    expect(d).toBeGreaterThan(1060_000)
    expect(d).toBeLessThan(1075_000)
  })
  it('destinationPoint 往返一致：向东 1000 m 后距离 ≈ 1000 m，方位 ≈ 90°', () => {
    const p = destinationPoint(SH, 90, 1000)
    expect(haversineM(SH, p)).toBeCloseTo(1000, 3)
    expect(bearingBetween(SH, p)).toBeCloseTo(90, 1)
  })
  it('offsetMeters 向北 500 m、向东 300 m', () => {
    const n = offsetMeters(SH, 0, 500)
    expect(haversineM(SH, n)).toBeCloseTo(500, 0)
    expect(bearingBetween(SH, n)).toBeCloseTo(0, 1)
    const e = offsetMeters(SH, 300, 0)
    expect(haversineM(SH, e)).toBeCloseTo(300, 0)
  })
  it('bearingsList(16) 步长 22.5°', () => {
    const b = bearingsList(16)
    expect(b).toHaveLength(16)
    expect(b[0]).toBe(0)
    expect(b[1]).toBe(22.5)
    expect(b[15]).toBe(337.5)
  })
})

describe('geo: 多边形', () => {
  const square = [
    offsetMeters(SH, -500, -500),
    offsetMeters(SH, 500, -500),
    offsetMeters(SH, 500, 500),
    offsetMeters(SH, -500, 500),
  ]
  it('1 km 见方正方形面积 ≈ 1 km²，周长 ≈ 4000 m', () => {
    expect(polygonAreaKm2(square)).toBeCloseTo(1, 2)
    expect(polygonAreaKm2([...square, square[0]])).toBeCloseTo(1, 2) // 闭合环等价
    expect(polygonPerimeterM([...square, square[0]])).toBeCloseTo(4000, -1)
  })
  it('射线法：中心在内，2 km 外在外，支持 GeoJSON 元组', () => {
    expect(pointInPolygon(SH, square)).toBe(true)
    expect(pointInPolygon(offsetMeters(SH, 2000, 0), square)).toBe(false)
    const tuples = square.map((p) => [p.lng, p.lat] as [number, number])
    expect(pointInPolygon(SH, tuples)).toBe(true)
  })
  it('bboxOf', () => {
    const b = bboxOf(square)
    expect(b.minLng).toBeLessThan(SH.lng)
    expect(b.maxLat).toBeGreaterThan(SH.lat)
    expect(bboxOf([])).toEqual({ minLng: 0, minLat: 0, maxLng: 0, maxLat: 0 })
  })
})
