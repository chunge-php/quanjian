/**
 * 街道级批量体检的执行器：布点 → 串行逐点调用 runAnalysis → 汇总。
 *
 * 事件顺序：plan → (progress… → point)×N → done；单点失败发 error(recoverable=true, index) 后跳过。
 * 全部点位共用同一份 deps（同一个百度 client：缓存与限流共享，相邻点位的 POI 检索大量命中缓存）。
 * runAnalysis 每次会 resetStats，这里把内层的 resetStats 换成空操作，让 client 统计跨点累计；
 * 各点报告里的 apiStats 则改写为"本点增量"，整批的 apiStats 取 client 累计值。
 */
import type {
  AnalyzeEvent,
  ApiStats,
  BatchEvent,
  BatchReport,
  BatchRequest,
  HealthReport,
  LngLat,
} from '@/lib/types'
import { runAnalysis } from '@/lib/pipeline/analyze'
import type { PipelineDeps } from '@/lib/pipeline/deps'
import { defaultSamplesDir } from '@/lib/pipeline/sample'
import { emptyStats, errMsg } from '@/lib/pipeline/util'
import { buildBatchReport, summarizePoint } from './aggregate'
import { areaCenter, DEFAULT_MAX_POINTS, DEFAULT_SPACING_M, planGrid } from './grid'
import { findNearestBatchSample, replayBatchSample } from './sample'

/** 快速模式：8 方向 × 5 半径 = 40 个采样点（默认 16 × 7 = 112） */
export const FAST_BEARINGS = 8
export const FAST_RADII_M: readonly number[] = [300, 600, 900, 1200, 1600]

/** 判断内层致命错误是否意味着"API 整体不可用"（此时整批改用批量样例） */
const API_DOWN_RE = /API 暂不可用|API 调用全部失败|未配置百度服务端 AK/

/** 单点 apiStats 增量：now - prev（elapsedMs 保留内层自己的计时） */
function diffStats(now: ApiStats, prev: ApiStats, elapsedMs: number): ApiStats {
  return {
    geocode: now.geocode - prev.geocode,
    placeSearch: now.placeSearch - prev.placeSearch,
    routeMatrix: now.routeMatrix - prev.routeMatrix,
    routeMatrixPairs: now.routeMatrixPairs - prev.routeMatrixPairs,
    cacheHits: now.cacheHits - prev.cacheHits,
    rateLimited: now.rateLimited - prev.rateLimited,
    degraded: now.degraded - prev.degraded,
    elapsedMs,
  }
}

function safeStats(d: PipelineDeps): ApiStats {
  try {
    return { ...emptyStats(), ...d.getStats() }
  } catch {
    return emptyStats()
  }
}

/** 尝试批量样例回放；没有合适样例返回 null */
function tryReplay(
  d: PipelineDeps,
  center: LngLat,
  emit: (e: BatchEvent) => void,
  reason: string
): BatchReport | null {
  const found = findNearestBatchSample(center, d.samplesDir ?? defaultSamplesDir())
  return found ? replayBatchSample(found, emit, reason) : null
}

/** 致命：emit 后抛出 */
function fatal(emit: (e: BatchEvent) => void, message: string): never {
  emit({ type: 'error', message, recoverable: false })
  throw new Error(message)
}

/**
 * 运行街道级批量体检。
 * @param req 批量请求（area 必填；spacingM 默认 500，maxPoints 默认 16，fast 默认 true）
 * @param emit SSE 事件回调
 * @param deps 依赖注入；缺省绑定真实实现（整批共用一个 client）
 * @returns 街道级汇总报告（同时也通过 done 事件发出）
 * @throws 无 AK 且附近没有批量样例等致命错误（已先 emit error recoverable=false）
 */
export async function runBatch(
  req: BatchRequest,
  emit: (e: BatchEvent) => void,
  deps?: PipelineDeps
): Promise<BatchReport> {
  const d =
    deps ?? (await (await import('@/lib/pipeline/deps')).defaultDeps({ noCache: req.noCache }))
  const center = areaCenter(req.area)
  const t0 = Date.now()

  if (!d.hasAk) {
    const r = tryReplay(d, center, emit, '未配置百度服务端 AK')
    if (r) return r
    fatal(emit, '未配置百度服务端 AK，且区域附近 3 公里内没有内置批量样例，无法体检')
  }

  const plan = planGrid(
    req.area,
    req.spacingM ?? DEFAULT_SPACING_M,
    req.maxPoints ?? DEFAULT_MAX_POINTS
  )
  emit({ type: 'plan', points: plan.points, spacingM: plan.spacingM, areaKm2: plan.areaKm2 })

  const fast = req.fast !== false
  const total = plan.points.length
  d.resetStats()
  // 内层 runAnalysis 会 resetStats；换成空操作让统计跨点累计
  const inner: PipelineDeps = { ...d, resetStats: () => {} }
  let prev = safeStats(d)
  const reports: (HealthReport | null)[] = []

  for (let index = 0; index < total; index++) {
    const point = plan.points[index]
    const forward = (e: AnalyzeEvent) => {
      if (e.type === 'stage')
        emit({ type: 'progress', index, total, stage: e.stage, message: e.message })
    }
    let report: HealthReport | null = null
    let downReason: string | null = null
    try {
      report = await runAnalysis(
        {
          center: point,
          noCache: req.noCache,
          ...(fast ? { bearings: FAST_BEARINGS, radiiM: [...FAST_RADII_M] } : {}),
        },
        forward,
        inner
      )
      if (report.dataSource === 'sample') downReason = '百度地图 API 暂不可用'
    } catch (e) {
      const msg = errMsg(e)
      emit({
        type: 'error',
        message: `第 ${index + 1}/${total} 个点位体检失败，已跳过：${msg}`,
        recoverable: true,
        index,
      })
      if (API_DOWN_RE.test(msg)) downReason = '百度地图 API 暂不可用'
    }
    if (downReason) {
      const r = tryReplay(d, center, emit, downReason)
      if (r) return r
    }
    if (report) {
      const now = safeStats(d)
      report.apiStats = diffStats(now, prev, report.apiStats.elapsedMs)
      prev = now
      emit({ type: 'point', index, total, summary: summarizePoint(index, report) })
    }
    reports.push(report)
  }

  const batch = buildBatchReport(req.area, plan, reports, safeStats(d), Date.now() - t0)
  emit({ type: 'done', report: batch })
  return batch
}
