'use client'
import type { Slot } from '@/lib/ui/compare'
import { SLOT_COLOR } from '@/lib/ui/compare'

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
      <div className="panel inline-flex border border-[var(--ink)] bg-[var(--paper)] p-0.5">
        {items.map((it) => {
          const on = it.slot === focus
          return (
            <button
              key={it.slot}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(it.slot)}
              className={`flex max-w-[11rem] items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-left text-xs transition-colors duration-150 ${
                on
                  ? 'bg-[var(--ink)] text-[var(--paper)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
              }`}
              title={`地图显示 ${it.slot} 的设施与盲区`}
            >
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--paper)]"
                style={{ background: SLOT_COLOR[it.slot] }}
              >
                {it.slot}
              </span>
              <span className="truncate">{it.name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1 inline-block rounded-[6px] bg-[var(--paper)]/90 px-1.5 py-0.5 text-[11px] leading-4 text-[var(--ink-2)]">
        两个圈同屏，设施与盲区只看选中的一边；点地图 = 重设这一边的中心点
      </p>
    </div>
  )
}
