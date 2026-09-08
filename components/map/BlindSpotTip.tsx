'use client'
import type { CellHover } from '@/components/map/useBlindSpotLayer'
import { CATEGORY_LABEL } from '@/lib/ui/theme'

/** 盲区网格 hover 提示：缺什么 */
export default function BlindSpotTip({
  hover,
  bounds,
}: {
  hover: CellHover
  bounds: { w: number; h: number }
}) {
  const W = 200
  const left = Math.min(Math.max(8, hover.x + 14), Math.max(8, bounds.w - W - 8))
  const top = hover.y + 18 > bounds.h - 90 ? hover.y - 86 : hover.y + 18
  const { cell } = hover
  return (
    <div
      className="map-ui pointer-events-none absolute z-[var(--z-overlay)] border border-[var(--vermilion)] bg-[var(--paper)] px-3 py-2 text-xs"
      style={{ left, top, width: W }}
      role="tooltip"
    >
      <p className="flex items-baseline justify-between">
        <span className="kicker !text-[var(--vermilion)]">服务盲区</span>
        <span className="text-[0.6875rem] text-[var(--ink-3)]">
          {cell.inIsochrone ? '圈内' : '圈外'} · {cell.sizeM} m 格
        </span>
      </p>
      <p className="mt-1 text-[var(--ink)]">
        1 公里内缺：
        <span className="font-medium text-[var(--vermilion)]">
          {cell.missing.map((m) => CATEGORY_LABEL[m]).join('、')}
        </span>
      </p>
      <p className="mt-0.5 text-[var(--ink-3)]">严重度 {Math.round(cell.severity * 100)}%</p>
    </div>
  )
}
