'use client'
import { useState } from 'react'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import { CategoryIcon, Icon } from '@/components/Icon'
import { blindSpotColor } from '@/lib/ui/theme'

/** 图例：固定在地图右下（桌面）/ 左下（移动端折叠），像地形图右下角的图例栏 */
export default function MapLegend({
  hasBlindSpots,
  rightInset,
}: {
  hasBlindSpots: boolean
  rightInset: number
}) {
  const [open, setOpen] = useState(true)
  return (
    <div
      className="map-ui no-print absolute bottom-4 left-3 z-[var(--z-map-ui)] md:left-auto"
      style={{ right: rightInset ? rightInset + 16 : undefined }}
    >
      <button
        type="button"
        className="btn !min-h-8 gap-1.5 !px-2.5 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="map-legend"
      >
        <Icon name="layers" size={14} />
        图例
        <Icon
          name="chevronDown"
          size={12}
          className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
        />
      </button>
      {open && (
        <div
          id="map-legend"
          className="panel rise-in mt-1 w-[16.5rem] border border-[var(--line-strong)] bg-[var(--paper)] px-3.5 py-3 text-[0.8125rem] leading-5"
        >
          <p className="kicker mb-1.5">步行等时圈</p>
          <div className="flex items-center gap-2">
            <span className="relative inline-block h-5 w-14" aria-hidden="true">
              <span
                className="absolute inset-0 border border-[var(--teal)]"
                style={{ background: 'rgba(31,110,106,0.1)' }}
              />
              <span
                className="absolute inset-y-[3px] left-[9px] right-[9px] border border-[var(--teal)]/70"
                style={{ background: 'rgba(31,110,106,0.18)' }}
              />
              <span
                className="absolute inset-y-[6px] left-[19px] right-[19px] border border-[var(--teal)]/70"
                style={{ background: 'rgba(31,110,106,0.3)' }}
              />
            </span>
            <span className="figure text-[var(--ink)]">15′ · 10′ · 5′</span>
          </div>
          {hasBlindSpots && (
            <>
              <p className="kicker mb-1.5 mt-2.5">服务盲区（缺硬指标）</p>
              <div className="flex items-center gap-1.5">
                {[1 / 3, 2 / 3, 1].map((s) => (
                  <span
                    key={s}
                    className="inline-block h-4 w-6 rounded-[3px]"
                    style={{ background: blindSpotColor(s), opacity: 0.35 + s * 0.45 }}
                    aria-hidden="true"
                  />
                ))}
                <span className="ml-1 text-[var(--ink)]">缺 1 → 3 类</span>
              </div>
            </>
          )}
          <p className="kicker mb-1.5 mt-2.5">设施（方块深色 = 硬指标）</p>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
            {FACILITY_CATEGORIES.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5 text-[var(--ink)]">
                <span
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                    c.essential
                      ? 'border-[var(--vermilion)] bg-[var(--ink)] text-[var(--paper)]'
                      : 'border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]'
                  }`}
                >
                  <CategoryIcon category={c.key} size={10} />
                </span>
                {c.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--ink-2)]">圈外设施淡显；点设施看步行分钟</p>
        </div>
      )}
    </div>
  )
}
