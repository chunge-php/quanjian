import type { BatchReport } from '@/lib/types'
import { CategoryIcon } from '@/components/Icon'

interface Props {
  coverage: BatchReport['coverageByCategory']
  /** 打印用：更紧凑 */
  print?: boolean
}

function barColor(ratio: number): string {
  return ratio >= 0.8 ? 'var(--teal)' : ratio >= 0.5 ? 'var(--ochre)' : 'var(--vermilion)'
}

/** 十类「15 分钟可达点位占比」横向条（纯 CSS，硬指标红字） */
export default function BatchCoverageBars({ coverage, print }: Props) {
  const rows = coverage
    .slice()
    .sort((a, b) => Number(b.essential) - Number(a.essential) || b.ratio - a.ratio)
  return (
    <ul className={print ? 'space-y-1' : 'space-y-1.5'} data-testid="batch-coverage">
      {rows.map((c) => {
        const pct = Math.round(c.ratio * 100)
        return (
          <li key={c.category} className="flex items-center gap-2">
            <span
              className={`flex w-[5.5rem] shrink-0 items-center gap-1 ${print ? 'text-[10.5px]' : 'text-xs'} ${
                c.essential ? 'font-medium text-[var(--vermilion)]' : 'text-[var(--ink-2)]'
              }`}
            >
              <CategoryIcon category={c.category} size={11} />
              {c.label}
            </span>
            <span
              className={`relative flex-1 overflow-hidden rounded-[3px] bg-[var(--paper-3)] ${print ? 'h-2.5' : 'h-3'}`}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`${c.label} 15 分钟可达点位占比 ${pct}%`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-[3px]"
                style={{ width: `${pct}%`, background: barColor(c.ratio) }}
              />
              {/* 80% 参考线 */}
              <span
                className="absolute inset-y-0 left-[80%] w-px bg-[var(--ink)] opacity-40"
                aria-hidden="true"
              />
            </span>
            <span
              className={`figure w-9 shrink-0 text-right ${print ? 'text-[10.5px]' : 'text-xs'}`}
              style={{ color: barColor(c.ratio) }}
            >
              {pct}%
            </span>
          </li>
        )
      })}
      <li className={`pt-0.5 text-[var(--ink-3)] ${print ? 'text-[10px]' : 'text-[11px]'}`}>
        竖线 = 80% 参考：青 ≥ 80% · 赭 50–79% · 朱砂 &lt; 50%
      </li>
    </ul>
  )
}
