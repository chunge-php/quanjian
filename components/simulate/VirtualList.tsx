'use client'
import type { LngLat } from '@/lib/types'
import { CategoryIcon, Icon } from '@/components/Icon'
import { virtualLabel, virtualPosition, type VirtualFacility } from '@/lib/ui/simulate'
import { fmtMeters, fmtSecToMin } from '@/lib/ui/format'

interface Props {
  virtuals: VirtualFacility[]
  center: LngLat
  onRemove: (id: string) => void
}

/** 已放置的拟建设施列表：类别 / 方位与距中心 / 步行分钟 / 删除 */
export default function VirtualList({ virtuals, center, onRemove }: Props) {
  if (virtuals.length === 0) {
    return (
      <p className="border border-dashed border-[var(--line-strong)] px-3 py-2.5 text-center text-xs text-[var(--ink-3)]">
        还没有放置任何拟建设施
      </p>
    )
  }
  return (
    <ul
      className="divide-y divide-[var(--line)] border border-[var(--line-strong)]"
      aria-label="已放置的拟建设施"
    >
      {virtuals.map((v) => {
        const pos = virtualPosition(v, center)
        const min = fmtSecToMin(v.walkSec)
        return (
          <li key={v.id} className="flex items-center gap-2.5 px-2.5 py-2 text-sm">
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--vermilion)] text-[var(--vermilion)]"
              aria-hidden="true"
            >
              <CategoryIcon category={v.category} size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{virtualLabel(v, virtuals)}</p>
              <p className="mt-0.5 text-xs text-[var(--ink-2)]">
                {pos.direction}
                {pos.direction !== '中心' && (
                  <>
                    {' '}
                    <span className="figure">{fmtMeters(pos.distM)}</span>
                  </>
                )}
                <span className="mx-1.5 text-[var(--line-strong)]">|</span>
                步行{' '}
                <span
                  className={`figure font-semibold ${
                    min !== null && min > 15 ? 'text-[var(--vermilion)]' : 'text-[var(--teal)]'
                  }`}
                >
                  {min === null ? '—' : min}
                </span>{' '}
                分钟
                {v.pending ? (
                  <span className="blink ml-1 text-[0.6875rem] text-[var(--ink-3)]">算路中</span>
                ) : (
                  v.source === 'estimate' && (
                    <span className="ml-1 text-[0.6875rem] text-[var(--ink-3)]">估算</span>
                  )
                )}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon !h-8 !min-h-8 !w-8 shrink-0"
              aria-label={`移除${virtualLabel(v, virtuals)}`}
              title="移除"
              onClick={() => onRemove(v.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
