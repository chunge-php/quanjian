/**
 * 流水线依赖注入接口。
 *
 * runAnalysis 只依赖这里声明的函数签名，不直接 import lib/baidu / lib/isochrone / lib/report，
 * 这样测试可以用 stub 注入，另两层未落地时也能独立编译与测试。
 * `defaultDeps()` 通过动态 import 绑定真实实现。
 */
import type {
  ApiStats,
  BlindSpotCell,
  CategoryScore,
  FacilityCategory,
  HealthReport,
  Isochrone,
  IsochroneSample,
  LngLat,
  Poi,
} from '@/lib/types'
import { estimateWalkLocal } from './util'

/** 单点步行耗时结果（attachWalkTimes 的输出单元） */
export interface WalkTime {
  walkM: number | null
  walkSec: number | null
  source: 'api' | 'estimate'
}

/** 综合评分结果（buildOverall 的输出） */
export type OverallResult = Pick<
  HealthReport,
  'overallScore' | 'overallGrade' | 'headline' | 'suggestions'
>

/** 流水线全部外部依赖 */
/** 联想候选（与 lib/baidu SuggestionItem 字段一致，这里独立声明避免层间强耦合） */
export interface SuggestItem {
  uid: string
  name: string
  address: string
  location: LngLat
  province?: string
  city?: string
  district?: string
  town?: string
  tag?: string
}

export interface PipelineDeps {
  /** 是否配置了服务端 AK；false 时直接走样例回放 */
  hasAk: boolean
  /** API 不可用时是否允许回退内置样例（对应 ALLOW_SAMPLE_FALLBACK） */
  allowSampleFallback: boolean
  /** 样例目录（默认 data/samples），测试可指向临时目录 */
  samplesDir?: string

  /** 地址 → 坐标；找不到返回 null，网络/AK 错误抛异常 */
  geocode(address: string): Promise<{ location: LngLat } | null>
  /** 地点联想（可选）：关键词 → 候选列表 */
  suggest?(query: string, region?: string): Promise<SuggestItem[]>
  /** 坐标 → 行政区地址 */
  reverseGeocode(p: LngLat): Promise<HealthReport['address']>
  /** 生成等时圈采样点 */
  buildSamples(center: LngLat, opts: { bearings: number }): IsochroneSample[]
  /** 批量步行算路（origin → points），与 points 等长；失败抛异常 */
  attachWalkTimes(origin: LngLat, points: LngLat[]): Promise<WalkTime[]>
  /** 直线距离 → 估算步行距离/时长（可选，缺省用本地估算） */
  estimateWalk?(straightM: number): { walkM: number; walkSec: number }
  /** 采样点 → 等时圈（多环） */
  buildIsochrone(center: LngLat, samples: IsochroneSample[]): Isochrone
  /** 点是否在环内 */
  pointInPolygon(p: LngLat, ring: [number, number][]): boolean
  /** 检索全部类别设施（半径米）；整体失败抛异常 */
  searchFacilities(center: LngLat, radiusM: number): Promise<Poi[]>
  /** 可选：按单类别检索，便于逐类降级；不提供时用 searchFacilities 整体检索 */
  searchCategory?(center: LngLat, radiusM: number, category: FacilityCategory): Promise<Poi[]>
  /** 盲区网格 */
  detectBlindSpots(center: LngLat, pois: Poi[], isochrone: Isochrone): BlindSpotCell[]
  /** 盲区汇总（透传给 buildOverall） */
  summarizeBlindSpots(cells: BlindSpotCell[]): unknown
  /** 各类别评分 */
  scoreCategories(pois: Poi[], isochrone: Isochrone): CategoryScore[]
  /** 综合评分与建议 */
  buildOverall(
    categories: CategoryScore[],
    blindSummary: unknown,
    isochrone: Isochrone
  ): OverallResult
  /** 读取当前 API 调用统计（不含 elapsedMs） */
  getStats(): ApiStats
  /** 清零统计（每次分析前调用） */
  resetStats(): void
}

/** 读取环境变量布尔值 */
function envBool(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? '').trim())
}

/** 是否配置了服务端 AK（不泄露值） */
export function hasServerAk(): boolean {
  return Boolean(process.env.BAIDU_SERVER_AK?.trim())
}

/**
 * 绑定真实实现（lib/baidu + lib/isochrone + lib/report）。
 * 用动态 import，避免在测试环境或另两层未落地时模块加载即失败。
 */
export async function defaultDeps(opts: { noCache?: boolean } = {}): Promise<PipelineDeps> {
  const [baidu, iso, report] = await Promise.all([
    import('@/lib/baidu'),
    import('@/lib/isochrone'),
    import('@/lib/report'),
  ])
  const client = baidu.createBaiduClient({ noCache: opts.noCache })
  return {
    hasAk: hasServerAk(),
    allowSampleFallback: envBool(process.env.ALLOW_SAMPLE_FALLBACK),
    geocode: (address) => client.geocode(address),
    suggest: (q, region) => client.placeSuggestion(q, region),
    reverseGeocode: (p) => client.reverseGeocode(p),
    buildSamples: (center, o) => iso.buildSamples(center, o),
    attachWalkTimes: (origin, points) => baidu.attachWalkTimes(client, origin, points),
    estimateWalk: (m) => {
      const w = baidu.estimateWalk(m)
      const local = estimateWalkLocal(m)
      return { walkM: w.walkM ?? local.walkM, walkSec: w.walkSec ?? local.walkSec }
    },
    buildIsochrone: (center, samples) => iso.buildIsochrone(center, samples),
    pointInPolygon: (p, ring) => iso.pointInPolygon(p, ring),
    searchFacilities: (center, radiusM) => baidu.searchFacilities(client, center, radiusM),
    detectBlindSpots: (center, pois, isochrone) => report.detectBlindSpots(center, pois, isochrone),
    summarizeBlindSpots: (cells) => report.summarizeBlindSpots(cells),
    scoreCategories: (pois, isochrone) => report.scoreCategories(pois, isochrone),
    buildOverall: (categories, summary, isochrone) =>
      report.buildOverall(
        categories,
        summary as ReturnType<typeof report.summarizeBlindSpots>,
        isochrone
      ),
    getStats: () => ({ ...client.stats }),
    resetStats: () => client.resetStats(),
  }
}
