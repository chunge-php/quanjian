import type { HealthReport } from '@/lib/types'
import type { Comparison, Slot } from '@/lib/ui/compare'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { SlotChip, WinnerMark } from '@/components/compare/SlotChip'

/** 两列大分数与评级：谁高谁挂「更优」；中间一条分差 */
export default function CompareScores({ c }: { c: Comparison }) {
  const d = Math.abs(c.scoreDiff)
  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        <ScoreCol slot="A" report={c.a} name={c.nameA} winner={c.scoreWinner} />
        <ScoreCol slot="B" report={c.b} name={c.nameB} winner={c.scoreWinner} />
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
        {c.scoreWinner === 'tie' ? (
          <span className="text-[var(--ink-2)]">两地综合得分相同</span>
        ) : (
          <>
            <span className="font-medium">
              {c.scoreWinner} 综合高
              <span
                className="tnum mx-1 text-lg font-bold"
                style={{ fontFamily: 'var(--font-serif)', color: 'var(--teal)' }}
              >
                {d}
              </span>
              分
            </span>
            <span className="text-xs text-[var(--ink-3)]">硬指标 60% · 加分项 40%</span>
          </>
        )}
      </p>
    </div>
  )
}

function ScoreCol({
  slot,
  report,
  name,
  winner,
}: {
  slot: Slot
  report: HealthReport
  name: string
  winner: Comparison['scoreWinner']
}) {
  const color = GRADE_COLOR[report.overallGrade]
  const isWinner = winner === slot
  return (
    <div
      className={`min-w-0 rounded-[var(--r-md)] border px-3 py-2.5 ${
        isWinner ? 'border-[var(--teal)] bg-[var(--teal-tint)]' : 'border-[var(--line)]'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <SlotChip slot={slot} size={18} />
        <span className="min-w-0 break-words text-xs font-medium leading-snug text-[var(--ink)]">
          {name}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span
          className="tnum text-[3rem] font-bold leading-none tracking-tight"
          style={{ fontFamily: 'var(--font-serif)', color }}
        >
          {report.overallScore}
        </span>
        <span className="mb-1 text-xs text-[var(--ink-3)]">/ 100</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="stamp text-sm" style={{ color }}>
          {report.overallGrade} · {GRADE_LABEL[report.overallGrade]}
        </span>
        <WinnerMark winner={winner} slot={slot} />
      </div>
    </div>
  )
}
