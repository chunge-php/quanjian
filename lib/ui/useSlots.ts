'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { HealthReport, Isochrone, LngLat, Poi } from '@/lib/types'
import { useAnalyze, type AnalyzeState } from '@/lib/ui/useAnalyze'
import type { Slot } from '@/lib/ui/compare'

export interface SlotData {
  center: LngLat | null
  /** 搜索框 / 联想给的地名（无则用报告地址） */
  label: string | null
  report: HealthReport | null
  isochrone: Isochrone | null
  pois: Poi[] | null
}

export interface SlotView extends SlotData {
  running: boolean
  error: string | null
}

const EMPTY: SlotData = { center: null, label: null, report: null, isochrone: null, pois: null }

interface RunOpts {
  mock: boolean
  onRecoverableError: (msg: string) => void
}

/**
 * A / B 两个槽位共用一条分析流（useAnalyze 单实例 → 天然串行，不会并发两条 SSE）。
 * 运行中的槽位实时取流里的中间结果；完成后固化进槽位，再跑另一槽位时不丢。
 */
export function useSlots() {
  const { state, run, cancel, reset } = useAnalyze()
  const [slots, setSlots] = useState<Record<Slot, SlotData>>({ A: EMPTY, B: EMPTY })
  const [runningSlot, setRunningSlot] = useState<Slot>('A')

  // 完成 → 固化到槽位
  useEffect(() => {
    if (state.status !== 'done' || !state.report) return
    const r = state.report
    setSlots((s) => ({
      ...s,
      [runningSlot]: { ...s[runningSlot], report: r, isochrone: r.isochrone, pois: r.pois },
    }))
  }, [state.status, state.report, runningSlot])

  const view = useCallback(
    (slot: Slot): SlotView => {
      const base = slots[slot]
      if (slot !== runningSlot) return { ...base, running: false, error: null }
      return viewOf(base, state)
    },
    [slots, runningSlot, state]
  )

  const A = useMemo(() => view('A'), [view])
  const B = useMemo(() => view('B'), [view])

  const analyze = useCallback(
    (slot: Slot, center: LngLat, label: string | undefined, opts: RunOpts) => {
      setSlots((s) => ({
        ...s,
        [slot]: { center, label: label ?? null, report: null, isochrone: null, pois: null },
      }))
      setRunningSlot(slot)
      void run(
        { center, address: label },
        { mock: opts.mock, onRecoverableError: opts.onRecoverableError }
      )
    },
    [run]
  )

  const swap = useCallback(() => {
    setSlots((s) => ({ A: s.B, B: s.A }))
    setRunningSlot((r) => (r === 'A' ? 'B' : 'A'))
  }, [])

  /** 移除 B：若正跑的是 B 则先取消 */
  const removeB = useCallback(() => {
    if (runningSlot === 'B') reset()
    setSlots((s) => ({ ...s, B: EMPTY }))
    setRunningSlot('A')
  }, [runningSlot, reset])

  const clearAll = useCallback(() => {
    reset()
    setSlots({ A: EMPTY, B: EMPTY })
    setRunningSlot('A')
  }, [reset])

  return { A, B, state, runningSlot, analyze, cancel, swap, removeB, clearAll }
}

function viewOf(base: SlotData, state: AnalyzeState): SlotView {
  if (state.status === 'running')
    return {
      ...base,
      report: null,
      isochrone: state.isochrone,
      pois: state.pois,
      running: true,
      error: null,
    }
  if (state.status === 'done' && state.report)
    return {
      ...base,
      report: state.report,
      isochrone: state.report.isochrone,
      pois: state.report.pois,
      running: false,
      error: null,
    }
  if (state.status === 'error')
    return {
      ...base,
      isochrone: base.isochrone ?? state.isochrone,
      pois: base.pois ?? state.pois,
      running: false,
      error: state.error,
    }
  return { ...base, running: false, error: null }
}
