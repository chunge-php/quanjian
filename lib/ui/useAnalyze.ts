'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AnalyzeEvent,
  AnalyzeRequest,
  AnalyzeStage,
  HealthReport,
  Isochrone,
  Poi,
} from '@/lib/types'
import { runMockAnalysis } from '@/lib/ui/mockReport'

export type AnalyzeStatus = 'idle' | 'running' | 'done' | 'error'

export interface AnalyzeState {
  status: AnalyzeStatus
  stage: AnalyzeStage | null
  progress: number
  message: string
  isochrone: Isochrone | null
  pois: Poi[] | null
  report: HealthReport | null
  error: string | null
}

const INITIAL: AnalyzeState = {
  status: 'idle',
  stage: null,
  progress: 0,
  message: '',
  isochrone: null,
  pois: null,
  report: null,
  error: null,
}

export const STAGE_LABEL: Record<AnalyzeStage, string> = {
  geocode: '定位中心点',
  sampling: '布设采样点',
  routing: '批量步行算路',
  isochrone: '生成等时圈',
  poi_search: '检索民生设施',
  poi_routing: '计算设施步行时间',
  scoring: '评分与诊断',
  blindspot: '扫描服务盲区',
  done: '完成',
}

interface RunOptions {
  mock?: boolean
  onRecoverableError?: (msg: string) => void
}

/** 解析 SSE 文本流：按空行分事件，取 data: 行 */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<AnalyzeEvent> {
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
        yield JSON.parse(data) as AnalyzeEvent
      } catch {
        /* 忽略无法解析的心跳/注释行 */
      }
    }
  }
}

export function useAnalyze() {
  const [state, setState] = useState<AnalyzeState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    runIdRef.current += 1
    // 取消后退出 running：有报告回 done，没有回 idle（否则进度条会一直挂着）
    setState((s) =>
      s.status === 'running'
        ? { ...s, status: s.report ? 'done' : 'idle', message: '已取消', stage: null }
        : s
    )
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const applyEvent = useCallback((ev: AnalyzeEvent, opts: RunOptions) => {
    if (ev.type === 'error' && ev.recoverable) {
      opts.onRecoverableError?.(ev.message)
      return
    }
    setState((s) => {
      switch (ev.type) {
        case 'stage':
          return {
            ...s,
            status: 'running',
            stage: ev.stage,
            progress: ev.progress,
            message: ev.message,
          }
        case 'partial':
          return ev.key === 'isochrone' ? { ...s, isochrone: ev.data } : { ...s, pois: ev.data }
        case 'done':
          return {
            ...s,
            status: 'done',
            stage: 'done',
            progress: 1,
            message: '分析完成',
            report: ev.report,
            isochrone: ev.report.isochrone,
            pois: ev.report.pois,
            error: null,
          }
        case 'error':
          return { ...s, status: 'error', error: ev.message }
        default:
          return s
      }
    })
  }, [])

  const run = useCallback(
    async (req: AnalyzeRequest, opts: RunOptions = {}) => {
      cancel()
      const myId = runIdRef.current
      const controller = new AbortController()
      abortRef.current = controller
      setState({
        ...INITIAL,
        status: 'running',
        stage: 'geocode',
        message: '准备分析…',
        progress: 0,
      })

      const guard = (ev: AnalyzeEvent) => {
        if (runIdRef.current !== myId) return
        applyEvent(ev, opts)
      }

      try {
        if (opts.mock) {
          await runMockAnalysis(req.center, guard, controller.signal)
          return
        }
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify(req),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => '')
          throw new Error(
            text
              ? `分析服务返回 ${res.status}：${text.slice(0, 120)}`
              : `分析服务返回 ${res.status}`
          )
        }
        let gotDone = false
        for await (const ev of readSse(res.body)) {
          if (ev.type === 'done') gotDone = true
          guard(ev)
        }
        if (!gotDone && runIdRef.current === myId) {
          setState((s) =>
            s.status === 'running' ? { ...s, status: 'error', error: '分析流提前结束，请重试' } : s
          )
        }
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
