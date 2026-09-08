'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LngLat } from '@/lib/types'
import MapView from '@/components/map/MapView'
import SearchBox from '@/components/SearchBox'
import TopBar from '@/components/TopBar'
import Drawer from '@/components/Drawer'
import Toast from '@/components/Toast'
import ProgressOverlay from '@/components/ProgressOverlay'
import ReportPanel from '@/components/report/ReportPanel'
import EmptyState from '@/components/report/EmptyState'
import RunningPanel from '@/components/RunningPanel'
import { useAnalyze } from '@/lib/ui/useAnalyze'
import { toast } from '@/lib/ui/toast'
import { MOCK_CENTER } from '@/lib/ui/mockReport'

interface Health {
  ok: boolean
  hasServerAk: boolean
  sampleCount: number
}

type Snap = 'peek' | 'half' | 'full'

export default function AppShell({ forceMock }: { forceMock: boolean }) {
  const [mock, setMock] = useState(forceMock)
  const [health, setHealth] = useState<Health | null>(null)
  const [backendDown, setBackendDown] = useState(false)
  const [center, setCenter] = useState<LngLat | null>(null)
  const [showSamples, setShowSamples] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [snap, setSnap] = useState<Snap>('peek')
  const [isDesktop, setIsDesktop] = useState(true)
  const [fitKey, setFitKey] = useState(0)
  const [printing, setPrinting] = useState(false)
  const lastIsoRef = useRef<unknown>(null)
  const { state, run, cancel, reset } = useAnalyze()

  // 后端健康检查：最多重试 3 次（开发模式首个请求要等路由编译），全部失败才切本地样例。
  // 注意：React 严格模式会把首个 effect 立即清理，AbortError 不能算作后端故障。
  useEffect(() => {
    if (forceMock) return
    const ctrl = new AbortController()
    let cancelled = false
    const probe = async () => {
      const delays = [0, 1200, 2500]
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]))
        if (cancelled) return
        try {
          const r = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
          if (r.ok) {
            const h = (await r.json()) as Health
            if (!cancelled) setHealth(h)
            return
          }
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return
        }
      }
      if (!cancelled) {
        setBackendDown(true)
        setMock(true)
      }
    }
    void probe()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [forceMock])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  // 等时圈首次到达 → 适配视野
  useEffect(() => {
    if (state.isochrone && state.isochrone !== lastIsoRef.current) {
      lastIsoRef.current = state.isochrone
      setFitKey((k) => k + 1)
    }
  }, [state.isochrone])

  useEffect(() => {
    if (state.status === 'error' && state.error) toast(state.error, 'error', 6000)
    if (state.status === 'done') toast('体检完成', 'success', 2200)
  }, [state.status, state.error])

  const analyze = useCallback(
    (c: LngLat, address?: string) => {
      setCenter(c)
      setDrawerOpen(true)
      lastIsoRef.current = null
      void run({ center: c, address }, { mock, onRecoverableError: (m) => toast(m, 'warn') })
    },
    [run, mock]
  )

  const onCenterChange = useCallback((p: LngLat) => analyze(p), [analyze])
  const onMapStatus = useCallback((s: 'loading' | 'ready' | 'error', err?: string) => {
    if (s === 'error' && err) toast(err, 'error', 8000)
  }, [])

  const onPrint = () => {
    setDrawerOpen(true)
    window.setTimeout(() => window.print(), 80)
  }

  const notice = forceMock
    ? 'Mock 模式：数据为本地样例，仅用于演示与截图'
    : backendDown
      ? '连不上分析服务（/api/health 连续 3 次失败），已切换为本地样例；请确认服务已启动后刷新页面'
      : health && !health.hasServerAk
        ? '服务端未配置百度 AK，实时分析不可用，请从「样例」中选一个查看'
        : null

  const bottomInset = isDesktop
    ? 0
    : snap === 'full'
      ? 0
      : snap === 'half'
        ? Math.round(window.innerHeight * 0.5)
        : 132
  const rightInset = isDesktop && drawerOpen ? 400 : 0
  const running = state.status === 'running'

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[var(--paper)]">
      <MapView
        center={center}
        isochrone={state.isochrone}
        pois={state.pois}
        blindSpots={state.report?.blindSpots ?? null}
        showSamples={showSamples}
        rightInset={rightInset}
        bottomInset={bottomInset}
        fitKey={fitKey}
        onCenterChange={onCenterChange}
        onStatus={onMapStatus}
      />

      <SearchBox
        busy={running}
        mock={mock}
        region={state.report?.address.city || '重庆市'}
        onPick={analyze}
      />
      <TopBar
        canPrint={!!state.report}
        showSamples={showSamples}
        onToggleSamples={() => setShowSamples((v) => !v)}
        onPrint={onPrint}
        notice={notice}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        rightInset={rightInset}
      />

      {running && (
        <ProgressOverlay
          stage={state.stage}
          progress={state.progress}
          message={state.message}
          onCancel={cancel}
        />
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} onSnapChange={setSnap}>
        {state.report ? (
          <ReportPanel
            report={state.report}
            printing={printing}
            onPrint={onPrint}
            onRerun={() => center && analyze(center)}
          />
        ) : running ? (
          <RunningPanel state={state} />
        ) : (
          <EmptyState
            mock={mock}
            noServerAk={!!health && !health.hasServerAk}
            onUseSample={() => analyze(MOCK_CENTER, '重庆璧山 · 东林大道')}
          />
        )}
        {state.status === 'error' && !state.report && (
          <div className="mx-5 mb-6 border border-[var(--vermilion)] px-4 py-3 text-sm">
            <p className="font-medium text-[var(--vermilion)]">分析失败</p>
            <p className="mt-1 break-words text-[var(--ink-2)]">{state.error}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn !min-h-9 text-xs"
                onClick={() => center && analyze(center)}
              >
                重试
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={reset}>
                清除
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <Toast />
    </main>
  )
}
