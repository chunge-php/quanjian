'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export const DRAWER_MIN = 360
export const DRAWER_MAX = 900
export const DRAWER_DEFAULT = 400
export const DRAWER_WIDE = 640
const KEY = 'quanjian.drawerWidth'

/**
 * 桌面端报告抽屉宽度：可拖左边缘调整、双击在 400 / 640 间切换、记住用户拖过的值；
 * 用户没手动拖过时，对比模式自动放宽到 640。
 */
export function useDrawerWidth(wantWide: boolean) {
  const [width, setWidth] = useState(DRAWER_DEFAULT)
  const [manual, setManual] = useState(false)
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(KEY))
      if (v >= DRAWER_MIN && v <= DRAWER_MAX) {
        setWidth(v)
        setManual(true)
      }
    } catch {
      /* 无 localStorage 时忽略 */
    }
  }, [])

  useEffect(() => {
    if (!manual) setWidth(wantWide ? DRAWER_WIDE : DRAWER_DEFAULT)
  }, [wantWide, manual])

  const commit = useCallback((w: number) => {
    const clamped = Math.round(Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, w)))
    setWidth(clamped)
    setManual(true)
    try {
      localStorage.setItem(KEY, String(clamped))
    } catch {
      /* ignore */
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      drag.current = { startX: e.clientX, startW: width }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width]
  )
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    // 抽屉在右侧：向左拖变宽
    const w = drag.current.startW + (drag.current.startX - e.clientX)
    setWidth(Math.min(DRAWER_MAX, Math.max(DRAWER_MIN, w)))
  }, [])
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current) return
      const w = drag.current.startW + (drag.current.startX - e.clientX)
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      commit(w)
    },
    [commit]
  )
  const toggle = useCallback(() => {
    commit(width >= (DRAWER_DEFAULT + DRAWER_WIDE) / 2 ? DRAWER_DEFAULT : DRAWER_WIDE)
  }, [commit, width])
  const reset = useCallback(() => {
    setManual(false)
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, [])

  return {
    width,
    manual,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    toggle,
    reset,
  }
}
