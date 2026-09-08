'use client'
import { Icon } from '@/components/Icon'
import type { SimulateMode } from '@/lib/ui/useSimulateWiring'
import type { BatchMode } from '@/components/batch/batchTypes'

export type CompareMode = 'off' | 'picking' | 'on'

const BATCH_LABEL: Record<BatchMode, string> = {
  off: '街道体检',
  setup: '选范围中…',
  running: '街道体检中…',
  done: '街道体检 · 已完成',
}
const BATCH_TITLE: Record<BatchMode, string> = {
  off: '在一条街 / 一片区域里布 9–25 个点逐个体检，汇总成街道级报告',
  setup: '正在选范围，再点一次退出街道体检',
  running: '体检进行中，可在左下面板里中止',
  done: '再点一次回到选范围，可调整范围重跑',
}

interface Props {
  canPrint: boolean
  /** 街道体检：单点分析进行中时不可发起 */
  canBatch: boolean
  batch: BatchMode
  onBatch: () => void
  /** 有报告才能发起对比 */
  canCompare: boolean
  compare: CompareMode
  onCompare: () => void
  /** 模拟新建：有报告才可用；关 / 开 / 放置中 三态 */
  canSimulate: boolean
  simulate: SimulateMode
  onSimulate: () => void
  onPrint: () => void
  notice: string | null
  drawerOpen: boolean
  onToggleDrawer: () => void
  rightInset: number
}

const COMPARE_LABEL: Record<CompareMode, string> = {
  off: '对比',
  picking: '选对比地点…',
  on: '换对比地点',
}

const SIMULATE_LABEL: Record<SimulateMode, string> = {
  off: '模拟新建',
  on: '模拟中',
  placing: '放置中…',
}
const SIMULATE_TITLE: Record<SimulateMode, string> = {
  off: '假如在这里新建一处菜市场 / 药店 / 小学，分数和盲区会怎样变',
  on: '模拟面板已打开，再点关闭',
  placing: '正在放置：在地图上点一下落设施，再点关闭模拟',
}

/** 顶栏：品牌 + 工具按钮（贴右上，宽度自适应，不占满一行，让地图露出来） */
export default function TopBar({
  canPrint,
  canBatch,
  batch,
  onBatch,
  canCompare,
  compare,
  onCompare,
  canSimulate,
  simulate,
  onSimulate,
  onPrint,
  notice,
  drawerOpen,
  onToggleDrawer,
  rightInset,
}: Props) {
  const compareActive = compare !== 'off'
  const simActive = simulate !== 'off'
  const batchActive = batch !== 'off'
  return (
    <>
      <div
        className="map-ui no-print pointer-events-none absolute top-3 z-[var(--z-map-ui)] hidden flex-wrap items-stretch justify-end gap-2 md:flex"
        style={{ right: rightInset + 12, left: 'calc(26rem + 2rem)' }}
      >
        <div className="panel pointer-events-auto flex items-center border border-[var(--ink)] bg-[var(--paper)] px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt="" width={22} height={22} className="mr-2" />
          <span
            className="font-serif text-lg font-bold tracking-[0.2em]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            圈见
          </span>
          <span
            className={`ml-3 border-l border-[var(--line-strong)] pl-3 text-xs text-[var(--ink-2)] ${
              compareActive || simActive || batchActive ? 'hidden 2xl:inline' : ''
            }`}
          >
            15 分钟生活圈体检
          </span>
        </div>
        <button
          type="button"
          className={`pointer-events-auto btn ${batchActive ? 'btn-primary' : ''} ${
            batch === 'setup' ? 'ring-2 ring-[var(--teal)] ring-offset-1' : ''
          }`}
          onClick={onBatch}
          disabled={!canBatch && !batchActive}
          aria-pressed={batchActive}
          title={canBatch || batchActive ? BATCH_TITLE[batch] : '单点分析完成后可发起街道体检'}
          data-testid="topbar-batch"
        >
          <Icon name="locate" size={16} />
          {BATCH_LABEL[batch]}
        </button>
        <button
          type="button"
          className={`pointer-events-auto btn ${compareActive ? 'btn-primary' : ''}`}
          onClick={onCompare}
          disabled={!canCompare}
          aria-pressed={compareActive}
          title={
            canCompare
              ? compare === 'on'
                ? '重新选一个对比地点'
                : '和另一个小区 / 地址比一比谁更宜居'
              : '完成一次体检后可对比'
          }
        >
          <Icon name="compare" size={16} />
          {COMPARE_LABEL[compare]}
        </button>
        <button
          type="button"
          className={`pointer-events-auto btn ${simActive ? 'btn-primary' : ''} ${
            simulate === 'placing' ? 'ring-2 ring-[var(--vermilion)] ring-offset-1' : ''
          }`}
          onClick={onSimulate}
          disabled={!canSimulate}
          aria-pressed={simActive}
          title={canSimulate ? SIMULATE_TITLE[simulate] : '完成一次体检后可模拟'}
        >
          <Icon name="pin" size={16} />
          {SIMULATE_LABEL[simulate]}
        </button>
        <button
          type="button"
          className="pointer-events-auto btn"
          onClick={onPrint}
          disabled={!canPrint}
          title={canPrint ? '打印或另存为 PDF' : '完成分析后可导出'}
        >
          <Icon name="printer" size={16} />
          导出 PDF
        </button>
        <button
          type="button"
          className="pointer-events-auto btn btn-icon"
          onClick={onToggleDrawer}
          aria-label={drawerOpen ? '收起报告' : '展开报告'}
          aria-pressed={drawerOpen}
        >
          <Icon
            name="chevronDown"
            size={16}
            className={`transition-transform duration-200 ${drawerOpen ? '-rotate-90' : 'rotate-90'}`}
          />
        </button>
      </div>
      {notice && (
        <div className="map-ui no-print absolute left-3 right-3 top-[3.75rem] z-[var(--z-map-ui)] md:left-4 md:top-[3.9rem] md:w-[26rem]">
          <p className="panel flex items-start gap-2 border border-[var(--ochre)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--ink-2)]">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-[var(--ochre)]" />
            <span>{notice}</span>
          </p>
        </div>
      )}
    </>
  )
}
