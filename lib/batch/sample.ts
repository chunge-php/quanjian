/**
 * 街道级批量体检的内置样例：无 AK / API 不可用时，从 data/samples/batch-*.json 找离区域中心
 * 最近的样例回放。
 *
 * 文件里事件流放在 `batchEvents`（不含 done），完整报告放在 `report`——刻意不用 `events` 这个键，
 * 否则 lib/pipeline/sample.ts 的 loadSamples（要求 center + events）会把它误当成单点样例。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BatchArea, BatchEvent, BatchReport, LngLat } from '@/lib/types'
import { haversineM, shortId } from '@/lib/pipeline/util'
import { defaultSamplesDir, SAMPLE_MAX_DISTANCE_M } from '@/lib/pipeline/sample'

/** 批量样例文件结构（scripts/build-batch-sample.ts 生成） */
export interface BatchSampleFile {
  slug: string
  name: string
  description: string
  /** 区域中心（用于就近匹配） */
  center: LngLat
  area: BatchArea
  createdAt: string
  /** 录制的事件流（不含 done；done 由 report 重建） */
  batchEvents: BatchEvent[]
  report: BatchReport
  /** 为瘦身而清空了各报告的 isochrone.samples 时为 true */
  samplesStripped?: boolean
}

/** 批量样例文件名前缀 */
export const BATCH_SAMPLE_PREFIX = 'batch-'

/** 读取目录下全部批量样例（坏文件跳过） */
export function loadBatchSamples(dir = defaultSamplesDir()): BatchSampleFile[] {
  if (!fs.existsSync(dir)) return []
  const out: BatchSampleFile[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(BATCH_SAMPLE_PREFIX) || !f.endsWith('.json')) continue
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Partial<BatchSampleFile>
      if (!raw.center || !raw.report || !Array.isArray(raw.batchEvents)) continue
      out.push({
        slug: raw.slug ?? f.replace(/\.json$/, ''),
        name: raw.name ?? f,
        description: raw.description ?? '',
        center: raw.center,
        area: raw.area ?? raw.report.area,
        createdAt: raw.createdAt ?? '',
        batchEvents: raw.batchEvents,
        report: raw.report,
        samplesStripped: raw.samplesStripped,
      })
    } catch {
      /* 坏文件忽略 */
    }
  }
  return out
}

/** 找离 center 最近的批量样例；超过 maxM（默认 3 km）返回 null */
export function findNearestBatchSample(
  center: LngLat,
  dir = defaultSamplesDir(),
  maxM = SAMPLE_MAX_DISTANCE_M
): { sample: BatchSampleFile; distanceM: number } | null {
  let best: { sample: BatchSampleFile; distanceM: number } | null = null
  for (const sample of loadBatchSamples(dir)) {
    const distanceM = haversineM(center, sample.center)
    if (!best || distanceM < best.distanceM) best = { sample, distanceM }
  }
  return best && best.distanceM <= maxM ? best : null
}

/**
 * 回放批量样例：逐条 emit 录制事件（跳过 error），最后用 report 发 done，
 * 报告标为 sample 来源并在 warnings 头部追加说明。
 */
export function replayBatchSample(
  found: { sample: BatchSampleFile; distanceM: number },
  emit: (e: BatchEvent) => void,
  reason: string
): BatchReport {
  const { sample, distanceM } = found
  const note = `${reason}，当前展示内置批量样例「${sample.name}」（录制于 ${sample.createdAt.slice(0, 10) || '未知日期'}，距离请求区域中心约 ${Math.round(distanceM)} 米），非实时数据`
  for (const e of sample.batchEvents) {
    if (e.type === 'error' || e.type === 'done') continue
    emit(e)
  }
  const report: BatchReport = {
    ...sample.report,
    id: shortId(),
    generatedAt: new Date().toISOString(),
    reports: sample.report.reports.map((r) => ({ ...r, dataSource: 'sample' as const })),
    dataSource: 'sample',
    warnings: [note, ...sample.report.warnings],
  }
  emit({ type: 'done', report })
  return report
}
