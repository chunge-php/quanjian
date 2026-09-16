'use client'
import { useEffect } from 'react'
import type { LngLat } from '@/lib/types'
import type { Slot } from '@/lib/ui/compare'
import { Icon } from '@/components/Icon'
import { centerMarkerUrl } from '@/lib/ui/theme'
import { getDomMarkerClass } from '@/components/map/domMarker'

export interface PendingClick {
  p: LngLat
  slot: Slot
}

/**
 * 已有报告后点地图不再立刻重算（圈内找设施时太容易误触），先落一个待定点，
 * 由这张卡确认：「重新体检」/ 取消。Esc 也能取消。
 */
export default function PendingClickCard({
  pending,
  comparing,
  shifted,
  onConfirm,
  onCancel,
}: {
  pending: PendingClick
  comparing: boolean
  /** 桌面左下被模拟面板占着时右移 */
  shifted?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className={`panel map-ui no-print rise-in absolute left-3 right-3 top-[4.5rem] z-[var(--z-overlay)] border border-[var(--vermilion)] bg-[var(--paper)] md:right-auto md:top-auto md:bottom-4 md:w-[22rem] ${shifted ? 'md:left-[24rem]' : 'md:left-4'}`}
      role="dialog"
      aria-label="确认是否以点选处为中心重新体检"
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--vermilion)] text-[var(--vermilion)]">
          <Icon name="crosshair" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">
            以这里为中心重新体检{comparing ? `（${pending.slot} 地点）` : ''}？
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">
            {pending.p.lng.toFixed(5)}, {pending.p.lat.toFixed(5)} · 当前报告会被替换
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary !min-h-8 text-xs" onClick={onConfirm}>
              <Icon name="locate" size={13} />
              重新体检
            </button>
            <button type="button" className="btn btn-ghost !min-h-8 text-xs" onClick={onCancel}>
              取消
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost !min-h-8 !px-2"
          onClick={onCancel}
          aria-label="取消"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  )
}

/** 待定点的朱砂十字标：只做提示，不响应鼠标 */
export function usePendingMarker(map: BMapGL.Map | null, p: LngLat | null) {
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !p) return
    const DomMarker = getDomMarkerClass(B)
    const marker = new DomMarker(new B.Point(p.lng, p.lat), {
      url: centerMarkerUrl(),
      size: 36,
      zIndex: 9,
      interactive: false,
    })
    map.addOverlay(marker)
    return () => map.removeOverlay(marker)
  }, [map, p])
}
