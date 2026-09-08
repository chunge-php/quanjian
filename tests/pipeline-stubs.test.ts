/**
 * 流水线测试公用 stub：纯内存实现 PipelineDeps，可按需注入故障。
 * （放在 tests/ 下并带一个自检用例，便于其它 pipeline 测试复用）
 */
import { describe, expect, it } from 'vitest'
import type { PipelineDeps, WalkTime } from '@/lib/pipeline/deps'
import type { ApiStats, CategoryScore, Isochrone, IsochroneSample, LngLat, Poi } from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'

export const CENTER: LngLat = { lng: 106.2277, lat: 29.5921 }

/** 可注入的故障开关 */
export interface StubFaults {
  geocodeThrows?: boolean
  geocodeNull?: boolean
  reverseThrows?: boolean
  routingThrows?: boolean
  poiRoutingThrows?: boolean
  searchThrows?: boolean
  /** 逐类检索：这些类别抛错 */
  categoryThrows?: string[]
  isochroneThrows?: boolean
  scoringThrows?: boolean
  blindspotThrows?: boolean
  overallThrows?: boolean
  perCategory?: boolean
}

function offset(c: LngLat, dxM: number, dyM: number): LngLat {
  return {
    lng: c.lng + dxM / (111320 * Math.cos((c.lat * Math.PI) / 180)),
    lat: c.lat + dyM / 111320,
  }
}

function circleRing(c: LngLat, r: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * 2 * Math.PI
    const p = offset(c, r * Math.cos(a), r * Math.sin(a))
    pts.push([p.lng, p.lat])
  }
  return pts
}

export function stubIsochrone(center: LngLat, samples: IsochroneSample[]): Isochrone {
  const rings = ([5, 10, 15] as const).map((minutes) => {
    const r = minutes * 60 * 1.2
    return {
      minutes,
      polygon: { type: 'Polygon' as const, coordinates: [circleRing(center, r)] },
      areaKm2: (Math.PI * r * r) / 1e6,
    }
  })
  return {
    center,
    rings,
    samples,
    reachRadiusByBearing: samples.map((s) => ({ bearingDeg: s.bearingDeg, radiusM: 1080 })),
    equivalentRadiusM: 1080,
    circularity: 1,
  }
}

export function stubPois(center: LngLat): Poi[] {
  // 每个类别一个 POI，距离递增：market 300m、pharmacy 600m、primary_school 900m…；后面的超出 1080m 圈
  return FACILITY_CATEGORIES.map((c, i) => {
    const d = 300 * (i + 1)
    return {
      uid: `uid-${c.key}`,
      name: `${c.label}-测试`,
      category: c.key,
      location: offset(center, d, 0),
      straightM: d,
      walkM: null,
      walkSec: null,
      walkSource: 'estimate' as const,
      inIsochrone: false,
    }
  })
}

/** 构造 stub deps；调用记录在 calls 里 */
export function makeStubDeps(faults: StubFaults = {}, over: Partial<PipelineDeps> = {}) {
  const calls: string[] = []
  let stats: ApiStats = {
    geocode: 0,
    placeSearch: 0,
    routeMatrix: 0,
    routeMatrixPairs: 0,
    cacheHits: 0,
    rateLimited: 0,
    degraded: 0,
    elapsedMs: 0,
  }
  const walk = (origin: LngLat, pts: LngLat[]): WalkTime[] =>
    pts.map((p) => {
      const dx = (p.lng - origin.lng) * 111320 * Math.cos((origin.lat * Math.PI) / 180)
      const dy = (p.lat - origin.lat) * 111320
      const m = Math.round(Math.hypot(dx, dy) * 1.2)
      return { walkM: m, walkSec: Math.round(m / 1.2), source: 'api' }
    })
  const deps: PipelineDeps = {
    hasAk: true,
    allowSampleFallback: false,
    samplesDir: '/nonexistent-samples-dir',
    async geocode(address) {
      calls.push('geocode')
      stats.geocode++
      if (faults.geocodeThrows) throw new Error('geocode 网络错误')
      if (faults.geocodeNull) return null
      return { location: CENTER, address }
    },
    async reverseGeocode() {
      calls.push('reverseGeocode')
      stats.geocode++
      if (faults.reverseThrows) throw new Error('reverse 网络错误')
      return {
        formatted: '重庆市璧山区璧泉街道',
        province: '重庆市',
        city: '重庆市',
        district: '璧山区',
        street: '璧泉街道',
      }
    },
    buildSamples(center, { bearings }) {
      calls.push('buildSamples')
      const out: IsochroneSample[] = []
      for (let b = 0; b < bearings; b++)
        for (const radiusM of [500, 1000, 1500]) {
          const a = ((b * 360) / bearings) * (Math.PI / 180)
          out.push({
            bearingDeg: (b * 360) / bearings,
            radiusM,
            point: offset(center, radiusM * Math.sin(a), radiusM * Math.cos(a)),
            walkSec: null,
            source: 'estimate',
          })
        }
      return out
    },
    async attachWalkTimes(origin, points) {
      const isSample = calls.filter((c) => c === 'attachWalkTimes').length === 0
      calls.push('attachWalkTimes')
      if (isSample && faults.routingThrows) throw new Error('routeMatrix 限流')
      if (!isSample && faults.poiRoutingThrows) throw new Error('routeMatrix 限流')
      stats.routeMatrix++
      stats.routeMatrixPairs += points.length
      return walk(origin, points)
    },
    buildIsochrone(center, samples) {
      calls.push('buildIsochrone')
      if (faults.isochroneThrows) throw new Error('isochrone 崩溃')
      return stubIsochrone(center, samples)
    },
    pointInPolygon(p, ring) {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi)
          inside = !inside
      }
      return inside
    },
    async searchFacilities(center) {
      calls.push('searchFacilities')
      stats.placeSearch += 10
      if (faults.searchThrows) throw new Error('placeSearch 失败')
      return stubPois(center)
    },
    detectBlindSpots(center) {
      calls.push('detectBlindSpots')
      if (faults.blindspotThrows) throw new Error('blindspot 崩溃')
      return [
        {
          center: offset(center, 1200, 1200),
          sizeM: 200,
          missing: ['market'],
          severity: 1 / 3,
          inIsochrone: false,
        },
      ]
    },
    summarizeBlindSpots(cells) {
      return { cellCount: cells.length }
    },
    scoreCategories(pois) {
      calls.push('scoreCategories')
      if (faults.scoringThrows) throw new Error('scoring 崩溃')
      return FACILITY_CATEGORIES.map<CategoryScore>((c) => {
        const mine = pois.filter((p) => p.category === c.key)
        const inIso = mine.filter((p) => p.inIsochrone).length
        return {
          category: c.key,
          label: c.label,
          essential: c.essential,
          countInIsochrone: inIso,
          countWithin1km: mine.filter((p) => p.straightM <= 1000).length,
          nearestWalkMin: mine[0]?.walkSec != null ? mine[0].walkSec / 60 : null,
          score: inIso ? 90 : 20,
          grade: inIso ? 'A' : 'D',
          diagnosis: inIso ? '覆盖良好' : '缺失',
        }
      })
    },
    buildOverall(categories) {
      calls.push('buildOverall')
      if (faults.overallThrows) throw new Error('overall 崩溃')
      const score = Math.round(
        categories.reduce((s, c) => s + c.score, 0) / Math.max(categories.length, 1)
      )
      return {
        overallScore: score,
        overallGrade: score >= 80 ? 'A' : 'C',
        headline: ['测试结论'],
        suggestions: [{ priority: 'high', text: '补菜市场', category: 'market' }],
      }
    },
    getStats: () => ({ ...stats }),
    resetStats() {
      calls.push('resetStats')
      stats = {
        geocode: 0,
        placeSearch: 0,
        routeMatrix: 0,
        routeMatrixPairs: 0,
        cacheHits: 0,
        rateLimited: 0,
        degraded: 0,
        elapsedMs: 0,
      }
    },
    ...over,
  }
  if (faults.perCategory) {
    deps.searchCategory = async (center, _r, category) => {
      calls.push(`searchCategory:${category}`)
      stats.placeSearch++
      if (faults.categoryThrows?.includes(category)) throw new Error(`${category} 检索失败`)
      return stubPois(center).filter((p) => p.category === category)
    }
  }
  return { deps, calls }
}

describe('stub deps 自检', () => {
  it('能生成采样点与 POI', async () => {
    const { deps } = makeStubDeps()
    expect(deps.buildSamples(CENTER, { bearings: 8 })).toHaveLength(24)
    expect(await deps.searchFacilities(CENTER, 1800)).toHaveLength(FACILITY_CATEGORIES.length)
  })
})
