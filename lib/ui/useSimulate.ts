'use client'
/**
 * 圈见 · 模拟状态 hook：管理拟建设施列表，取步行时间，本地重算对比。
 *
 * 用法（AppShell）：
 *   const sim = useSimulate(state.report)
 *   MapView 在 sim.placing 非空时把点击坐标交给 sim.addVirtual(sim.placing, p) 而不是改中心点。
 * 报告换了（重新体检）会自动清空拟建列表。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FacilityCategory, HealthReport, LngLat } from '@/lib/types'
import { haversineM } from '@/lib/isochrone/geo'
import { estimateWalk } from '@/lib/baidu/walk'
import {
  applyVirtualFacilities,
  type SimulationResult,
  type VirtualFacility,
} from '@/lib/ui/simulate'

export interface WalkResult {
  walkSec: number
  walkM: number
  source: 'api' | 'estimate'
}

/**
 * 请求 /api/walk 取一对点的步行时间；任何失败都退回直线估算，永不抛。
 * @param timeoutMs 超时毫秒，默认 8000
 */
export async function fetchWalkTime(
  from: LngLat,
  to: LngLat,
  timeoutMs = 8000,
  signal?: AbortSignal
): Promise<WalkResult> {
  const straightM = haversineM(from, to)
  const fallback = (): WalkResult => {
    const w = estimateWalk(straightM)
    return { walkSec: w.walkSec ?? 0, walkM: w.walkM ?? 0, source: 'estimate' }
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onOuterAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onOuterAbort)
  try {
    const qs = `from=${from.lng},${from.lat}&to=${to.lng},${to.lat}`
    const r = await fetch(`/api/walk?${qs}`, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) return fallback()
    const data = (await r.json()) as Partial<WalkResult> & { ok?: boolean }
    if (!data.ok || typeof data.walkSec !== 'number' || typeof data.walkM !== 'number')
      return fallback()
    return { walkSec: data.walkSec, walkM: data.walkM, source: data.source ?? 'estimate' }
  } catch {
    return fallback()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

export interface SimulateApi {
  /** 已放置的拟建设施（按放置顺序） */
  virtuals: VirtualFacility[]
  /** 当前"放置模式"选中的类别；null = 不在放置模式 */
  placing: FacilityCategory | null
  setPlacing: (c: FacilityCategory | null) => void
  /** 在 location 放一处 category；立即按估算入列，随后异步用 /api/walk 结果替换 */
  addVirtual: (category: FacilityCategory, location: LngLat) => void
  remove: (id: string) => void
  /** 撤销最近放置的一处 */
  undo: () => void
  clear: () => void
  /** 无报告或无拟建设施时为 null */
  result: SimulationResult | null
  /** 是否有拟建设施 */
  active: boolean
}

let seq = 0

export function useSimulate(report: HealthReport | null): SimulateApi {
  const [virtuals, setVirtuals] = useState<VirtualFacility[]>([])
  const [placing, setPlacing] = useState<FacilityCategory | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const reportId = report?.id ?? null
  const center = report?.center ?? null

  // 报告换了 → 清空模拟、退出放置模式、取消在途请求
  useEffect(() => {
    setVirtuals([])
    setPlacing(null)
    abortRef.current?.abort()
    abortRef.current = null
  }, [reportId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const addVirtual = useCallback(
    (category: FacilityCategory, location: LngLat) => {
      if (!center) return
      const id = `v${Date.now().toString(36)}-${++seq}`
      const est = estimateWalk(haversineM(center, location))
      setVirtuals((list) => [
        ...list,
        {
          id,
          category,
          location,
          walkSec: est.walkSec,
          walkM: est.walkM,
          source: 'estimate',
          pending: true,
        },
      ])
      if (!abortRef.current) abortRef.current = new AbortController()
      const signal = abortRef.current.signal
      void fetchWalkTime(center, location, 8000, signal).then((w) => {
        if (signal.aborted) return
        setVirtuals((list) =>
          list.map((v) =>
            v.id === id
              ? { ...v, walkSec: w.walkSec, walkM: w.walkM, source: w.source, pending: false }
              : v
          )
        )
      })
    },
    [center]
  )

  const remove = useCallback((id: string) => {
    setVirtuals((list) => list.filter((v) => v.id !== id))
  }, [])
  const undo = useCallback(() => setVirtuals((list) => list.slice(0, -1)), [])
  const clear = useCallback(() => setVirtuals([]), [])

  const result = useMemo(
    () => (report && virtuals.length > 0 ? applyVirtualFacilities(report, virtuals) : null),
    [report, virtuals]
  )

  return {
    virtuals,
    placing,
    setPlacing,
    addVirtual,
    remove,
    undo,
    clear,
    result,
    active: virtuals.length > 0,
  }
}
