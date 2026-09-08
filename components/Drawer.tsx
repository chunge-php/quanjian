'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

type Snap = 'peek' | 'half' | 'full'
const PEEK = 132

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  /** 移动端吸附位变化（用于地图留边） */
  onSnapChange?: (snap: Snap) => void
  /** 桌面端宽度（px），默认 400 */
  width?: number
  /** 桌面端左边缘拖拽把手事件（来自 useDrawerWidth） */
  resizeHandleProps?: React.HTMLAttributes<HTMLDivElement>
  /** 双击把手：在 400 / 640 间切换 */
  onResizeToggle?: () => void
}

/**
 * 报告抽屉：桌面 = 右侧 400px 固定面板；移动端 = 底部可拖抽屉（peek / half / full）
 * 拖动只改 transform，不改高度，60fps
 */
export default function Drawer({
  open,
  onOpenChange,
  children,
  onSnapChange,
  width = 400,
  resizeHandleProps,
  onResizeToggle,
}: Props) {
  const [snap, setSnap] = useState<Snap>('half')
  const [vh, setVh] = useState(800)
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startY: number; startOffset: number; moved: boolean } | null>(null)
  const [dragOffset, setDragOffset] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setVh(window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    onSnapChange?.(open ? snap : 'peek')
  }, [snap, open, onSnapChange])

  const offsetFor = useCallback(
    (s: Snap) => (s === 'full' ? 0 : s === 'half' ? Math.round(vh * 0.5) : Math.max(0, vh - PEEK)),
    [vh]
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    drag.current = { startY: e.clientY, startOffset: offsetFor(open ? snap : 'peek'), moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.startY
    if (Math.abs(dy) > 4) drag.current.moved = true
    setDragOffset(Math.min(Math.max(0, drag.current.startOffset + dy), vh - PEEK))
  }
  const onPointerUp = () => {
    if (!drag.current) return
    const cur = dragOffset ?? drag.current.startOffset
    const moved = drag.current.moved
    drag.current = null
    setDragOffset(null)
    if (!moved) {
      // 点一下把手：peek ↔ half
      if (!open || snap === 'peek') {
        onOpenChange(true)
        setSnap('half')
      } else setSnap('peek')
      return
    }
    const candidates: [Snap, number][] = [
      ['full', 0],
      ['half', offsetFor('half')],
      ['peek', offsetFor('peek')],
    ]
    const nearest = candidates.reduce((a, b) =>
      Math.abs(b[1] - cur) < Math.abs(a[1] - cur) ? b : a
    )[0]
    onOpenChange(true)
    setSnap(nearest)
  }

  const mobileOffset = dragOffset ?? offsetFor(open ? snap : 'peek')
  const dragging = dragOffset != null

  return (
    <aside
      ref={sheetRef}
      className={`drawer sheet fixed z-[var(--z-drawer)] flex flex-col border-[var(--ink)] bg-[var(--paper)]
        inset-x-0 bottom-0 h-[100dvh] border-t md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[var(--drawer-w)] md:border-l md:border-t-0
        ${dragging ? '' : 'transition-transform duration-300 ease-[var(--ease-out)]'}
        ${open ? 'md:translate-x-0' : 'md:translate-x-full'}`}
      style={{
        ['--mobile-offset' as string]: `${mobileOffset}px`,
        ['--drawer-w' as string]: `${width}px`,
      }}
      aria-label="体检报告"
    >
      {resizeHandleProps && (
        <div
          className="drawer-resize no-print absolute inset-y-0 left-0 z-10 hidden w-2 cursor-col-resize touch-none md:block"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整报告宽度，双击在窄/宽之间切换"
          title="拖动调整宽度 · 双击切换窄/宽"
          onDoubleClick={onResizeToggle}
          {...resizeHandleProps}
        />
      )}
      <div
        className="drawer-handle no-print flex h-8 shrink-0 cursor-grab touch-none items-center justify-center md:hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="button"
        tabIndex={0}
        aria-label="拖动调整报告高度"
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') setSnap((s) => (s === 'peek' ? 'half' : 'full'))
          if (e.key === 'ArrowDown') setSnap((s) => (s === 'full' ? 'half' : 'peek'))
        }}
      >
        <span className="h-1 w-12 bg-[var(--line-strong)]" aria-hidden="true" />
      </div>
      <div className="drawer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-thin">
        {children}
      </div>
      <style jsx>{`
        @media (max-width: 767px) {
          aside {
            transform: translateY(var(--mobile-offset));
          }
        }
      `}</style>
    </aside>
  )
}
