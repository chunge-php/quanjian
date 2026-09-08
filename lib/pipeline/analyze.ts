/**
 * 分析流水线主入口：中心点 → 等时圈 → 设施检索 → 评分 → 盲区 → 体检报告。
 *
 * 阶段顺序固定为 AnalyzeStage：geocode → sampling → routing → isochrone →
 * poi_search → poi_routing → scoring → blindspot → done，每个阶段先 emit stage 事件。
 * 容错原则：任一阶段失败先 emit error(recoverable=true) 再降级，
 * 只有地理编码失败（或样例也找不到）才是 recoverable=false 并抛出。
 */
import { FACILITY_CATEGORIES } from '@/lib/categories'
import type {
  AnalyzeEvent,
  AnalyzeRequest,
  AnalyzeStage,
  CategoryScore,
  HealthReport,
  Isochrone,
  IsochroneSample,
  LngLat,
  Poi,
  WeatherInfo,
} from '@/lib/types'
import type { OverallResult, PipelineDeps } from './deps'
import { defaultSamplesDir, findNearestSample, replaySample } from './sample'
import {
  emptyStats,
  errMsg,
  estimateWalkLocal,
  haversineM,
  pointInRingLocal,
  shortId,
} from './util'

/** 设施检索半径（米）：15 分钟步行极限 ≈ 1.2m/s × 900s ≈ 1080m，取 1800 留出路网绕行余量 */
export const POI_SEARCH_RADIUS_M = 1800
/** 默认方向数 */
export const DEFAULT_BEARINGS = 16
/** 收尾时最多等天气多久（毫秒）；超时则报告不带天气，后台请求自行结束 */
export const WEATHER_WAIT_MS = 1500

type Emit = (e: AnalyzeEvent) => void

/** 一次分析的可变上下文 */
interface Ctx {
  deps: PipelineDeps
  emit: Emit
  warnings: string[]
  /** 是否有任何降级发生 */
  degraded: boolean
  /** 算路是否整体失败（用于判断 API 完全不可用） */
  routingFailed: boolean
  poiFailed: boolean
}

function stage(ctx: Ctx, s: AnalyzeStage, message: string, progress: number) {
  ctx.emit({ type: 'stage', stage: s, message, progress })
}

/** 发一条可恢复错误并记录 warning */
function degrade(ctx: Ctx, message: string) {
  ctx.degraded = true
  ctx.warnings.push(message)
  ctx.emit({ type: 'error', message, recoverable: true })
}

/** 致命错误：emit 后抛出 */
function fatal(ctx: Ctx, message: string): never {
  ctx.emit({ type: 'error', message, recoverable: false })
  throw new Error(message)
}

function estimate(ctx: Ctx, straightM: number) {
  return ctx.deps.estimateWalk ? ctx.deps.estimateWalk(straightM) : estimateWalkLocal(straightM)
}

/** 判断是否应回退样例：无 AK，或允许回退且 API 不可用 */
function shouldFallback(ctx: Ctx, apiDown: boolean): boolean {
  return !ctx.deps.hasAk || (ctx.deps.allowSampleFallback && apiDown)
}

/** 尝试样例回放；找不到合适样例时返回 null */
function tryReplay(ctx: Ctx, center: LngLat, reason: string): HealthReport | null {
  const found = findNearestSample(center, ctx.deps.samplesDir ?? defaultSamplesDir())
  if (!found) return null
  return replaySample(found, ctx.emit, reason)
}

/* ------------------------------------------------------------------ 阶段实现 */

/** 阶段 1：地理编码 + 逆地理编码 */
async function stageGeocode(
  ctx: Ctx,
  req: AnalyzeRequest
): Promise<{ center: LngLat; address: HealthReport['address']; apiDown: boolean }> {
  let center = req.center
  stage(ctx, 'geocode', req.address ? `正在定位「${req.address}」` : '正在识别中心点位置', 3)
  if (req.address?.trim()) {
    let r: { location: LngLat } | null = null
    try {
      r = await ctx.deps.geocode(req.address.trim())
    } catch (e) {
      // 网络 / AK 异常：视作 API 不可用
      if (shouldFallback(ctx, true)) return { center, address: { formatted: '' }, apiDown: true }
      fatal(ctx, `地理编码失败：${errMsg(e)}`)
    }
    if (!r) fatal(ctx, `无法识别地址「${req.address}」，请换个更具体的写法或直接在地图上点选`)
    center = r.location
  }
  let address: HealthReport['address'] = { formatted: '' }
  let apiDown = false
  try {
    address = await ctx.deps.reverseGeocode(center)
  } catch (e) {
    apiDown = true
    if (!shouldFallback(ctx, true)) degrade(ctx, `逆地理编码失败，行政区信息缺省：${errMsg(e)}`)
  }
  stage(ctx, 'geocode', address.formatted ? `已定位：${address.formatted}` : '已定位中心点', 10)
  return { center, address, apiDown }
}

/** 阶段 2+3：采样 + 算路 */
async function stageSamplesAndRouting(
  ctx: Ctx,
  center: LngLat,
  bearings: number
): Promise<IsochroneSample[]> {
  stage(ctx, 'sampling', `按 ${bearings} 个方向布设等时圈采样点`, 15)
  const samples = ctx.deps.buildSamples(center, { bearings })
  stage(ctx, 'routing', `正在对 ${samples.length} 个采样点做步行算路`, 20)
  try {
    const times = await ctx.deps.attachWalkTimes(
      center,
      samples.map((s) => s.point)
    )
    if (times.length !== samples.length)
      throw new Error(`算路返回 ${times.length} 条，期望 ${samples.length} 条`)
    let est = 0
    samples.forEach((s, i) => {
      s.walkSec = times[i].walkSec
      s.source = times[i].source
      if (s.source === 'estimate') est++
    })
    if (est > 0 && est === samples.length) {
      // 真实层 attachWalkTimes 永不抛错，全部估算即等价于算路整体失败
      ctx.routingFailed = true
      degrade(ctx, '批量步行算路全部失败（限流或服务异常），等时圈改用直线距离估算')
    } else if (est > 0) {
      ctx.degraded = true
      ctx.warnings.push(
        `${est}/${samples.length} 个采样点的步行时间为估算值（批量算路部分失败或限流）`
      )
    }
  } catch (e) {
    ctx.routingFailed = true
    degrade(ctx, `批量步行算路失败，等时圈改用直线距离估算：${errMsg(e)}`)
    for (const s of samples) {
      s.walkSec = estimate(ctx, s.radiusM).walkSec
      s.source = 'estimate'
    }
  }
  stage(ctx, 'routing', '采样点步行时间已获取', 35)
  return samples
}

/** 阶段 4：构建等时圈 */
function stageIsochrone(ctx: Ctx, center: LngLat, samples: IsochroneSample[]): Isochrone {
  stage(ctx, 'isochrone', '正在生成 5/10/15 分钟等时圈', 38)
  let iso: Isochrone
  try {
    iso = ctx.deps.buildIsochrone(center, samples)
  } catch (e) {
    degrade(ctx, `等时圈构建失败，改用等效圆：${errMsg(e)}`)
    iso = fallbackIsochrone(center, samples)
  }
  ctx.emit({ type: 'partial', key: 'isochrone', data: iso })
  stage(
    ctx,
    'isochrone',
    `等时圈已生成，15 分钟可达面积约 ${ring15(iso)?.areaKm2.toFixed(2) ?? '?'} km²`,
    42
  )
  return iso
}

/** 阶段 5：设施检索（逐类降级） */
async function stagePoiSearch(ctx: Ctx, center: LngLat): Promise<Poi[]> {
  stage(ctx, 'poi_search', `正在检索周边 ${POI_SEARCH_RADIUS_M} 米内的民生设施`, 45)
  let pois: Poi[] = []
  if (ctx.deps.searchCategory) {
    const per = ctx.deps.searchCategory
    const results = await Promise.all(
      FACILITY_CATEGORIES.map(async (c) => {
        try {
          return await per(center, POI_SEARCH_RADIUS_M, c.key)
        } catch (e) {
          degrade(ctx, `「${c.label}」检索失败，该类别按无设施处理：${errMsg(e)}`)
          return [] as Poi[]
        }
      })
    )
    pois = results.flat()
    if (results.every((r) => r.length === 0) && ctx.warnings.some((w) => w.includes('检索失败')))
      ctx.poiFailed = true
  } else {
    try {
      pois = await ctx.deps.searchFacilities(center, POI_SEARCH_RADIUS_M)
    } catch (e) {
      ctx.poiFailed = true
      degrade(ctx, `设施检索失败，全部类别按无设施处理：${errMsg(e)}`)
    }
    // 真实层逐类吞错：一个设施都没有时视作检索失败（是否真失败由"算路也全失败"共同判定）
    if (pois.length === 0 && !ctx.poiFailed) {
      ctx.poiFailed = true
      degrade(
        ctx,
        `周边 ${POI_SEARCH_RADIUS_M} 米内未检索到任何设施（可能是检索接口异常或该区域确实空白）`
      )
    }
  }
  // 补齐直线距离（真实层一般已填，防御一下）
  for (const p of pois)
    if (!(p.straightM > 0)) p.straightM = Math.round(haversineM(center, p.location))
  stage(ctx, 'poi_search', `共找到 ${pois.length} 个设施`, 65)
  return pois
}

/** 阶段 6：设施算路 + 圈内判定 */
async function stagePoiRouting(
  ctx: Ctx,
  center: LngLat,
  pois: Poi[],
  iso: Isochrone
): Promise<Poi[]> {
  stage(ctx, 'poi_routing', `正在计算 ${pois.length} 个设施的步行时间`, 70)
  if (pois.length > 0) {
    try {
      const times = await ctx.deps.attachWalkTimes(
        center,
        pois.map((p) => p.location)
      )
      if (times.length !== pois.length)
        throw new Error(`算路返回 ${times.length} 条，期望 ${pois.length} 条`)
      let est = 0
      pois.forEach((p, i) => {
        const t = times[i]
        if (t.walkSec == null || t.walkM == null) {
          const ev = estimate(ctx, p.straightM)
          p.walkM = ev.walkM
          p.walkSec = ev.walkSec
          p.walkSource = 'estimate'
          est++
        } else {
          p.walkM = t.walkM
          p.walkSec = t.walkSec
          p.walkSource = t.source
          if (t.source === 'estimate') est++
        }
      })
      if (est > 0) {
        ctx.degraded = true
        ctx.warnings.push(`${est}/${pois.length} 个设施的步行时间为估算值`)
      }
    } catch (e) {
      degrade(ctx, `设施步行算路失败，改用直线距离估算：${errMsg(e)}`)
      for (const p of pois) {
        const ev = estimate(ctx, p.straightM)
        p.walkM = ev.walkM
        p.walkSec = ev.walkSec
        p.walkSource = 'estimate'
      }
    }
  }
  const ring = ring15(iso)?.polygon.coordinates[0]
  for (const p of pois)
    p.inIsochrone = ring ? inRing(ctx, p.location, ring) : (p.walkSec ?? Infinity) <= 900
  pois.sort((a, b) => (a.walkSec ?? Infinity) - (b.walkSec ?? Infinity))
  ctx.emit({ type: 'partial', key: 'pois', data: pois })
  stage(
    ctx,
    'poi_routing',
    `${pois.filter((p) => p.inIsochrone).length} 个设施位于 15 分钟圈内`,
    80
  )
  return pois
}

/** 阶段 7+8：评分 + 盲区 + 综合 */
function stageScoring(ctx: Ctx, center: LngLat, pois: Poi[], iso: Isochrone) {
  stage(ctx, 'scoring', '正在按类别评分', 85)
  let categories: CategoryScore[] = []
  try {
    categories = ctx.deps.scoreCategories(pois, iso)
  } catch (e) {
    degrade(ctx, `类别评分失败：${errMsg(e)}`)
  }
  stage(ctx, 'blindspot', '正在扫描硬指标盲区', 90)
  let blindSpots: HealthReport['blindSpots'] = []
  let summary: unknown = null
  try {
    blindSpots = ctx.deps.detectBlindSpots(center, pois, iso)
    summary = ctx.deps.summarizeBlindSpots(blindSpots)
  } catch (e) {
    degrade(ctx, `盲区扫描失败：${errMsg(e)}`)
  }
  let overall: OverallResult
  try {
    overall = ctx.deps.buildOverall(categories, summary, iso)
  } catch (e) {
    degrade(ctx, `综合评分失败：${errMsg(e)}`)
    overall = { overallScore: 0, overallGrade: 'D', headline: ['综合评分不可用'], suggestions: [] }
  }
  stage(ctx, 'blindspot', `发现 ${blindSpots.length} 个盲区网格`, 95)
  return { categories, blindSpots, overall }
}

/**
 * 天气（旁路）：定位后立即发起，与采样/算路/检索并行；失败静默——
 * 不发 error 事件、不进 warnings、不计入 apiStats。返回的 Promise 永不 reject。
 */
function startWeather(ctx: Ctx, center: LngLat): Promise<WeatherInfo | undefined> {
  const fn = ctx.deps.weather
  if (!fn) return Promise.resolve(undefined)
  try {
    return fn(center).then(
      (w) => w ?? undefined,
      () => undefined
    )
  } catch {
    return Promise.resolve(undefined)
  }
}

/** 最多等 ms 毫秒取天气结果，超时返回 undefined（不阻塞 done） */
function awaitWeather(p: Promise<WeatherInfo | undefined>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/* ------------------------------------------------------------------ 主入口 */

/**
 * 运行完整分析流水线。
 * @param req 请求（center 必填，address 可选，bearings 默认 16）
 * @param emit SSE 事件回调
 * @param deps 依赖注入；缺省时动态绑定真实实现
 * @returns 体检报告（同时也通过 done 事件发出）
 * @throws 地理编码失败或样例不可用等致命错误（已先 emit error recoverable=false）
 */
export async function runAnalysis(
  req: AnalyzeRequest,
  emit: (e: AnalyzeEvent) => void,
  deps?: PipelineDeps
): Promise<HealthReport> {
  const d = deps ?? (await (await import('./deps')).defaultDeps({ noCache: req.noCache }))
  const ctx: Ctx = {
    deps: d,
    emit,
    warnings: [],
    degraded: false,
    routingFailed: false,
    poiFailed: false,
  }
  const t0 = Date.now()
  d.resetStats()

  // 无 AK：直接回放样例
  if (!d.hasAk) {
    const r = tryReplay(ctx, req.center, '未配置百度服务端 AK')
    if (r) return r
    fatal(ctx, '未配置百度服务端 AK，且附近 3 公里内没有内置样例，无法分析')
  }

  const geo = await stageGeocode(ctx, req)
  if (geo.apiDown && shouldFallback(ctx, true)) {
    const r = tryReplay(ctx, geo.center, '百度地图 API 暂不可用')
    if (r) return r
    fatal(ctx, `百度地图 API 暂不可用，且附近 3 公里内没有内置样例，无法分析`)
  }
  const { center, address } = geo
  const weatherP = startWeather(ctx, center)
  const bearings = req.bearings && req.bearings >= 4 ? Math.min(req.bearings, 72) : DEFAULT_BEARINGS

  const samples = await stageSamplesAndRouting(ctx, center, bearings)
  const iso = stageIsochrone(ctx, center, samples)
  let pois = await stagePoiSearch(ctx, center)

  // 算路与检索全部失败 → API 整体不可用，允许时改用样例
  if (ctx.routingFailed && ctx.poiFailed && shouldFallback(ctx, true)) {
    const r = tryReplay(ctx, center, '百度地图 API 调用全部失败')
    if (r) return r
  }

  pois = await stagePoiRouting(ctx, center, pois, iso)
  const { categories, blindSpots, overall } = stageScoring(ctx, center, pois, iso)
  const weather = await awaitWeather(weatherP, WEATHER_WAIT_MS)

  const stats = safeStats(d)
  const report: HealthReport = {
    id: shortId(),
    generatedAt: new Date().toISOString(),
    center,
    address,
    isochrone: iso,
    pois,
    categories,
    blindSpots,
    ...overall,
    apiStats: { ...stats, elapsedMs: Date.now() - t0 },
    dataSource: ctx.degraded || stats.degraded > 0 ? 'mixed' : 'live',
    warnings: ctx.warnings,
    ...(weather ? { weather } : {}),
  }
  stage(ctx, 'done', `体检完成：综合 ${report.overallScore} 分（${report.overallGrade} 级）`, 100)
  emit({ type: 'done', report })
  return report
}

/* ------------------------------------------------------------------ 辅助 */

function ring15(iso: Isochrone) {
  return iso.rings.find((r) => r.minutes === 15) ?? iso.rings[iso.rings.length - 1]
}

function inRing(ctx: Ctx, p: LngLat, ring: [number, number][]): boolean {
  try {
    return ctx.deps.pointInPolygon(p, ring)
  } catch {
    return pointInRingLocal(p, ring)
  }
}

function safeStats(d: PipelineDeps) {
  try {
    return { ...emptyStats(), ...d.getStats() }
  } catch {
    return emptyStats()
  }
}

/** buildIsochrone 失败时的兜底：按采样点 15 分钟可达半径画多边形 */
function fallbackIsochrone(center: LngLat, samples: IsochroneSample[]): Isochrone {
  const mkRing = (minutes: 5 | 10 | 15) => {
    const limit = minutes * 60
    const pts: [number, number][] = samples.map((s) => {
      const sec = s.walkSec ?? estimateWalkLocal(s.radiusM).walkSec
      const r = Math.max(50, Math.min(s.radiusM, (s.radiusM * limit) / Math.max(sec, 1)))
      return project(center, s.bearingDeg, r)
    })
    if (pts.length) pts.push(pts[0])
    const areaKm2 = shoelaceKm2(pts)
    return { minutes, polygon: { type: 'Polygon' as const, coordinates: [pts] }, areaKm2 }
  }
  const rings = [mkRing(5), mkRing(10), mkRing(15)]
  const area = rings[2].areaKm2
  const eq = Math.sqrt((area * 1e6) / Math.PI)
  return {
    center,
    rings,
    samples,
    reachRadiusByBearing: samples.map((s) => ({
      bearingDeg: s.bearingDeg,
      radiusM: Math.min(s.radiusM, (s.radiusM * 900) / Math.max(s.walkSec ?? 1, 1)),
    })),
    equivalentRadiusM: Math.round(eq),
    circularity: 1,
  }
}

function project(c: LngLat, bearingDeg: number, distM: number): [number, number] {
  const b = (bearingDeg * Math.PI) / 180
  const dLat = (distM * Math.cos(b)) / 111320
  const dLng = (distM * Math.sin(b)) / (111320 * Math.cos((c.lat * Math.PI) / 180))
  return [c.lng + dLng, c.lat + dLat]
}

function shoelaceKm2(pts: [number, number][]): number {
  if (pts.length < 4) return 0
  const lat0 = (pts[0][1] * Math.PI) / 180
  let s = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[i + 1]
    s += x1 * y2 - x2 * y1
  }
  const deg2 = Math.abs(s) / 2
  return (deg2 * 111.32 * 111.32 * Math.cos(lat0)) as number
}
