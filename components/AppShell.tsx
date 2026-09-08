'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FacilityCategory, HealthReport, LngLat } from '@/lib/types'
import type { Slot } from '@/lib/ui/compare'
import { slotName } from '@/lib/ui/compare'
import MapView from '@/components/map/MapView'
import SearchBox from '@/components/SearchBox'
import TopBar, { type CompareMode } from '@/components/TopBar'
import Drawer from '@/components/Drawer'
import Toast from '@/components/Toast'
import ProgressOverlay from '@/components/ProgressOverlay'
import ReportPanel from '@/components/report/ReportPanel'
import EmptyState from '@/components/report/EmptyState'
import RunningPanel from '@/components/RunningPanel'
import ComparePanel from '@/components/compare/ComparePanel'
import SimulatePanel from '@/components/simulate/SimulatePanel'
import { useSlots } from '@/lib/ui/useSlots'
import { useSimulateWiring } from '@/lib/ui/useSimulateWiring'
import { useHealth } from '@/lib/ui/useHealth'
import { toast } from '@/lib/ui/toast'
import { MOCK_CENTER } from '@/lib/ui/mockReport'

type Snap = 'peek' | 'half' | 'full'

export default function AppShell({ forceMock }: { forceMock: boolean }) {
  const [mock, setMock] = useState(forceMock)
  const { health, backendDown } = useHealth(forceMock)
  const [showSamples, setShowSamples] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [snap, setSnap] = useState<Snap>('peek')
  const [isDesktop, setIsDesktop] = useState(true)
  const [fitKey, setFitKey] = useState(0)
  const [printing, setPrinting] = useState(false)
  /** 对比：正在选 B 地点 / 地图设施与盲区聚焦哪一边 */
  const [picking, setPicking] = useState(false)
  const [focus, setFocus] = useState<Slot>('A')
  const lastIsoRef = useRef<unknown>(null)
  const { A, B, state, runningSlot, analyze, cancel, swap, removeB } = useSlots()

  const hasB = B.center != null
  const running = state.status === 'running'
  const focused = focus === 'B' && hasB ? B : A
  /** 模拟只作用于聚焦的一侧；切聚焦 = 报告换了 → 拟建列表自动清空（hook 内提示） */
  const simw = useSimulateWiring(focused.report)
  const { sim, clearPrintReport } = simw

  useEffect(() => {
    if (backendDown) setMock(true)
  }, [backendDown])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => {
      setPrinting(false)
      clearPrintReport()
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [clearPrintReport])

  // 等时圈首次到达 → 适配视野（对比模式下同时包住两个圈）
  useEffect(() => {
    if (state.isochrone && state.isochrone !== lastIsoRef.current) {
      lastIsoRef.current = state.isochrone
      setFitKey((k) => k + 1)
    }
  }, [state.isochrone])

  useEffect(() => {
    if (state.status === 'error' && state.error) toast(state.error, 'error', 6000)
    if (state.status === 'done')
      toast(runningSlot === 'B' ? '对比地点 B 体检完成' : '体检完成', 'success', 2200)
  }, [state.status, state.error, runningSlot])

  const analyzeSlot = useCallback(
    (slot: Slot, c: LngLat, label?: string) => {
      setPicking(false)
      setFocus(slot)
      setDrawerOpen(true)
      lastIsoRef.current = null
      analyze(slot, c, label, { mock, onRecoverableError: (m) => toast(m, 'warn') })
    },
    [analyze, mock]
  )

  /** 搜索框 / 样例选中：选 B 模式落到 B，否则 A */
  const onSearchPick = useCallback(
    (c: LngLat, label?: string) => analyzeSlot(picking ? 'B' : 'A', c, label),
    [analyzeSlot, picking]
  )
  /** 地图点击 / 拖标：选 B 模式一律落到 B；否则由 MapView 按聚焦槽位决定 */
  const onCenterChange = useCallback(
    (p: LngLat, _src: 'click' | 'drag', slot: Slot) => analyzeSlot(picking ? 'B' : slot, p),
    [analyzeSlot, picking]
  )
  const onMapStatus = useCallback((s: 'loading' | 'ready' | 'error', err?: string) => {
    if (s === 'error' && err) toast(err, 'error', 8000)
  }, [])

  const startCompare = useCallback(() => {
    if (!A.report || running) return
    setPicking(true)
    if (!isDesktop) setDrawerOpen(false)
    toast('在搜索框输入要对比的小区，或直接在地图上点一下', 'info', 3600)
  }, [A.report, running, isDesktop])

  const onSwap = () => {
    swap()
    setFocus((f) => (f === 'A' ? 'B' : 'A'))
    setFitKey((k) => k + 1)
  }
  const onRemove = () => {
    removeB()
    setPicking(false)
    setFocus('A')
    setFitKey((k) => k + 1)
  }
  const onRetryB = () => B.center && analyzeSlot('B', B.center, B.label ?? undefined)
  const onRerun = (slot: Slot) => {
    const s = slot === 'A' ? A : B
    if (s.center) analyzeSlot(slot, s.center, s.label ?? undefined)
  }

  const onPrint = () => {
    setDrawerOpen(true)
    toast('打印对话框里请去掉「页眉和页脚」、勾选「背景图形」，导出效果最好', 'info', 6000)
    window.setTimeout(() => window.print(), 80)
  }
  const onExportSimulated = (simulated: HealthReport) =>
    simw.exportSimulated(simulated, () => setDrawerOpen(true))
  /** 对比模式下单独导出 A / B 完整报告：走同一套打印覆盖（设覆盖 → print → afterprint 清除） */
  const onPrintSingle = (slot: Slot) => {
    const r = slot === 'A' ? A.report : B.report
    if (!r) return
    toast(
      `正在导出 ${slot} 的完整报告；打印对话框里请去掉「页眉和页脚」、勾选「背景图形」`,
      'info',
      6000
    )
    simw.exportSimulated(r, () => setDrawerOpen(true))
  }
  /** 报告面板里的「模拟新建 / 去模拟」：对比模式先把聚焦切到该侧 */
  const onSimulateFrom = (slot: Slot, category?: FacilityCategory) => {
    if (picking) setPicking(false)
    setFocus(slot)
    simw.openPanel(category)
  }
  /** 移动端面板放抽屉里，抽屉收着就先拉起来 */
  const openSimulate = () => {
    simw.toggle()
    if (!isDesktop && !simw.open) setDrawerOpen(true)
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
  const simOnMap = isDesktop && simw.open && !!focused.report
  const leftInset = simOnMap ? 368 : 0
  const compareMode: CompareMode = picking ? 'picking' : hasB ? 'on' : 'off'
  const nameA = A.label ?? slotName(A.report)
  const nameB = B.label ?? slotName(B.report)
  const simPanelProps = focused.report
    ? {
        report: focused.report,
        virtuals: sim.virtuals,
        result: sim.result,
        placing: sim.placing,
        onSetPlacing: sim.setPlacing,
        onRemove: sim.remove,
        onUndo: sim.undo,
        onClear: sim.clear,
        onClose: simw.closePanel,
        onExport: onExportSimulated,
      }
    : null

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[var(--paper)]">
      <MapView
        center={A.center}
        isochrone={A.isochrone}
        compare={
          hasB
            ? {
                center: B.center,
                isochrone: B.isochrone,
                nameA,
                nameB,
                runningB: B.running,
                switchTop: notice ? '7.4rem' : isDesktop ? '3.9rem' : '3.75rem',
              }
            : null
        }
        focus={hasB ? focus : 'A'}
        onFocusChange={setFocus}
        pois={focused.pois}
        blindSpots={simw.blindSpots}
        focusIsochrone={focused.isochrone}
        showSamples={showSamples}
        onToggleSamples={() => setShowSamples((v) => !v)}
        rightInset={rightInset}
        bottomInset={bottomInset}
        leftInset={leftInset}
        placing={sim.placing}
        virtuals={sim.virtuals}
        onPlaceVirtual={sim.addVirtual}
        onRemoveVirtual={sim.remove}
        fitKey={fitKey}
        onCenterChange={onCenterChange}
        onStatus={onMapStatus}
      />

      <SearchBox
        busy={running}
        mock={mock}
        region={A.report?.address.city || '重庆市'}
        compareMode={picking}
        onCancelCompare={() => setPicking(false)}
        onPick={onSearchPick}
      />
      <TopBar
        canPrint={!!A.report}
        canCompare={!!A.report && !running}
        compare={compareMode}
        onCompare={() => (picking ? setPicking(false) : startCompare())}
        canSimulate={!!focused.report && !running}
        simulate={simw.mode}
        onSimulate={openSimulate}
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
          title={
            hasB
              ? `分析 ${runningSlot} · ${runningSlot === 'B' ? '对比地点' : '当前地点'}`
              : '分析中'
          }
          onCancel={cancel}
        />
      )}

      {simOnMap && simPanelProps && (
        <SimulatePanel
          className="map-ui no-print absolute bottom-4 left-4 z-[var(--z-overlay)] w-[22rem] max-h-[calc(100dvh-8rem)]"
          {...simPanelProps}
        />
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} onSnapChange={setSnap}>
        {!isDesktop && simw.open && simPanelProps && !simw.printReport && (
          <SimulatePanel className="mx-3 mb-2 mt-3" {...simPanelProps} />
        )}
        {simw.printReport ? (
          <ReportPanel
            report={simw.printReport}
            printing={printing}
            onPrint={onPrint}
            onRerun={() => onRerun(focus)}
          />
        ) : hasB ? (
          <ComparePanel
            A={A}
            B={B}
            state={state}
            runningSlot={runningSlot}
            nameA={nameA}
            nameB={nameB}
            printing={printing}
            onSwap={onSwap}
            onChangeB={startCompare}
            onRemove={onRemove}
            onPrint={onPrint}
            onPrintSingle={onPrintSingle}
            onRerun={onRerun}
            onRetryB={onRetryB}
            onSimulate={onSimulateFrom}
          />
        ) : A.report ? (
          <ReportPanel
            report={A.report}
            printing={printing}
            onPrint={onPrint}
            onRerun={() => onRerun('A')}
            onCompare={startCompare}
            onSimulate={(c) => onSimulateFrom('A', c)}
          />
        ) : running ? (
          <RunningPanel state={state} />
        ) : (
          <EmptyState
            mock={mock}
            noServerAk={!!health && !health.hasServerAk}
            onUseSample={() => analyzeSlot('A', MOCK_CENTER, '重庆璧山 · 东林大道')}
          />
        )}
        {state.status === 'error' && !A.report && !hasB && (
          <div className="mx-5 mb-6 border border-[var(--vermilion)] px-4 py-3 text-sm">
            <p className="font-medium text-[var(--vermilion)]">分析失败</p>
            <p className="mt-1 break-words text-[var(--ink-2)]">{state.error}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn !min-h-9 text-xs"
                onClick={() => A.center && analyzeSlot('A', A.center, A.label ?? undefined)}
              >
                重试
              </button>
              <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={onRemove}>
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
