import type { HealthReport } from '@/lib/types'
import { CategoryIcon } from '@/components/Icon'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/lib/ui/theme'

/** 规划建议：按优先级色标，左侧竖线像图纸批注 */
export default function Suggestions({ items }: { items: HealthReport['suggestions'] }) {
  if (items.length === 0) return <p className="text-sm text-[var(--ink-3)]">暂无建议。</p>
  const order = { high: 0, medium: 1, low: 2 }
  const sorted = items.slice().sort((a, b) => order[a.priority] - order[b.priority])
  return (
    <ol className="space-y-3">
      {sorted.map((s, i) => {
        const color = PRIORITY_COLOR[s.priority]
        return (
          <li key={i} className="flex gap-3 border-l-2 pl-3" style={{ borderColor: color }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[0.6875rem] tracking-wider">
                <span style={{ color }}>{PRIORITY_LABEL[s.priority]}</span>
                {s.category && (
                  <span className="inline-flex items-center gap-1 text-[var(--ink-3)]">
                    <CategoryIcon category={s.category} size={11} />
                  </span>
                )}
              </div>
              <p className="mt-0.5 break-words text-sm leading-relaxed text-[var(--ink)]">
                {s.text}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
