/**
 * 假报告：璧山区政府附近（BD-09），符合 HealthReport 契约，用于后端未接线时走通 UI 与截图（?mock=1）
 */
import type {
  AnalyzeEvent,
  BlindSpotCell,
  CategoryScore,
  FacilityCategory,
  HealthReport,
  Isochrone,
  IsochroneRing,
  IsochroneSample,
  LngLat,
  Poi,
} from '@/lib/types'
import { ESSENTIAL_CATEGORIES, FACILITY_CATEGORIES } from '@/lib/categories'

export const MOCK_CENTER: LngLat = { lng: 106.2277, lat: 29.5921 }

const WALK_MPS = 1.2 // 步行 4.3 km/h
const BEARINGS = 16

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function offset(c: LngLat, dxM: number, dyM: number): LngLat {
  const lat = c.lat + dyM / 111320
  const lng = c.lng + dxM / (111320 * Math.cos((c.lat * Math.PI) / 180))
  return { lng: +lng.toFixed(6), lat: +lat.toFixed(6) }
}

function distM(a: LngLat, b: LngLat): number {
  const dy = (b.lat - a.lat) * 111320
  const dx = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

function polygonAreaKm2(ring: [number, number][], lat: number): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180)
  const ky = 111.32
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    s += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky)
  }
  return Math.abs(s) / 2
}

function pointInRing(p: LngLat, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const hit = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

function buildIsochrone(center: LngLat): Isochrone {
  const rnd = seeded(20260908)
  // 15 分钟各方向可达半径：东南被河道阻隔、西北路网密
  const reach: { bearingDeg: number; radiusM: number }[] = []
  for (let i = 0; i < BEARINGS; i++) {
    const b = (360 / BEARINGS) * i
    const base = 1080
    const dip = b >= 110 && b <= 200 ? 0.55 : 1
    const r = base * dip * (0.88 + rnd() * 0.24)
    reach.push({ bearingDeg: b, radiusM: Math.round(r) })
  }
  const ringFor = (minutes: 5 | 10 | 15): IsochroneRing => {
    const k = minutes / 15
    const coords: [number, number][] = reach.map(({ bearingDeg, radiusM }) => {
      const rad = (bearingDeg * Math.PI) / 180
      const p = offset(center, Math.sin(rad) * radiusM * k, Math.cos(rad) * radiusM * k)
      return [p.lng, p.lat]
    })
    coords.push(coords[0])
    return {
      minutes,
      polygon: { type: 'Polygon', coordinates: [coords] },
      areaKm2: +polygonAreaKm2(coords, center.lat).toFixed(3),
    }
  }
  const rings = [ringFor(15), ringFor(10), ringFor(5)]
  const samples: IsochroneSample[] = []
  for (const { bearingDeg, radiusM } of reach) {
    for (const radius of [300, 600, 900, 1200, 1500]) {
      const rad = (bearingDeg * Math.PI) / 180
      const point = offset(center, Math.sin(rad) * radius, Math.cos(rad) * radius)
      const reachable = radius <= radiusM * 1.35
      samples.push({
        bearingDeg,
        radiusM: radius,
        point,
        walkSec: reachable ? Math.round((radius * 1.28) / WALK_MPS) : null,
        source: reachable ? 'api' : 'estimate',
      })
    }
  }
  const area15 = rings[0].areaKm2
  const equivalentRadiusM = Math.round(Math.sqrt((area15 * 1e6) / Math.PI))
  const radii = reach.map((r) => r.radiusM)
  const circularity = +(Math.min(...radii) / Math.max(...radii)).toFixed(2)
  return { center, rings, samples, reachRadiusByBearing: reach, equivalentRadiusM, circularity }
}

type PoiSeed = [FacilityCategory, string, number, number]
const POI_SEEDS: PoiSeed[] = [
  ['market', '璧山农贸市场（北门）', 320, 410],
  ['market', '永辉生活·文风路店', -760, 180],
  ['pharmacy', '桐君阁大药房（金剑路店）', 210, -160],
  ['pharmacy', '和平药房', -430, 520],
  ['pharmacy', '万和药房·璧泉店', 980, -620],
  ['primary_school', '璧山区实验小学', -560, -690],
  ['primary_school', '北街小学', 640, 830],
  ['kindergarten', '璧泉幼儿园', -280, 360],
  ['kindergarten', '金剑路幼儿园', 470, -390],
  ['clinic', '璧泉街道社区卫生服务中心', 150, 720],
  ['clinic', '康民诊所', -890, -260],
  ['elderly', '璧山区社会福利院', 1250, 900],
  ['elderly', '璧泉街道养老服务站', -1020, 640],
  ['supermarket', '罗森便利店（东林大道）', 90, -240],
  ['supermarket', '重百超市璧山店', -640, 60],
  ['supermarket', '美宜佳（金剑路）', 520, 240],
  ['park', '秀湖公园', 1400, -300],
  ['park', '璧山文化公园', -350, -450],
  ['park', '东岳体育公园', 780, 1180],
  ['bus_stop', '璧山区政府公交站', 60, 140],
  ['bus_stop', '金剑路口公交站', 430, -150],
  ['bus_stop', '轨道交通璧山站', -1380, -1120],
  ['bank', '中国银行璧山支行', -190, 90],
  ['bank', '重庆农商行璧泉分理处', 350, 560],
  ['bank', '建设银行 ATM（东林大道）', 720, -560],
]

function buildPois(center: LngLat, iso: Isochrone): Poi[] {
  const rnd = seeded(7)
  const ring15 = iso.rings[0].polygon.coordinates[0]
  return POI_SEEDS.map(([category, name, dx, dy], i) => {
    const location = offset(center, dx, dy)
    const straightM = Math.round(distM(center, location))
    const detour = 1.18 + rnd() * 0.3
    const walkM = Math.round(straightM * detour)
    const walkSec = Math.round(walkM / WALK_MPS)
    const useApi = i % 6 !== 5
    return {
      uid: `mock-${category}-${i}`,
      name,
      category,
      location,
      address: `重庆市璧山区璧泉街道`,
      straightM,
      walkM,
      walkSec,
      walkSource: useApi ? 'api' : 'estimate',
      inIsochrone: pointInRing(location, ring15),
    }
  })
}

function scoreCategories(pois: Poi[]): CategoryScore[] {
  return FACILITY_CATEGORIES.map((meta) => {
    const list = pois.filter((p) => p.category === meta.key)
    const nearest = list.slice().sort((a, b) => (a.walkSec ?? 1e9) - (b.walkSec ?? 1e9))[0]
    const nearestWalkMin = nearest?.walkSec != null ? Math.round(nearest.walkSec / 60) : null
    const countInIsochrone = list.filter((p) => p.inIsochrone).length
    const countWithin1km = list.filter((p) => p.straightM <= 1000).length
    let score = 0
    if (nearestWalkMin != null) {
      score = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, nearestWalkMin - 5) * 5.5)))
      score = Math.min(100, score + Math.min(15, countInIsochrone * 5))
    }
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'
    const diagnosis =
      nearestWalkMin == null
        ? `15 分钟步行范围内没有${meta.label}`
        : nearestWalkMin <= 10
          ? `最近${meta.label}步行 ${nearestWalkMin} 分钟，覆盖良好`
          : nearestWalkMin <= 15
            ? `最近${meta.label}步行 ${nearestWalkMin} 分钟，刚好达标`
            : `最近${meta.label}步行 ${nearestWalkMin} 分钟，超出 15 分钟`
    return {
      category: meta.key,
      label: meta.label,
      essential: meta.essential,
      countInIsochrone,
      countWithin1km,
      nearestWalkMin,
      nearest,
      score,
      grade,
      diagnosis,
    }
  })
}

function buildBlindSpots(center: LngLat, pois: Poi[], iso: Isochrone): BlindSpotCell[] {
  const cells: BlindSpotCell[] = []
  const size = 200
  const ring15 = iso.rings[0].polygon.coordinates[0]
  const essential = ESSENTIAL_CATEGORIES
  for (let gx = -7; gx <= 7; gx++) {
    for (let gy = -7; gy <= 7; gy++) {
      const c = offset(center, gx * size, gy * size)
      const missing = essential.filter(
        (cat) => !pois.some((p) => p.category === cat && distM(c, p.location) <= 1000)
      )
      if (missing.length === 0) continue
      cells.push({
        center: c,
        sizeM: size,
        missing,
        severity: +(missing.length / essential.length).toFixed(2),
        inIsochrone: pointInRing(c, ring15),
      })
    }
  }
  return cells
}

export function buildMockReport(center: LngLat = MOCK_CENTER): HealthReport {
  const isochrone = buildIsochrone(center)
  const pois = buildPois(center, isochrone)
  const categories = scoreCategories(pois)
  const blindSpots = buildBlindSpots(center, pois, isochrone)
  const essentialScores = categories.filter((c) => c.essential)
  const otherScores = categories.filter((c) => !c.essential)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  const overallScore = Math.round(
    avg(essentialScores.map((c) => c.score)) * 0.6 + avg(otherScores.map((c) => c.score)) * 0.4
  )
  const overallGrade =
    overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 50 ? 'C' : 'D'
  const worst = categories.slice().sort((a, b) => a.score - b.score)[0]
  const inner = blindSpots.filter((b) => b.inIsochrone)
  return {
    id: 'mock-bishan-001',
    generatedAt: new Date().toISOString(),
    center,
    address: {
      formatted: '重庆市璧山区璧泉街道双星大道 172 号',
      province: '重庆市',
      city: '重庆市',
      district: '璧山区',
      street: '双星大道',
    },
    isochrone,
    pois,
    categories,
    blindSpots,
    overallScore,
    overallGrade,
    headline: [
      `菜市场、药店、小学三项硬指标齐备，最远的小学步行 ${categories.find((c) => c.category === 'primary_school')?.nearestWalkMin ?? '—'} 分钟`,
      `东南方向受河道阻隔，15 分钟可达半径不足 600 米，圆度 ${isochrone.circularity}`,
      `圈内 ${inner.length} 个盲区网格，主要缺${worst.label}`,
    ],
    suggestions: [
      {
        priority: 'high',
        text: '东南片区 1 公里内无菜市场，建议在双星大道南段增设社区生鲜菜场或流动菜车定点',
        category: 'market',
      },
      {
        priority: 'high',
        text: '河道两岸缺少步行连接，建议增加一座人行桥或开放现有堤岸步道，可将 15 分钟圈面积扩大约 20%',
        category: undefined,
      },
      {
        priority: 'medium',
        text: '养老服务设施均在 15 分钟圈外，建议依托璧泉街道社区卫生服务中心增设日间照料点',
        category: 'elderly',
      },
      {
        priority: 'medium',
        text: '北部片区仅一所小学，学龄人口若持续增长需预留教育用地',
        category: 'primary_school',
      },
      {
        priority: 'low',
        text: '轨道站步行 20 分钟以上，可在区政府站增开接驳公交',
        category: 'bus_stop',
      },
    ],
    apiStats: {
      geocode: 2,
      placeSearch: 30,
      routeMatrix: 9,
      routeMatrixPairs: 105,
      cacheHits: 12,
      rateLimited: 1,
      degraded: 4,
      elapsedMs: 6830,
    },
    dataSource: 'sample',
    warnings: [
      '当前为内置样例数据，非实时调用结果',
      '4 处设施步行时间为直线距离估算（批量算路限流降级）',
    ],
  }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

/** 模拟 SSE 分步推送，节奏与真实后端接近 */
export async function runMockAnalysis(
  center: LngLat,
  emit: (ev: AnalyzeEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const report = buildMockReport(center)
  const steps: [AnalyzeEvent, number][] = [
    [{ type: 'stage', stage: 'geocode', message: '逆地理编码中心点', progress: 0.05 }, 300],
    [
      { type: 'stage', stage: 'sampling', message: '布设 16 方向 × 5 环采样点', progress: 0.15 },
      300,
    ],
    [
      { type: 'stage', stage: 'routing', message: '批量步行算路（80 个采样点）', progress: 0.35 },
      700,
    ],
    [
      { type: 'stage', stage: 'isochrone', message: '拟合 5 / 10 / 15 分钟等时圈', progress: 0.45 },
      300,
    ],
    [{ type: 'partial', key: 'isochrone', data: report.isochrone }, 100],
    [{ type: 'stage', stage: 'poi_search', message: '检索 10 类民生设施', progress: 0.6 }, 700],
    [{ type: 'stage', stage: 'poi_routing', message: '计算设施步行时间', progress: 0.75 }, 500],
    [{ type: 'error', message: '批量算路触发限流，4 处设施改用估算', recoverable: true }, 100],
    [{ type: 'partial', key: 'pois', data: report.pois }, 100],
    [{ type: 'stage', stage: 'scoring', message: '评分与诊断', progress: 0.85 }, 400],
    [{ type: 'stage', stage: 'blindspot', message: '扫描 200 m 网格盲区', progress: 0.95 }, 500],
    [{ type: 'done', report }, 0],
  ]
  for (const [ev, ms] of steps) {
    if (signal.aborted) return
    emit(ev)
    if (ms) await wait(ms, signal)
  }
}
