'use client'
import { useEffect, useRef, useState } from 'react'
import type { FacilityCategory } from '@/lib/types'
import type { Slot } from '@/lib/ui/compare'
import { slotName } from '@/lib/ui/compare'
import type { AnalyzeState } from '@/lib/ui/useAnalyze'
import type { SlotView } from '@/lib/ui/useSlots'
import { Icon } from '@/components/Icon'
import ReportPanel from '@/components/report/ReportPanel'
import RunningPanel from '@/components/RunningPanel'
import CompareView from '@/components/compare/CompareView'
import { SlotChip } from '@/components/compare/SlotChip'

type Tab = 'compare' | 'A' | 'B'

interface Props {
  A: SlotView
  B: SlotView
  state: AnalyzeState
  runningSlot: Slot
  /** 搜索框给的地名（无则用报告地址尾段） */
  nameA: string
  nameB: string
  printing: boolean
  onSwap: () => void
  onChangeB: () => void
  onRemove: () => void
  onPrint: () => void
  onRerun: (slot: Slot) => void
  onRetryB: () => void
  /** 模拟新建：只作用于该槽位（外壳会先把聚焦切到该侧） */
  onSimulate?: (slot: Slot, category?: FacilityCategory) => void
}

/**
 * 对比模式的抽屉内容：顶部对比视图，下方 tab 切 A / B 完整报告。
 * 打印时三段全出：对比视图 → A 报告 → B 报告（各自分页）。
 */
export default function ComparePanel(p: Props) {
  const [tab, setTab] = useState<Tab>('compare')
  const bothReady = !!p.A.report && !!p.B.report
  const tabBarRef = useRef<HTMLDivElement>(null)

  /** 切 tab 后把抽屉滚到 tab 栏处，别停在上一份报告的中间 */
  const pickTab = (t: Tab) => {
    setTab(t)
    window.requestAnimationFrame(() => {
      const bar = tabBarRef.current
      const scroller = bar?.closest('.drawer-scroll')
      if (!bar || !scroller) return
      const top = bar.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTo({ top: scroller.scrollTop + top - 8, behavior: 'smooth' })
    })
  }

  // B 换人 / 交换后回到对比页
  useEffect(() => {
    if (!bothReady) setTab('compare')
  }, [bothReady, p.A.report, p.B.report])

  if (p.state.status === 'running') {
    return (
      <RunningPanel
        state={p.state}
        title={p.runningSlot === 'B' ? '正在体检对比地点 B' : '正在重新体检 A'}
      />
    )
  }

  if (!p.A.report || !p.B.report) {
    return <PendingB A={p.A} B={p.B} onRetry={p.onRetryB} onRemove={p.onRemove} />
  }

  const a = p.A.report
  const b = p.B.report
  const tabs: { key: Tab; label: React.ReactNode }[] = [
    { key: 'compare', label: '对比' },
    { key: 'A', label: <TabName slot="A" name={p.nameA} full={a.address.formatted} /> },
    { key: 'B', label: <TabName slot="B" name={p.nameB} full={b.address.formatted} /> },
  ]

  return (
    <div className="pb-6">
      <div className={tab === 'compare' ? '' : 'hidden print:block'}>
        <CompareView
          a={a}
          b={b}
          onSwap={p.onSwap}
          onChangeB={p.onChangeB}
          onRemove={p.onRemove}
          onPrint={p.onPrint}
        />
      </div>

      <div
        ref={tabBarRef}
        className="no-print sticky top-0 z-[1] mx-5 mt-2 flex gap-1 border-b border-[var(--ink)] bg-[var(--paper)] pt-2"
        role="tablist"
        aria-label="对比视图与各自完整报告"
      >
        {tabs.map((t) => {
          const on = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pickTab(t.key)}
              className={`-mb-px flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-[8px] border border-b-0 px-3 text-xs transition-colors duration-150 ${
                on
                  ? 'border-[var(--ink)] bg-[var(--ink)] font-medium text-[var(--paper)]'
                  : 'border-transparent text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className={`print-break ${tab === 'A' ? '' : 'hidden print:block'}`}>
        <ReportPanel
          report={a}
          printing={p.printing}
          onPrint={p.onPrint}
          onRerun={() => p.onRerun('A')}
          onSimulate={p.onSimulate && ((c) => p.onSimulate?.('A', c))}
        />
      </div>
      <div className={`print-break ${tab === 'B' ? '' : 'hidden print:block'}`}>
        <ReportPanel
          report={b}
          printing={p.printing}
          onPrint={p.onPrint}
          onRerun={() => p.onRerun('B')}
          onSimulate={p.onSimulate && ((c) => p.onSimulate?.('B', c))}
        />
      </div>
    </div>
  )
}

function TabName({ slot, name, full }: { slot: Slot; name: string; full: string }) {
  return (
    <>
      <SlotChip slot={slot} size={14} />
      <span className="max-w-[7.5rem] truncate" title={full}>
        {name}
      </span>
    </>
  )
}

/** B 还没有报告（取消 / 失败 / 未开始）：A 报告仍在，给重试与移除 */
function PendingB({
  A,
  B,
  onRetry,
  onRemove,
}: {
  A: SlotView
  B: SlotView
  onRetry: () => void
  onRemove: () => void
}) {
  const failed = !!B.error
  return (
    <div className="px-5 pb-6 pt-6">
      <p className="kicker">两地对比</p>
      <div className="mt-3 flex items-start gap-2">
        <SlotChip slot="A" size={18} />
        <p className="min-w-0 break-words text-sm font-medium">{slotName(A.report, 40)}</p>
      </div>
      <div className="mt-2 flex items-start gap-2">
        <SlotChip slot="B" size={18} />
        <p className="min-w-0 break-words text-sm text-[var(--ink-2)]">
          {B.label ?? '对比地点'}
          <span
            className="ml-1.5 text-xs"
            style={{ color: failed ? 'var(--vermilion)' : 'var(--ink-3)' }}
          >
            {failed ? '· 分析失败' : '· 未完成'}
          </span>
        </p>
      </div>
      {failed && (
        <p className="mt-3 border-l-2 border-[var(--vermilion)] pl-3 text-xs leading-5 text-[var(--ink-2)]">
          {B.error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary !min-h-9 text-xs" onClick={onRetry}>
          {failed ? '重试 B' : '继续分析 B'}
        </button>
        <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={onRemove}>
          <Icon name="x" size={14} />
          移除对比，回到 A
        </button>
      </div>
    </div>
  )
}
