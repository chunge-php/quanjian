import type { CategoryRow, Comparison, Slot } from '@/lib/ui/compare'
import { SLOT_COLOR } from '@/lib/ui/compare'
import { CategoryIcon } from '@/components/Icon'
import { SlotChip, WinnerMark } from '@/components/compare/SlotChip'

/**
 * 十类对照：类别 | A 步行分钟 | B 步行分钟 | 差值 | 谁更好。
 * 桌面一行四格；窄屏类别名独占一行、三个数字在下一行，不横向溢出、不截断文字。
 */
export default function CompareTable({ c }: { c: Comparison }) {
  return (
    <div role="table" aria-label="十类设施最近步行分钟对照" className="text-sm">
      <div
        role="row"
        className="hidden grid-cols-[1fr_4rem_4rem_4rem_3.5rem] items-center gap-x-2 border-b border-[var(--line-strong)] pb-1.5 text-[0.6875rem] text-[var(--ink-3)] sm:grid"
      >
        <span role="columnheader">类别 · 最近一处步行</span>
        <span role="columnheader" className="flex items-center justify-end gap-1">
          <SlotChip slot="A" size={14} /> 分钟
        </span>
        <span role="columnheader" className="flex items-center justify-end gap-1">
          <SlotChip slot="B" size={14} /> 分钟
        </span>
        <span role="columnheader" className="text-right">
          差值
        </span>
        <span role="columnheader" className="text-right">
          谁更好
        </span>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {c.rows.map((r) => (
          <Row key={r.category} r={r} />
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-[var(--ink-3)]">
        差值 = B − A（分钟），负数表示 B 更近；「—」表示周边 1.8
        公里内一处也没有。「谁更好」先比得分再比分钟。硬指标三项红字。
      </p>
    </div>
  )
}

function Row({ r }: { r: CategoryRow }) {
  const wa = r.a.nearestWalkMin
  const wb = r.b.nearestWalkMin
  return (
    <li
      role="row"
      className="grid grid-cols-1 gap-y-1 py-1.5 sm:grid-cols-[1fr_4rem_4rem_4rem_3.5rem] sm:items-center sm:gap-x-2"
    >
      <span
        role="cell"
        className={`flex min-w-0 items-center gap-1.5 ${r.essential ? 'text-[var(--vermilion)]' : 'text-[var(--ink)]'}`}
      >
        <CategoryIcon category={r.category} size={14} className="shrink-0" />
        <span className="break-words font-medium">{r.label}</span>
        {r.essential && <span className="text-[10px] tracking-wider">硬指标</span>}
      </span>
      <div className="grid grid-cols-4 gap-x-2 sm:contents">
        <Cell slot="A" minutes={wa} winner={r.winner} />
        <Cell slot="B" minutes={wb} winner={r.winner} />
        <span
          role="cell"
          className="tnum text-right text-xs"
          style={{
            color:
              r.walkDiffMin == null
                ? 'var(--ink-3)'
                : r.walkDiffMin === 0
                  ? 'var(--ink-3)'
                  : 'var(--ink)',
          }}
        >
          <span className="mr-1 text-[10px] text-[var(--ink-3)] sm:hidden">差</span>
          {r.walkDiffMin == null
            ? '—'
            : r.walkDiffMin === 0
              ? '持平'
              : `${r.walkDiffMin > 0 ? '+' : '−'}${Math.abs(r.walkDiffMin)}`}
        </span>
        <span
          role="cell"
          className="text-right text-xs font-semibold"
          style={{ color: r.winner === 'tie' ? 'var(--ink-3)' : SLOT_COLOR[r.winner] }}
        >
          <span className="mr-1 text-[10px] font-normal text-[var(--ink-3)] sm:hidden">优</span>
          {r.winner === 'tie' ? '持平' : r.winner}
        </span>
      </div>
    </li>
  )
}

function Cell({
  slot,
  minutes,
  winner,
}: {
  slot: Slot
  minutes: number | null
  winner: CategoryRow['winner']
}) {
  const better = winner === slot
  return (
    <span role="cell" className="flex items-center justify-end gap-1 whitespace-nowrap text-right">
      <span className="mr-auto text-[10px] text-[var(--ink-3)] sm:hidden">{slot}</span>
      <WinnerMark winner={winner} slot={slot} compact />
      <span
        className={`tnum ${better ? 'font-semibold text-[var(--teal)]' : minutes == null ? 'text-[var(--ink-3)]' : ''}`}
      >
        {minutes == null ? '—' : Math.round(minutes)}
      </span>
    </span>
  )
}
