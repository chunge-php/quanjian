'use client'
import type { BatchPointHover } from '@/components/map/useBatchLayer'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { essentialLine } from '@/lib/ui/batchExplain'

/** 地图上悬停网格点：地址与分数（跟随指针，靠边自动翻转） */
export default function BatchPointTip({
  hover,
  bounds,
}: {
  hover: BatchPointHover
  bounds: { w: number; h: number }
}) {
  const W = 232
  const flipX = bounds.w > 0 && hover.x + W + 24 > bounds.w
  const flipY = bounds.h > 0 && hover.y + 96 > bounds.h
  const s = hover.summary
  return (
    <div
      className="panel pointer-events-none absolute z-[var(--z-overlay)] border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-xs"
      style={{
        width: W,
        left: flipX ? hover.x - W - 12 : hover.x + 12,
        top: flipY ? hover.y - 92 : hover.y + 12,
      }}
      role="tooltip"
    >
      <p className="flex items-baseline gap-2">
        <span className="kicker">第 {hover.index + 1} 点</span>
        {s && (
          <span
            className="figure text-base font-semibold"
            style={{ color: GRADE_COLOR[s.overallGrade] }}
          >
            {s.overallScore}
            <span className="ml-1 text-[11px] font-normal">{GRADE_LABEL[s.overallGrade]}</span>
          </span>
        )}
      </p>
      {s ? (
        <>
          <p className="mt-0.5 break-words leading-4 text-[var(--ink)]">{s.address}</p>
          <p className="figure mt-1 text-[11px] text-[var(--ink-2)]">{essentialLine(s)}</p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">点一下看完整报告</p>
        </>
      ) : hover.failed ? (
        <p className="mt-0.5 break-words leading-4 text-[var(--vermilion)]">失败：{hover.failed}</p>
      ) : (
        <p className="mt-0.5 text-[var(--ink-3)]">待体检</p>
      )}
    </div>
  )
}
