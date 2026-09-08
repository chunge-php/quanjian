'use client'
import { Icon } from '@/components/Icon'

interface Props {
  canPrint: boolean
  showSamples: boolean
  onToggleSamples: () => void
  onPrint: () => void
  notice: string | null
  drawerOpen: boolean
  onToggleDrawer: () => void
  rightInset: number
}

/** 顶栏：品牌 + 工具按钮（贴右上，宽度自适应，不占满一行，让地图露出来） */
export default function TopBar({
  canPrint,
  showSamples,
  onToggleSamples,
  onPrint,
  notice,
  drawerOpen,
  onToggleDrawer,
  rightInset,
}: Props) {
  return (
    <>
      <div
        className="map-ui no-print pointer-events-none absolute top-3 z-[var(--z-map-ui)] hidden items-stretch gap-2 md:flex"
        style={{ right: rightInset + 12 }}
      >
        <div className="panel pointer-events-auto flex items-center border border-[var(--ink)] bg-[var(--paper)] px-3">
          <span
            className="font-serif text-lg font-bold tracking-[0.2em]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            圈见
          </span>
          <span className="ml-3 border-l border-[var(--line-strong)] pl-3 text-xs text-[var(--ink-2)]">
            15 分钟生活圈体检
          </span>
        </div>
        <label className="panel pointer-events-auto flex cursor-pointer select-none items-center gap-1.5 border border-[var(--line-strong)] bg-[var(--paper)] px-2.5 text-xs text-[var(--ink-2)]">
          <input
            type="checkbox"
            className="accent-[var(--teal)]"
            checked={showSamples}
            onChange={onToggleSamples}
          />
          采样点
        </label>
        <button
          type="button"
          className="pointer-events-auto btn"
          onClick={onPrint}
          disabled={!canPrint}
          title={canPrint ? '打印或另存为 PDF' : '完成分析后可导出'}
        >
          <Icon name="printer" size={16} />
          导出报告 PDF
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
