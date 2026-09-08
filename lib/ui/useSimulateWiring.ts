'use client'
/**
 * 圈见 · 模拟功能与外壳的接线：面板开关、放置模式三态、打印覆盖、聚焦切换清空提示。
 * 算法与拟建列表本身在 useSimulate；这里只管"外壳怎么用它"。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlindSpotCell, FacilityCategory, HealthReport } from '@/lib/types'
import { useSimulate, type SimulateApi } from '@/lib/ui/useSimulate'
import { toast } from '@/lib/ui/toast'

/** 顶栏按钮三态：关 / 开（面板打开）/ 放置中 */
export type SimulateMode = 'off' | 'on' | 'placing'

export interface SimulateWiring {
  sim: SimulateApi
  open: boolean
  mode: SimulateMode
  /** 打开面板；带类别则直接进入该类别的放置模式（规划建议「去模拟」用） */
  openPanel: (category?: FacilityCategory) => void
  closePanel: () => void
  /** 顶栏按钮：关 → 开；开 / 放置中 → 关 */
  toggle: () => void
  /** 地图盲区层：有模拟结果时用模拟后的，否则用原报告的 */
  blindSpots: BlindSpotCell[] | null
  /** 打印覆盖：导出模拟结果时抽屉临时显示的报告，afterprint 清掉 */
  printReport: HealthReport | null
  /** 「导出模拟结果到 PDF」：设覆盖并延时 window.print()，openDrawer 由外壳给 */
  exportSimulated: (simulated: HealthReport, openDrawer: () => void) => void
  clearPrintReport: () => void
}

export function useSimulateWiring(report: HealthReport | null): SimulateWiring {
  const sim = useSimulate(report)
  const [open, setOpen] = useState(false)
  const [printReport, setPrintReport] = useState<HealthReport | null>(null)
  const reportId = report?.id ?? null
  /** 报告切换时要恢复的放置类别（「去模拟」同时切聚焦槽位的场景） */
  const pendingRef = useRef<FacilityCategory | null>(null)
  const activeRef = useRef(false)
  activeRef.current = sim.active
  const prevIdRef = useRef<string | null>(null)
  const { setPlacing } = sim

  // 报告换了：useSimulate 已清空拟建列表；这里补提示，并恢复「去模拟」预选的类别
  useEffect(() => {
    const prev = prevIdRef.current
    prevIdRef.current = reportId
    if (prev !== null && prev !== reportId && activeRef.current)
      toast('报告已切换，拟建设施已清空', 'info', 2600)
    if (!reportId) {
      setOpen(false)
      return
    }
    if (pendingRef.current) setPlacing(pendingRef.current)
  }, [reportId, setPlacing])
  // 每次渲染后清掉待恢复类别（只在紧随其后的那次报告切换里生效）
  useEffect(() => {
    pendingRef.current = null
  })

  const openPanel = useCallback(
    (category?: FacilityCategory) => {
      setOpen(true)
      setPlacing(category ?? null)
      pendingRef.current = category ?? null
    },
    [setPlacing]
  )
  const closePanel = useCallback(() => {
    setOpen(false)
    setPlacing(null)
  }, [setPlacing])
  const toggle = useCallback(() => {
    if (open) closePanel()
    else openPanel()
  }, [open, openPanel, closePanel])

  const exportSimulated = useCallback((simulated: HealthReport, openDrawer: () => void) => {
    setPrintReport(simulated)
    openDrawer()
    window.setTimeout(() => window.print(), 120)
  }, [])
  const clearPrintReport = useCallback(() => setPrintReport(null), [])

  const mode: SimulateMode = !open ? 'off' : sim.placing ? 'placing' : 'on'
  return {
    sim,
    open,
    mode,
    openPanel,
    closePanel,
    toggle,
    blindSpots: sim.result?.report.blindSpots ?? report?.blindSpots ?? null,
    printReport,
    exportSimulated,
    clearPrintReport,
  }
}
