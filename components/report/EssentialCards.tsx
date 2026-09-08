import type { CategoryScore } from '@/lib/types'
import { CategoryIcon } from '@/components/Icon'
import { GRADE_COLOR } from '@/lib/ui/theme'
import { fmtMeters } from '@/lib/ui/format'

/** 硬指标三项：有/无、最近多远、步行几分钟。三列并排，标注引线，不用卡片 */
export default function EssentialCards({ categories }: { categories: CategoryScore[] }) {
  const items = categories.filter((c) => c.essential)
  return (
    <div className="grid grid-cols-3 gap-x-3">
      {items.map((c) => {
        const has = c.nearestWalkMin != null
        const color = GRADE_COLOR[c.grade]
        return (
          <div key={c.category} className="leader min-w-0" style={{ color }}>
            <div className="flex items-center gap-1.5 text-[var(--ink)]">
              <CategoryIcon category={c.category} size={14} />
              <span className="text-sm font-medium">{c.label}</span>
            </div>
            <p
              className="mt-1 text-[0.6875rem] tracking-wider"
              style={{ color: has ? 'var(--teal)' : 'var(--vermilion)' }}
            >
              {has ? (c.nearestWalkMin! <= 15 ? '圈内有' : '圈外有') : '缺失'}
            </p>
            <p className="mt-1.5 leading-none text-[var(--ink)]">
              <span
                className="tnum text-2xl font-bold"
                style={{ fontFamily: 'var(--font-serif)', color }}
              >
                {has ? c.nearestWalkMin : '—'}
              </span>
              <span className="ml-1 text-xs text-[var(--ink-3)]">分钟</span>
            </p>
            <p className="tnum mt-1 text-xs text-[var(--ink-2)]">
              {has ? `最近 ${fmtMeters(c.nearest?.walkM ?? c.nearest?.straightM)}` : '1 公里内无'}
            </p>
            <p
              className="mt-0.5 truncate text-[0.6875rem] text-[var(--ink-3)]"
              title={c.nearest?.name}
            >
              {c.nearest?.name ?? c.diagnosis}
            </p>
          </div>
        )
      })}
    </div>
  )
}
