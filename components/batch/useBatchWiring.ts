'use client'
/**
 * 街道体检与外壳的接线：模式四态、范围草稿、开始/中止/退出、选中点与详情、热力开关、地图 props。
 * SSE 消费在 lib/ui/useBatch；这里只管"外壳怎么用它"。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BatchArea, BatchRequest, LngLat } from '@/lib/types'
import { useBatch } from '@/lib/ui/useBatch'
import { toast } from '@/lib/ui/toast'
import type { BatchDraft, BatchMapProps, BatchMode } from '@/components/batch/batchTypes'
import { RADIUS_DEFAULT_M, estimateMinutes, planGrid } from '@/components/batch/batchGeo'

const INITIAL_DRAFT: BatchDraft = {
  kind: 'circle',
  center: null,
  centerLabel: null,
  radiusM: RADIUS_DEFAULT_M,
  rect: null,
  drawing: false,
  spacingM: 500,
  maxPoints: 16,
  fast: true,
}

interface Options {
  mock: boolean
  isDesktop: boolean
  /** 进入街道体检时外壳要做的事（关模拟、退出选对比点） */
  onEnter: () => void
  setDrawerOpen: (open: boolean) => void
}

export function draftArea(d: BatchDraft): BatchArea | null {
  if (d.kind === 'circle')
    return d.center
      ? { kind: 'circle', center: d.center, radiusM: d.radiusM, name: d.centerLabel ?? undefined }
      : null
  return d.rect ? { kind: 'rect', sw: d.rect.sw, ne: d.rect.ne, name: '地图框选范围' } : null
}

export function useBatchWiring({ mock, isDesktop, onEnter, setDrawerOpen }: Options) {
  const { state, run, cancel, reset } = useBatch()
  const [mode, setMode] = useState<BatchMode>('off')
  const [draft, setDraftState] = useState<BatchDraft>(INITIAL_DRAFT)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const [heat, setHeat] = useState(false)
  const [fitKey, setFitKey] = useState(0)
  const [pan, setPan] = useState<BatchMapProps['pan']>(null)
  const mockBatch = useMemo(
    () =>
      mock ||
      (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('mockBatch') === '1'),
    [mock]
  )
  const enterRef = useRef(onEnter)
  enterRef.current = onEnter

  const setDraft = useCallback(
    (patch: Partial<BatchDraft>) => setDraftState((d) => ({ ...d, ...patch })),
    []
  )
  const area = useMemo(() => draftArea(draft), [draft])
  const estimate = useMemo(() => {
    if (!area) return null
    const n = planGrid(area, draft.spacingM, draft.maxPoints).length
    return { points: n, minutes: estimateMinutes(n) }
  }, [area, draft.spacingM, draft.maxPoints])

  // 范围草稿变化 / 服务端 plan 到达 → 适配视野
  useEffect(() => {
    if (area) setFitKey((k) => k + 1)
  }, [area])
  useEffect(() => {
    if (state.plan) setFitKey((k) => k + 1)
  }, [state.plan])

  // 状态流转
  const prevStatus = useRef(state.status)
  useEffect(() => {
    const prev = prevStatus.current
    prevStatus.current = state.status
    if (prev === state.status) return
    if (state.status === 'done') {
      setMode('done')
      const n = state.report?.points.length ?? 0
      const fails = Object.keys(state.failed).length
      toast(
        fails ? `街道体检完成：${n} 个点，${fails} 个点失败` : `街道体检完成：${n} 个点`,
        fails ? 'warn' : 'success',
        3000
      )
    } else if (state.status === 'error' && state.error) {
      setMode(state.report ? 'done' : 'setup')
      toast(state.error, 'error', 7000)
    } else if (state.status === 'idle' && prev === 'running') setMode('setup')
  }, [state.status, state.error, state.report, state.failed])

  const enter = useCallback(() => {
    enterRef.current()
    setMode('setup')
    setDetail(null)
    setDrawerOpen(true)
    toast(
      isDesktop
        ? '在搜索框输入街道 / 小区名或点地图选中心，也可以切到「框选」在地图上拖一个矩形'
        : '输入街道 / 小区名或点地图选中心，再点「开始体检」',
      'info',
      4200
    )
  }, [isDesktop, setDrawerOpen])

  const exit = useCallback(() => {
    reset()
    setMode('off')
    setSelected(null)
    setDetail(null)
    setHeat(false)
    setDraftState((d) => ({ ...d, drawing: false }))
  }, [reset])

  /** 顶栏按钮：关 → 选范围；选范围 → 退出；进行中 → 提示；已完成 → 回到选范围调整重跑 */
  const toggle = useCallback(() => {
    if (mode === 'off') enter()
    else if (mode === 'setup') exit()
    else if (mode === 'running') toast('体检进行中，可在面板里「中止」', 'info', 2600)
    else {
      setMode('setup')
      setDetail(null)
      setDrawerOpen(true)
    }
  }, [mode, enter, exit, setDrawerOpen])

  const start = useCallback(() => {
    if (!area) {
      toast(draft.kind === 'circle' ? '先选一个中心点' : '先在地图上框一个范围', 'warn')
      return
    }
    const req: BatchRequest = {
      area,
      spacingM: draft.spacingM,
      maxPoints: draft.maxPoints,
      fast: draft.fast,
    }
    setSelected(null)
    setDetail(null)
    setMode('running')
    setDraftState((d) => ({ ...d, drawing: false }))
    setDrawerOpen(true)
    void run(req, {
      mock: mockBatch,
      onRecoverableError: (m, i) => toast(i != null ? `第 ${i + 1} 点：${m}` : m, 'warn', 3600),
    })
  }, [area, draft, run, mockBatch, setDrawerOpen])

  const select = useCallback(
    (index: number | null) => {
      setSelected(index)
      const p = index != null ? state.plan?.points[index] : null
      if (p) setPan({ point: p, key: Date.now() })
    },
    [state.plan]
  )
  const openDetail = useCallback(
    (index: number) => {
      select(index)
      setDetail(index)
      setDrawerOpen(true)
    },
    [select, setDrawerOpen]
  )
  const closeDetail = useCallback(() => setDetail(null), [])

  /** 搜索框选中：选中心模式下吞掉，不跑单点体检 */
  const pickingCenter = mode === 'setup' && draft.kind === 'circle'
  const onSearchPick = useCallback(
    (c: LngLat, label?: string): boolean => {
      if (!pickingCenter) return false
      setDraft({ center: c, centerLabel: label ?? null })
      return true
    },
    [pickingCenter, setDraft]
  )

  const active = mode !== 'off'
  const areaForMap = mode === 'setup' ? area : (state.report?.area ?? state.request?.area ?? area)
  const mapProps: BatchMapProps | null = active
    ? {
        area: areaForMap,
        points: mode === 'setup' ? null : (state.plan?.points ?? null),
        summaries: state.summaries,
        failed: state.failed,
        selected,
        heat,
        fitKey,
        pickingCenter,
        drawing: mode === 'setup' && draft.kind === 'rect' && draft.drawing,
        pan,
        onMapClick: (p) => {
          if (pickingCenter) setDraft({ center: p, centerLabel: null })
        },
        onRectDrawn: (sw, ne) => setDraft({ rect: { sw, ne }, drawing: false }),
        onRectTooBig: (diag) =>
          toast(
            `框太大了：对角线 ${(diag / 1000).toFixed(1)} km，最多 6 km，请框小一点`,
            'error',
            5000
          ),
        onSelect: openDetail,
      }
    : null

  return {
    mode,
    active,
    state,
    draft,
    setDraft,
    area,
    estimate,
    selected,
    detail,
    heat,
    setHeat,
    toggle,
    enter,
    exit,
    start,
    cancel,
    select,
    openDetail,
    closeDetail,
    pickingCenter,
    onSearchPick,
    mapProps,
    mock: mockBatch,
  }
}

export type BatchWiring = ReturnType<typeof useBatchWiring>
