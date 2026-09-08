'use client'
import { useMemo } from 'react'
import type { HealthReport } from '@/lib/types'
import { buildComparison } from '@/lib/ui/compare'
import { Icon } from '@/components/Icon'
import SectionHead from '@/components/report/SectionHead'
import SourceBadge from '@/components/report/SourceBadge'
import { PrintNote } from '@/components/report/PrintNotes'
import { SlotChip } from '@/components/compare/SlotChip'
import CompareScores from '@/components/compare/CompareScores'
import CompareRadar from '@/components/compare/CompareRadar'
import CompareTable from '@/components/compare/CompareTable'
import { CompareEssentials, MetricList } from '@/components/compare/CompareMetrics'
import CompareConclusion from '@/components/compare/CompareConclusion'

interface Props {
  a: HealthReport
  b: HealthReport
  onSwap: () => void
  onChangeB: () => void
  onRemove: () => void
  onPrint: () => void
}

/** 对比视图：两列分数 → 雷达叠加 → 十类对照 → 硬指标 → 等时圈 / 盲区 → 结论 */
export default function CompareView({ a, b, onSwap, onChangeB, onRemove, onPrint }: Props) {
  const c = useMemo(() => buildComparison(a, b), [a, b])
  return (
    <article className="relative pb-2">
      <span className="sheet-corner left-2 top-2 hidden md:block" aria-hidden="true" />
      <span className="sheet-corner right-2 top-2 hidden md:block" aria-hidden="true" />

      <section className="print-avoid px-5 pb-4 pt-4 md:pt-5">
        <p className="kicker">生活圈体检 · 两地对比</p>
        <ul className="mt-1.5 space-y-1.5">
          {[['A', a] as const, ['B', b] as const].map(([slot, r]) => (
            <li key={slot} className="flex items-start gap-2">
              <SlotChip slot={slot} size={18} />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold leading-snug">
                  {r.address.formatted || '未命名地点'}
                </p>
                {(r.address.district || r.address.city) && (
                  <p className="text-xs text-[var(--ink-3)]">
                    {[r.address.city, r.address.district, r.address.street]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <SourceBadge source={r.dataSource} />
            </li>
          ))}
        </ul>

        <div className="no-print mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn !min-h-9 text-xs" onClick={onSwap}>
            <Icon name="swap" size={14} />
            交换 A / B
          </button>
          <button type="button" className="btn !min-h-9 text-xs" onClick={onChangeB}>
            <Icon name="compare" size={14} />
            换对比地点
          </button>
          <button type="button" className="btn !min-h-9 text-xs" onClick={onPrint}>
            <Icon name="printer" size={14} />
            导出 PDF
          </button>
          <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={onRemove}>
            <Icon name="x" size={14} />
            移除对比
          </button>
        </div>
      </section>

      <section className="print-avoid px-5">
        <SectionHead no="01" title="综合评分" note="谁高谁标「更优」" />
        <CompareScores c={c} />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="02" title="十类设施覆盖" note="雷达叠加 · 满分 100" />
        <CompareRadar c={c} />
        <PrintNote>
          怎么看：两条线各是一地十类设施的得分，谁的图形更饱满谁的设施更齐；A 实线青色，B
          虚线赭色。红字三项是硬指标。
        </PrintNote>
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="03" title="十类对照" note="最近一处步行分钟" />
        <CompareTable c={c} />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="04" title="硬指标" note="缺一项即盲区" />
        <CompareEssentials c={c} />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="05" title="等时圈" note="15 分钟能走多远" />
        <MetricList rows={c.isoRows} label="等时圈指标对照" />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="06" title="服务盲区" note="200 m 网格 · 越少越好" />
        <MetricList rows={c.blindRows} label="盲区网格数对照" />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="07" title="结论" note="按类别分差自动生成" />
        <CompareConclusion c={c} />
      </section>
    </article>
  )
}
