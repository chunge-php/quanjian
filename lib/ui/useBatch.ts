'use client'
/**
 * 街道级批量体检 · 消费 POST /api/batch 的 SSE（每行 data: <BatchEvent>）。
 * plan → 若干 progress / point → done(report)；error 带 index = 单点失败可继续。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AnalyzeStage,
  BatchEvent,
  BatchPointSummary,
  BatchReport,
  BatchRequest,
  LngLat,
} from '@/lib/types'
import { runMockBatch } from '@/lib/ui/mockBatch'

export type BatchStatus = 'idle' | 'running' | 'done' | 'error'

export interface BatchPlan {
  points: LngLat[]
  spacingM: number
  areaKm2: number
}

export interface BatchProgress {
  index: number
  total: number
  stage: AnalyzeStage | null
  message: string
}

export interface BatchState {
  status: BatchStatus
  request: BatchRequest | null
  plan: BatchPlan | null
  /** 已完成的点（按 index） */
  summaries: Record<number, BatchPointSummary>
  /** 单点失败的原因（按 index） */
  failed: Record<number, string>
  progress: BatchProgress
  report: BatchReport | null
  error: string | null
}

const INITIAL: BatchState = {
  status: 'idle',
  request: null,
  plan: null,
  summaries: {},
  failed: {},
  progress: { index: 0, total: 0, stage: null, message: '' },
  report: null,
  error: null,
}

export const BATCH_STAGE_LABEL: Record<AnalyzeStage, string> = {
  geocode: '定位',
  sampling: '采样',
  routing: '算路',
  isochrone: '等时圈',
  poi_search: '检索设施',
  poi_routing: '设施算路',
  scoring: '评分',
  blindspot: '盲区',
  done: '完成',
}

interface RunOptions {
  mock?: boolean
  onRecoverableError?: (msg: string, index?: number) => void
}

/** 解析 SSE 文本流：按空行分事件，取 data: 行（与 useAnalyze 同一写法） */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<BatchEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const chunk = buf.slice(0, idx)
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '')
      const data = chunk
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('\n')
      if (!data) continue
      try {
        yield JSON.parse(data) as BatchEvent
      } catch {
        /* 忽略心跳 / 注释行 */
      }
    }
  }
}

export function useBatch() {
  const [state, setState] = useState<BatchState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current += 1
    setState((s) =>
      s.status === 'running'
        ? {
            ...s,
            status: s.report ? 'done' : 'idle',
            progress: { ...s.progress, stage: null, message: '已中止' },
          }
        : s
    )
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const applyEvent = useCallback((ev: BatchEvent, opts: RunOptions) => {
    if (ev.type === 'error' && ev.recoverable) {
      opts.onRecoverableError?.(ev.message, ev.index)
      if (ev.index == null) return
    }
    setState((s) => {
      switch (ev.type) {
        case 'plan':
          return {
            ...s,
            plan: { points: ev.points, spacingM: ev.spacingM, areaKm2: ev.areaKm2 },
            progress: { index: 0, total: ev.points.length, stage: null, message: '已布设网格点' },
          }
        case 'progress':
          return {
            ...s,
            progress: {
              index: ev.index,
              total: ev.total,
              stage: ev.stage,
              message: ev.message,
            },
          }
        case 'point': {
          const failed = { ...s.failed }
          delete failed[ev.index]
          return {
            ...s,
            summaries: { ...s.summaries, [ev.index]: ev.summary },
            failed,
            progress: {
              index: ev.index,
              total: ev.total,
              stage: 'done',
              message: `${ev.summary.overallScore} 分 · ${ev.summary.address}`,
            },
          }
        }
        case 'done': {
          const summaries: Record<number, BatchPointSummary> = {}
          for (const p of ev.report.points) summaries[p.index] = p
          return {
            ...s,
            status: 'done',
            report: ev.report,
            summaries,
            plan: s.plan ?? {
              points: ev.report.points.map((p) => p.center),
              spacingM: ev.report.spacingM,
              areaKm2: ev.report.areaKm2,
            },
            progress: {
              ...s.progress,
              index: ev.report.points.length,
              total: Math.max(s.progress.total, ev.report.points.length),
              stage: 'done',
              message: '街道体检完成',
            },
            error: null,
          }
        }
        case 'error':
          if (ev.index != null && ev.recoverable)
            return { ...s, failed: { ...s.failed, [ev.index]: ev.message } }
          return { ...s, status: 'error', error: ev.message }
        default:
          return s
      }
    })
  }, [])

  const run = useCallback(
    async (req: BatchRequest, opts: RunOptions = {}) => {
      cancel()
      const myId = runIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      setState({
        ...INITIAL,
        status: 'running',
        request: req,
        progress: { index: 0, total: req.maxPoints ?? 16, stage: null, message: '布设网格点…' },
      })
      const guard = (ev: BatchEvent) => {
        if (runIdRef.current !== myId) return
        applyEvent(ev, opts)
      }
      try {
        if (opts.mock) {
          await runMockBatch(req, guard, controller.signal)
          return
        }
        const res = await fetch('/api/batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(req),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '')
          throw new Error(
            res.status === 404
              ? '批量体检服务（/api/batch）尚未就绪'
              : text
                ? `批量体检服务返回 ${res.status}：${text.slice(0, 120)}`
                : `批量体检服务返回 ${res.status}`
          )
        }
        let gotDone = false
        for await (const ev of readSse(res.body)) {
          if (ev.type === 'done') gotDone = true
          guard(ev)
        }
        if (!gotDone && runIdRef.current === myId)
          setState((s) =>
            s.status === 'running'
              ? { ...s, status: 'error', error: '批量体检流提前结束，请重试' }
              : s
          )
      } catch (e) {
        if (controller.signal.aborted) return
        const msg = e instanceof Error ? e.message : '网络异常'
        if (runIdRef.current === myId) setState((s) => ({ ...s, status: 'error', error: msg }))
      }
    },
    [applyEvent, cancel]
  )

  const reset = useCallback(() => {
    cancel()
    setState(INITIAL)
  }, [cancel])

  return { state, run, cancel, reset }
}
