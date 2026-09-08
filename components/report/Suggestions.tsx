import type { FacilityCategory, HealthReport } from '@/lib/types'
import { ESSENTIAL_CATEGORIES } from '@/lib/categories'
import { CategoryIcon, Icon } from '@/components/Icon'
import { PRIORITY_COLOR, PRIORITY_LABEL } from '@/lib/ui/theme'

interface Props {
  items: HealthReport['suggestions']
  /** 硬指标建议旁的「去模拟」：打开模拟面板并预选该类别 */
  onSimulate?: (category: FacilityCategory) => void
}

/** 规划建议：按优先级色标，左侧竖线像图纸批注 */
export default function Suggestions({ items, onSimulate }: Props) {
  if (items.length === 0) return <p className="text-sm text-[var(--ink-3)]">暂无建议。</p>
  const order = { high: 0, medium: 1, low: 2 }
  const sorted = items.slice().sort((a, b) => order[a.priority] - order[b.priority])
  return (
    <ol className="space-y-3">
      {sorted.map((s, i) => {
        const color = PRIORITY_COLOR[s.priority]
        const simulable = !!s.category && ESSENTIAL_CATEGORIES.includes(s.category)
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
            {onSimulate && simulable && s.category && (
              <button
                type="button"
                className="no-print btn !min-h-7 shrink-0 self-start gap-1 !px-2 text-[0.6875rem]"
                onClick={() => onSimulate(s.category as FacilityCategory)}
                title="在地图上放一处，看分数与盲区怎么变"
              >
                <Icon name="pin" size={11} />
                去模拟
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
