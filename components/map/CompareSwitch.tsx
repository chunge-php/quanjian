'use client'
import type { Slot } from '@/lib/ui/compare'
import { SLOT_COLOR } from '@/lib/ui/compare'
import { Icon } from '@/components/Icon'

interface Props {
  focus: Slot
  nameA: string
  nameB: string
  runningB: boolean
  onChange: (s: Slot) => void
  /** 顶部偏移（搜索框下方；有提示条时再往下） */
  top: string
}

/**
 * 地图左上 A / B 分段控件：只切换"设施与盲区显示哪一边"，两个等时圈始终同屏。
 * 选中态 = 墨底纸字 + 槽位色左肩，不靠颜色深浅猜。
 */
export default function CompareSwitch({ focus, nameA, nameB, runningB, onChange, top }: Props) {
  const items: { slot: Slot; name: string }[] = [
    { slot: 'A', name: nameA },
    { slot: 'B', name: runningB ? '分析中…' : nameB },
  ]
  return (
    <div
      className="map-ui no-print rise-in absolute left-3 z-[var(--z-map-ui)] md:left-4"
      style={{ top }}
      role="group"
      aria-label="地图上显示哪一边的设施与盲区"
    >
      <div className="panel compare-switch inline-flex items-stretch border-2 border-[var(--ink)] bg-[var(--paper)]">
        <span className="hidden items-center gap-1 border-r border-[var(--line-strong)] bg-[var(--paper-2)] px-2.5 text-xs text-[var(--ink-2)] sm:inline-flex">
          <Icon name="layers" size={13} />
          地图看
        </span>
        <div className="flex p-1">
          {items.map((it) => {
            const on = it.slot === focus
            return (
              <button
                key={it.slot}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(it.slot)}
                className={`flex min-h-9 max-w-[12rem] items-center gap-2 rounded-[6px] px-3 text-left text-sm transition-colors duration-150 ${
                  on
                    ? 'font-medium text-[var(--paper)]'
                    : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
                }`}
                style={on ? { background: SLOT_COLOR[it.slot] } : undefined}
                title={
                  on
                    ? `地图正在聚焦 ${it.slot}`
                    : `点一下切到 ${it.slot}：这一边的设施实色、盲区可见`
                }
              >
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    on ? 'bg-[var(--paper)]' : 'text-[var(--paper)]'
                  }`}
                  style={on ? { color: SLOT_COLOR[it.slot] } : { background: SLOT_COLOR[it.slot] }}
                >
                  {it.slot}
                </span>
                <span className="truncate">{it.name}</span>
                {!on && <Icon name="swap" size={12} className="shrink-0 opacity-60" />}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-1 inline-block max-w-[22rem] rounded-[6px] bg-[var(--paper)]/90 px-1.5 py-0.5 text-[11px] leading-4 text-[var(--ink-2)]">
        点 A / B 切换地图聚焦：聚焦的一边设施实色、盲区可见，另一边压淡带角标（点它也能切）
      </p>
    </div>
  )
}
