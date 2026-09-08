import type { Slot, Winner } from '@/lib/ui/compare'
import { SLOT_COLOR } from '@/lib/ui/compare'

/** 槽位徽标：实心圆 + 字母，A 青 / B 赭 */
export function SlotChip({ slot, size = 18 }: { slot: Slot; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-[var(--paper)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.6),
        background: SLOT_COLOR[slot],
        fontFamily: 'var(--font-serif)',
      }}
      aria-label={`${slot} 地点`}
    >
      {slot}
    </span>
  )
}

/** 「更优」标记：青色实心小标，谁好挂谁身上；平局不显示 */
export function WinnerMark({
  winner,
  slot,
  compact = false,
}: {
  winner: Winner | null
  slot: Slot
  compact?: boolean
}) {
  if (winner !== slot) return null
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--teal)] font-medium leading-none text-[var(--paper)] ${
        compact ? 'h-4 px-1.5 text-[10px]' : 'h-5 px-2 text-[11px]'
      }`}
      aria-label="更优"
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {!compact && '更优'}
    </span>
  )
}

/** 两列表头：A 名 | B 名（移动端与桌面同样两列） */
export function SlotHeads({ nameA, nameB }: { nameA: string; nameB: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {(['A', 'B'] as Slot[]).map((s) => (
        <div key={s} className="flex min-w-0 items-center gap-1.5">
          <SlotChip slot={s} size={16} />
          <span className="min-w-0 break-words text-xs text-[var(--ink-2)]">
            {s === 'A' ? nameA : nameB}
          </span>
        </div>
      ))}
    </div>
  )
}
