/**
 * 圈见 · 全局共享类型契约（所有模块以此为准，改动需同步各调用方）
 *
 * 坐标系说明：全项目内部统一使用百度 BD-09 坐标（lng, lat），
 * 与百度 Web 服务 API / JSAPI GL 一致，不做转换。
 */

/** 经纬度点，BD-09 */
export interface LngLat {
  lng: number
  lat: number
}

/** 民生设施类别（赛题硬指标：菜市场 / 药店 / 小学 必须有；其余为体检加分项） */
export type FacilityCategory =
  | 'market' // 菜市场 / 生鲜超市
  | 'pharmacy' // 药店
  | 'primary_school' // 小学
  | 'kindergarten' // 幼儿园
  | 'clinic' // 社区医院 / 诊所
  | 'elderly' // 养老服务 / 社区养老
  | 'supermarket' // 超市 / 便利店
  | 'park' // 公园 / 绿地
  | 'bus_stop' // 公交站 / 地铁站
  | 'bank' // 银行 / ATM

export interface FacilityCategoryMeta {
  key: FacilityCategory
  label: string // 中文名，用于 UI
  /** 百度地点检索 query 词，多个用 | 分隔（在 place/v2/search 里用 query 参数，多词用 $ 拼接） */
  queries: string[]
  /** 百度 POI tag 过滤词（可选，用于清洗误检） */
  tags?: string[]
  /** 是否为赛题硬指标（缺失即判定盲区） */
  essential: boolean
  /** 15 分钟生活圈国家标准建议服务半径（米），用于覆盖率评分 */
  standardRadiusM: number
}

/** 单个 POI（清洗后） */
export interface Poi {
  uid: string
  name: string
  category: FacilityCategory
  location: LngLat
  address?: string
  /** 直线距离（米） */
  straightM: number
  /** 步行距离（米），来自批量算路；API 失败时为 null */
  walkM: number | null
  /** 步行时长（秒），来自批量算路；API 失败时为 null */
  walkSec: number | null
  /** walkSec 的来源：api=真实算路 estimate=直线距离×折减系数估算 */
  walkSource: 'api' | 'estimate'
  /** 是否在 15 分钟等时圈内 */
  inIsochrone: boolean
}

/** 等时圈采样点 */
export interface IsochroneSample {
  bearingDeg: number // 方位角 0-360
  radiusM: number // 采样半径
  point: LngLat
  walkSec: number | null // null=算路失败（不可达 / 水域 / API 异常）
  source: 'api' | 'estimate'
}

/** GeoJSON Polygon（仅用到这个子集） */
export interface GeoJsonPolygon {
  type: 'Polygon'
  coordinates: [number, number][][] // [[lng,lat], ...] 首尾闭合
}

/** 等时圈结果（多环：5/10/15 分钟，用于热力渐变渲染） */
export interface IsochroneRing {
  minutes: 5 | 10 | 15
  polygon: GeoJsonPolygon
  areaKm2: number
}

export interface Isochrone {
  center: LngLat
  rings: IsochroneRing[]
  samples: IsochroneSample[]
  /** 各方向 15 分钟可达半径（米），长度 = 方向数 */
  reachRadiusByBearing: { bearingDeg: number; radiusM: number }[]
  /** 15 分钟圈等效半径（米） = sqrt(area/π) */
  equivalentRadiusM: number
  /** 圈形"圆度" 0-1，越低说明路网阻隔越严重 */
  circularity: number
}

/** 盲区网格单元 */
export interface BlindSpotCell {
  center: LngLat
  /** 网格边长（米） */
  sizeM: number
  /** 缺失的硬指标类别（1 公里内没有） */
  missing: FacilityCategory[]
  /** 严重度：missing.length / essential 类别数 */
  severity: number
  /** 是否位于 15 分钟等时圈内（圈内盲区优先级更高） */
  inIsochrone: boolean
}

/** 单类别覆盖评分 */
export interface CategoryScore {
  category: FacilityCategory
  label: string
  essential: boolean
  /** 15 分钟圈内数量 */
  countInIsochrone: number
  /** 1 公里直线范围内数量 */
  countWithin1km: number
  /** 最近一个的步行分钟数；无则 null */
  nearestWalkMin: number | null
  nearest?: Poi
  /** 0-100 */
  score: number
  /** 评级 */
  grade: 'A' | 'B' | 'C' | 'D'
  /** 一句话诊断（中文） */
  diagnosis: string
}

/** 体检报告 */
export interface HealthReport {
  id: string
  generatedAt: string // ISO
  center: LngLat
  /** 逆地理编码得到的地址与行政区 */
  address: {
    formatted: string
    province?: string
    city?: string
    district?: string
    street?: string
  }
  isochrone: Isochrone
  pois: Poi[]
  categories: CategoryScore[]
  blindSpots: BlindSpotCell[]
  /** 综合评分 0-100 与评级 */
  overallScore: number
  overallGrade: 'A' | 'B' | 'C' | 'D'
  /** 三条以内的核心结论（中文，给报告首屏） */
  headline: string[]
  /** 规划建议（中文，按优先级） */
  suggestions: { priority: 'high' | 'medium' | 'low'; text: string; category?: FacilityCategory }[]
  /** 本次分析的 API 调用统计（用于"API 深度调用"评分展示） */
  apiStats: ApiStats
  /** 数据来源：live=实时调用 sample=内置样例 mixed=部分降级 */
  dataSource: 'live' | 'sample' | 'mixed'
  warnings: string[]
  /** 中心点当前天气（百度国内天气查询；失败静默、不影响评分，可缺省） */
  weather?: WeatherInfo
}

/** 未来某日天气预报（只保留报告用到的字段） */
export interface WeatherForecastDay {
  /** YYYY-MM-DD */
  date: string
  /** 星期几（中文，如"星期二"） */
  week: string
  /** 最高温 °C */
  high: number
  /** 最低温 °C */
  low: number
  /** 白天天气现象（如"多云"） */
  text: string
}

/** 中心点实时天气 + 步行舒适度提示（来自百度天气查询 result.now / result.forecasts） */
export interface WeatherInfo {
  /** 天气现象（如"晴"、"多云"、"小雨"） */
  text: string
  /** 气温 °C */
  tempC: number
  /** 体感温度 °C */
  feelsLikeC?: number
  /** 相对湿度 % */
  humidity?: number
  /** 风向（如"东北风"） */
  windDir?: string
  /** 风力（已规范为"2 级" / "<3 级"） */
  windClass?: string
  /** 气象站数据更新时间（YYYY-MM-DD HH:mm） */
  uptime?: string
  /** 本次拉取时间 ISO（天气不计入 apiStats，用此字段标记时效） */
  fetchedAt: string
  /** 未来最多 3 天预报 */
  forecast?: WeatherForecastDay[]
  /** 步行舒适度一句话提示（中文，按温度 / 降水生成） */
  walkComment: string
}

export interface ApiStats {
  geocode: number
  placeSearch: number
  routeMatrix: number
  /** routeMatrix 累计计算的 O×D 对数 */
  routeMatrixPairs: number
  /** 命中缓存次数 */
  cacheHits: number
  /** 触发限流退避次数 */
  rateLimited: number
  /** 降级次数（改用估算） */
  degraded: number
  /** 总耗时（毫秒） */
  elapsedMs: number
}

/** 分析请求 */
export interface AnalyzeRequest {
  center: LngLat
  /** 可选：直接传地址，服务端先地理编码 */
  address?: string
  /** 等时圈方向数，默认 16 */
  bearings?: number
  /** 是否强制跳过缓存 */
  noCache?: boolean
}

/** SSE 进度事件（POST /api/analyze 以 text/event-stream 返回） */
export type AnalyzeEvent =
  | { type: 'stage'; stage: AnalyzeStage; message: string; progress: number }
  | { type: 'partial'; key: 'isochrone'; data: Isochrone }
  | { type: 'partial'; key: 'pois'; data: Poi[] }
  | { type: 'done'; report: HealthReport }
  | { type: 'error'; message: string; recoverable: boolean }

export type AnalyzeStage =
  | 'geocode'
  | 'sampling'
  | 'routing'
  | 'isochrone'
  | 'poi_search'
  | 'poi_routing'
  | 'scoring'
  | 'blindspot'
  | 'done'
