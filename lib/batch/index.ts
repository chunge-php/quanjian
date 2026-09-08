/** 街道级批量体检层公开出口 */
export { planGrid, areaCenter, areaKm2Of, DEFAULT_SPACING_M, DEFAULT_MAX_POINTS } from './grid'
export type { GridPlan } from './grid'
export {
  summarizePoint,
  buildBatchReport,
  coverageOf,
  mergeDataSource,
  pointLabel,
  shortAddress,
} from './aggregate'
export { runBatch, FAST_BEARINGS, FAST_RADII_M } from './run'
export { batchToSse, encodeBatchEvent, parseBatchSse } from './sse'
export { batchRequestSchema, batchAreaSchema, parseBatchQuery } from './schema'
export { loadBatchSamples, findNearestBatchSample, replayBatchSample } from './sample'
export type { BatchSampleFile } from './sample'
