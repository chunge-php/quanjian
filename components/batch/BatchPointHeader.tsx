'use client'
import type { BatchPointSummary } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'

interface Props {
  summary: BatchPointSummary
  total: number
  onBack: () => void
  onPrev: (() => void) | null
  onNext: (() => void) | null
  onExport: () => void
}

/** 点详情顶部一条：「街道体检 · 第 i 点 · 返回汇总」，上一点 / 下一点、导出此点 */
export default function BatchPointHeader({
  summary,
  total,
  onBack,
  onPrev,
  onNext,
  onExport,
}: Props) {
  const color = GRADE_COLOR[summary.overallGrade]
  return (
    <div
      className="no-print sticky top-0 z-[1] mx-3 mt-3 rounded-[var(--r-md)] border border-[var(--teal)] bg-[var(--paper)] px-3 py-2"
      data-testid="batch-point-header"
    >
      <div className="flex items-center gap-2">
        <button type="button" className="btn !min-h-8 gap-1 !px-2.5 text-xs" onClick={onBack}>
          <Icon name="chevronDown" size={12} className="rotate-90" />
          返回汇总
        </button>
        <span className="min-w-0 flex-1 text-xs leading-4">
          <span className="kicker">
            街道体检 · 第 {summary.index + 1} 点 / {total}
          </span>
          <span className="figure ml-2 font-semibold" style={{ color }}>
            {summary.overallScore} · {GRADE_LABEL[summary.overallGrade]}
          </span>
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            className="btn btn-icon !h-8 !min-h-8 !w-8"
            aria-label="上一点"
            onClick={onPrev ?? undefined}
            disabled={!onPrev}
          >
            <Icon name="chevronDown" size={12} className="rotate-90" />
          </button>
          <button
            type="button"
            className="btn btn-icon !h-8 !min-h-8 !w-8"
            aria-label="下一点"
            onClick={onNext ?? undefined}
            disabled={!onNext}
          >
            <Icon name="chevronDown" size={12} className="-rotate-90" />
          </button>
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 break-words text-xs text-[var(--ink-2)]">{summary.address}</p>
        <button
          type="button"
          className="btn !min-h-7 shrink-0 gap-1 !px-2 text-[11px]"
          onClick={onExport}
        >
          <Icon name="printer" size={12} />
          导出此点完整报告
        </button>
      </div>
    </div>
  )
}
