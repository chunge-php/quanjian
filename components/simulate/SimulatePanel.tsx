'use client'
import type { FacilityCategory, HealthReport } from '@/lib/types'
import { CategoryIcon, Icon } from '@/components/Icon'
import { CATEGORY_LABEL } from '@/lib/ui/theme'
import {
  SIMULATABLE_CATEGORIES,
  type SimulationResult,
  type VirtualFacility,
} from '@/lib/ui/simulate'
import SimulateDiff from '@/components/simulate/SimulateDiff'
import VirtualList from '@/components/simulate/VirtualList'

export interface SimulatePanelProps {
  report: HealthReport
  virtuals: VirtualFacility[]
  /** 无拟建设施时为 null */
  result: SimulationResult | null
  /** 放置模式选中的类别；null = 未进入放置模式 */
  placing: FacilityCategory | null
  onSetPlacing: (c: FacilityCategory | null) => void
  onRemove: (id: string) => void
  onUndo: () => void
  onClear: () => void
  onClose: () => void
  /** 「导出到 PDF」：把模拟后的报告交给父级，父级负责替换抽屉内容并 window.print() */
  onExport: (simulated: HealthReport) => void
  /** 父级决定摆放位置；默认无定位 */
  className?: string
}

/**
 * 「假如在这里新建一处 X」模拟面板（受控组件，自身不持状态）。
 * 顶部三类别芯片 → 已放置列表 → 效果对比 → 撤销 / 清空 / 导出。
 */
export default function SimulatePanel(p: SimulatePanelProps) {
  const n = p.virtuals.length
  return (
    <section
      className={`panel flex max-h-full flex-col border border-[var(--ink)] bg-[var(--paper)] ${p.className ?? ''}`}
      aria-label="新建设施模拟"
    >
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-3.5 py-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-[var(--vermilion)] text-[var(--vermilion)]">
          <Icon name="pin" size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="kicker">规划模拟</p>
          <p className="truncate text-sm font-medium leading-tight">假如在这里新建一处…</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon !h-8 !min-h-8 !w-8"
          aria-label="关闭模拟面板"
          onClick={p.onClose}
        >
          <Icon name="x" size={14} />
        </button>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-3.5 py-3">
        <div role="group" aria-label="选择要新建的设施类别" className="flex flex-wrap gap-1.5">
          {SIMULATABLE_CATEGORIES.map((c) => {
            const on = p.placing === c
            return (
              <button
                key={c}
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors duration-150 ${
                  on
                    ? 'border-[var(--vermilion)] bg-[var(--vermilion)] text-[var(--paper)] shadow-[0_0_0_3px_var(--vermilion-tint)]'
                    : 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-[var(--ink)] hover:text-[var(--ink)]'
                }`}
                aria-pressed={on}
                onClick={() => p.onSetPlacing(on ? null : c)}
              >
                <CategoryIcon category={c} size={14} />
                {CATEGORY_LABEL[c]}
              </button>
            )
          })}
        </div>
        <p
          className={`mt-2 text-xs leading-5 ${
            p.placing ? 'font-medium text-[var(--vermilion)]' : 'text-[var(--ink-2)]'
          }`}
          aria-live="polite"
        >
          {p.placing
            ? `放置模式：在地图上点一下，放一处${CATEGORY_LABEL[p.placing]}（再点类别可退出）`
            : '选好类别后在地图上点一下放置；可放多处、多类，系统即时重算'}
        </p>

        <p className="kicker mb-1.5 mt-4">已放置（{n}）</p>
        <VirtualList virtuals={p.virtuals} center={p.report.center} onRemove={p.onRemove} />

        <p className="kicker mb-1.5 mt-4">效果对比</p>
        {p.result ? (
          <SimulateDiff diff={p.result.diff} />
        ) : (
          <p className="text-xs leading-5 text-[var(--ink-3)]">
            当前综合 <span className="figure text-[var(--ink)]">{p.report.overallScore}</span> 分、
            盲区网格 <span className="figure text-[var(--ink)]">{p.report.blindSpots.length}</span>{' '}
            个。放下第一处拟建设施后，这里显示前后对比。
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-3.5 py-2.5">
        <button
          type="button"
          className="btn !min-h-9 text-xs"
          disabled={n === 0}
          onClick={p.onUndo}
        >
          撤销
        </button>
        <button
          type="button"
          className="btn btn-ghost !min-h-9 text-xs"
          disabled={n === 0}
          onClick={p.onClear}
        >
          清空
        </button>
        <button
          type="button"
          className="btn btn-primary ml-auto !min-h-9 text-xs"
          disabled={!p.result}
          onClick={() => p.result && p.onExport(p.result.report)}
          title={p.result ? '把含拟建设施的报告导出为 PDF' : '先放置至少一处拟建设施'}
        >
          <Icon name="printer" size={14} />
          导出模拟结果到 PDF
        </button>
      </footer>
    </section>
  )
}
