import type { CategoryScore } from '@/lib/types'
import type { Comparison, MetricRow, Slot } from '@/lib/ui/compare'
import { CategoryIcon } from '@/components/Icon'
import { SlotChip, WinnerMark } from '@/components/compare/SlotChip'

/** 硬指标三项并排：每项两行（A / B），有无 + 步行分钟 + 最近名称，谁近谁标 */
export function CompareEssentials({ c }: { c: Comparison }) {
  const rows = c.rows.filter((r) => r.essential)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {rows.map((r) => (
        <div
          key={r.category}
          className="min-w-0 rounded-[var(--r-md)] border border-[var(--line)] p-2.5"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--ink)]">
            <CategoryIcon category={r.category} size={14} />
            {r.label}
          </p>
          <div className="mt-2 space-y-2">
            <EssentialLine slot="A" s={r.a} winner={r.winner} />
            <EssentialLine slot="B" s={r.b} winner={r.winner} />
          </div>
        </div>
      ))}
    </div>
  )
}

function EssentialLine({
  slot,
  s,
  winner,
}: {
  slot: Slot
  s: CategoryScore
  winner: Comparison['rows'][number]['winner']
}) {
  const has = s.nearestWalkMin != null
  const better = winner === slot
  return (
    <div className="flex items-start gap-1.5">
      <SlotChip slot={slot} size={16} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span
            className="tnum text-xl font-bold"
            style={{
              fontFamily: 'var(--font-serif)',
              color: has ? (better ? 'var(--teal)' : 'var(--ink)') : 'var(--vermilion)',
            }}
          >
            {has ? Math.round(s.nearestWalkMin!) : '—'}
          </span>
          <span className="text-[0.6875rem] text-[var(--ink-3)]">
            {has ? (s.nearestWalkMin! <= 15 ? '分钟 · 圈内' : '分钟 · 圈外') : '1 公里内无'}
          </span>
          <WinnerMark winner={winner} slot={slot} compact />
        </p>
        <p className="mt-0.5 break-words text-[0.6875rem] text-[var(--ink-3)]">
          {s.nearest?.name ?? s.diagnosis}
        </p>
      </div>
    </div>
  )
}

/** 通用指标对照表（等时圈 / 盲区）：标签 | A | B，谁优谁标青 */
export function MetricList({ rows, label }: { rows: MetricRow[]; label: string }) {
  return (
    <dl aria-label={label} className="divide-y divide-[var(--line)] text-sm">
      {rows.map((m) => (
        <div
          key={m.label}
          className="grid grid-cols-1 gap-y-0.5 py-1.5 sm:grid-cols-[1fr_6rem_6rem] sm:items-center sm:gap-x-2"
        >
          <dt className="min-w-0">
            <span className="break-words text-[var(--ink)]">{m.label}</span>
            {m.note && (
              <span className="block break-words text-[0.6875rem] leading-4 text-[var(--ink-3)]">
                {m.note}
              </span>
            )}
          </dt>
          <div className="grid grid-cols-2 gap-x-2 sm:contents">
            <MetricCell slot="A" value={m.a} winner={m.winner} />
            <MetricCell slot="B" value={m.b} winner={m.winner} />
          </div>
        </div>
      ))}
    </dl>
  )
}

function MetricCell({
  slot,
  value,
  winner,
}: {
  slot: Slot
  value: string
  winner: MetricRow['winner']
}) {
  const better = winner === slot
  return (
    <dd className="flex items-center justify-end gap-1 whitespace-nowrap">
      <span className="mr-auto sm:hidden">
        <SlotChip slot={slot} size={14} />
      </span>
      <WinnerMark winner={winner} slot={slot} compact />
      <span className={`tnum ${better ? 'font-semibold text-[var(--teal)]' : ''}`}>{value}</span>
    </dd>
  )
}
