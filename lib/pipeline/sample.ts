/**
 * 内置样例回放：无 AK / API 不可用时，从 data/samples/*.json 找离请求中心最近的样例，
 * 把当时录制的事件流原样重放，并把 dataSource 标为 sample。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AnalyzeEvent, HealthReport, LngLat } from '@/lib/types'
import { haversineM, shortId } from './util'

/** 样例文件结构（scripts/build-sample.ts 生成） */
export interface SampleFile {
  slug: string
  name: string
  description: string
  center: LngLat
  createdAt: string
  events: AnalyzeEvent[]
}

/** 样例列表项（GET /api/samples 返回） */
export interface SampleSummary {
  slug: string
  name: string
  description: string
  center: LngLat
  createdAt: string
}

/** 样例可用的最大距离（米）：请求点离样例中心超过这个值就拒绝回放 */
export const SAMPLE_MAX_DISTANCE_M = 3000

/** 默认样例目录 */
export function defaultSamplesDir(): string {
  return path.join(process.cwd(), 'data', 'samples')
}

/** 读取目录下全部样例（坏文件跳过） */
export function loadSamples(dir = defaultSamplesDir()): SampleFile[] {
  if (!fs.existsSync(dir)) return []
  const out: SampleFile[] = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Partial<SampleFile>
      if (!raw.center || !Array.isArray(raw.events)) continue
      out.push({
        slug: raw.slug ?? f.replace(/\.json$/, ''),
        name: raw.name ?? f,
        description: raw.description ?? '',
        center: raw.center,
        createdAt: raw.createdAt ?? '',
        events: raw.events,
      })
    } catch {
      /* 坏文件忽略 */
    }
  }
  return out
}

/** 样例摘要列表（不带事件流） */
export function listSamples(dir = defaultSamplesDir()): SampleSummary[] {
  return loadSamples(dir).map(({ slug, name, description, center, createdAt }) => ({
    slug,
    name,
    description,
    center,
    createdAt,
  }))
}

/** 找离 center 最近的样例；超过 maxM 返回 null */
export function findNearestSample(
  center: LngLat,
  dir = defaultSamplesDir(),
  maxM = SAMPLE_MAX_DISTANCE_M
): { sample: SampleFile; distanceM: number } | null {
  let best: { sample: SampleFile; distanceM: number } | null = null
  for (const sample of loadSamples(dir)) {
    const distanceM = haversineM(center, sample.center)
    if (!best || distanceM < best.distanceM) best = { sample, distanceM }
  }
  return best && best.distanceM <= maxM ? best : null
}

/** 从样例中取出报告 */
export function sampleReport(sample: SampleFile): HealthReport | null {
  for (const e of sample.events) if (e.type === 'done') return e.report
  return null
}

/**
 * 回放样例：把录制的事件逐条 emit，done 事件中的报告改为 sample 来源并追加说明。
 * @param reason 触发回放的原因（写进 warnings，中文）
 */
export function replaySample(
  found: { sample: SampleFile; distanceM: number },
  emit: (e: AnalyzeEvent) => void,
  reason: string
): HealthReport {
  const { sample, distanceM } = found
  const note = `${reason}，当前展示内置样例「${sample.name}」（录制于 ${sample.createdAt.slice(0, 10) || '未知日期'}，距离请求点约 ${Math.round(distanceM)} 米），非实时数据`
  let report: HealthReport | null = null
  for (const e of sample.events) {
    if (e.type === 'error') continue // 录制时的降级提示不重复展示
    if (e.type === 'done') {
      report = {
        ...e.report,
        id: shortId(),
        generatedAt: new Date().toISOString(),
        dataSource: 'sample',
        warnings: [note, ...e.report.warnings],
      }
      emit({ type: 'done', report })
    } else {
      emit(e)
    }
  }
  if (!report) throw new Error(`样例「${sample.name}」缺少 done 事件，无法回放`)
  return report
}
