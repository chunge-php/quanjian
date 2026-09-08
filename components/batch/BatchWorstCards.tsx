import type { BatchPointSummary, BatchReport } from '@/lib/types'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { formatMinutes } from '@/lib/report/format'
import { missingEssentials } from '@/lib/ui/batchExplain'

interface Props {
  report: BatchReport
  onOpen?: (index: number) => void
  print?: boolean
}

const ESS = [
  ['market', '菜市场'],
  ['pharmacy', '药店'],
  ['primary_school', '小学'],
] as const

/** 最差三点卡片：地址、分数评级、硬指标三项分钟、圈内盲区 */
export default function BatchWorstCards({ report, onOpen, print }: Props) {
  const worst = report.worst
    .map((i) => report.points.find((p) => p.index === i))
    .filter((p): p is BatchPointSummary => !!p)
  if (worst.length === 0) return <p className="text-sm text-[var(--ink-3)]">没有可比较的点位。</p>
  return (
    <ol className={print ? 'grid grid-cols-3 gap-2' : 'space-y-2'} data-testid="batch-worst">
      {worst.map((p, i) => {
        const color = GRADE_COLOR[p.overallGrade]
        const miss = missingEssentials(p)
        return (
          <li
            key={p.index}
            className="rounded-[var(--r-md)] border border-[var(--line-strong)] border-l-4 px-3 py-2"
            style={{ borderLeftColor: color }}
          >
            <div className="flex items-baseline gap-2">
              <span className="kicker">
                倒数第 {i + 1} · 第 {p.index + 1} 点
              </span>
              <span className="figure ml-auto text-lg font-semibold leading-none" style={{ color }}>
                {p.overallScore}
                <span className="ml-1 text-[11px] font-normal">{GRADE_LABEL[p.overallGrade]}</span>
              </span>
            </div>
            <p
              className={`mt-1 break-words text-[var(--ink)] ${print ? 'text-[11px] leading-4' : 'text-sm'}`}
            >
              {p.address}
            </p>
            <dl
              className={`figure mt-1.5 grid grid-cols-3 gap-1 ${print ? 'text-[10px]' : 'text-[11px]'}`}
            >
              {ESS.map(([k, label]) => {
                const v = p.essentialWalkMin[k]
                const bad = v == null || v > 15
                return (
                  <div key={k}>
                    <dt className="text-[var(--ink-3)]">{label}</dt>
                    <dd
                      className={
                        bad ? 'font-semibold text-[var(--vermilion)]' : 'text-[var(--ink)]'
                      }
                    >
                      {formatMinutes(v)}
                    </dd>
                  </div>
                )
              })}
            </dl>
            <p className={`mt-1.5 ${print ? 'text-[10px]' : 'text-[11px]'} text-[var(--ink-2)]`}>
              {miss.length ? `缺${miss.join('、')}` : '三项硬指标齐'} · 圈内盲区 {p.blindInIso} 格
              {onOpen && !print && (
                <button
                  type="button"
                  className="btn !min-h-6 ml-2 !px-1.5 text-[10px]"
                  onClick={() => onOpen(p.index)}
                >
                  看报告
                </button>
              )}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
