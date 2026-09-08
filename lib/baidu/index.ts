/**
 * lib/baidu —— 百度地图 Web 服务 API 客户端层统一出口
 */
export {
  createBaiduClient,
  emptyStats,
  BAIDU_API_BASE,
  ROUTE_MATRIX_MAX_PAIRS,
  PLACE_PAGE_SIZE_MAX,
  DEFAULT_QPS,
  DEFAULT_CONCURRENCY,
  stripSecrets,
} from './client'
export type {
  BaiduClient,
  BaiduClientOptions,
  BaiduPlaceResult,
  GeocodeResult,
  PlaceSearchNearbyParams,
  RouteMatrixCell,
  SuggestionItem,
  WeatherParams,
} from './client'
export {
  parseWeather,
  walkComment,
  weatherSummary,
  normalizeWindClass,
  formatUptime,
  FORECAST_DAYS,
} from './weather'
export { BaiduApiError, BaiduConfigError, BaiduNetworkError, isRetryableError } from './errors'
export { createLimiter, withRetry } from './limiter'
export type { Limiter, LimiterOptions, RetryOptions } from './limiter'
export { createCache, cacheKey } from './cache'
export type { ResponseCache, CacheOptions } from './cache'
export { haversineM, toLatLngParam, joinLatLng, fromBaiduLocation } from './geo'
export { searchFacilities, matchesCategory, categoryScore, poiTag, CLEAN_RULES } from './pois'
export { attachWalkTimes, estimateWalk, WALK_DETOUR_FACTOR, WALK_SPEED_MPS } from './walk'
export type { WalkTime } from './walk'
