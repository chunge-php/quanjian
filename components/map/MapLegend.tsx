'use client'
import { useState } from 'react'
import type { FacilityCategory } from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import { CategoryIcon, Icon } from '@/components/Icon'
import { blindSpotColor } from '@/lib/ui/theme'
import { isCategoryOn, isOnlyEssential, type LayerFilter } from '@/lib/ui/layerFilter'

interface Props {
  hasBlindSpots: boolean
  hasPois: boolean
  rightInset: number
  filter: LayerFilter
  counts: Record<FacilityCategory, { inIso: number; total: number }>
  onToggleCategory: (key: FacilityCategory) => void
  onAllCategories: () => void
  onOnlyEssential: () => void
  onToggleLayer: (key: 'showIsochrone' | 'showBlindSpots' | 'onlyInIsochrone') => void
}

/**
 * 图例兼图层筛选：固定在地图右下（桌面）/ 左下（移动端折叠）。
 * 每一行都能点：类别单击 = 只看这一类，再点其他类可多选；等时圈 / 盲区两层可整体开关。
 */
export default function MapLegend(p: Props) {
  const [open, setOpen] = useState(true)
  const allOn = p.filter.categories === null
  const essentialOn = isOnlyEssential(p.filter)
  const filtering = !allOn || p.filter.onlyInIsochrone

  return (
    <div
      className="map-ui no-print absolute bottom-4 left-3 z-[var(--z-map-ui)] md:left-auto"
      style={{ right: p.rightInset ? p.rightInset + 16 : undefined }}
    >
      <button
        type="button"
        className="btn !min-h-8 gap-1.5 !px-2.5 text-xs"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="map-legend"
      >
        <Icon name="layers" size={14} />
        图例{filtering ? ' · 筛选中' : ''}
        <Icon
          name="chevronDown"
          size={12}
          className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
        />
      </button>
      {open && (
        <div
          id="map-legend"
          className="panel rise-in mt-1 w-[19rem] border border-[var(--line-strong)] bg-[var(--paper)] px-3.5 py-3 text-[0.8125rem] leading-5"
        >
          <LayerRow
            on={p.filter.showIsochrone}
            label="步行等时圈"
            onClick={() => p.onToggleLayer('showIsochrone')}
          >
            <span className="relative inline-block h-5 w-14" aria-hidden="true">
              <span
                className="absolute inset-0 rounded-[3px] border border-[var(--teal)]"
                style={{ background: 'rgba(31,110,106,0.1)' }}
              />
              <span
                className="absolute inset-y-[3px] left-[9px] right-[9px] rounded-[2px] border border-[var(--teal)]/70"
                style={{ background: 'rgba(31,110,106,0.18)' }}
              />
              <span
                className="absolute inset-y-[6px] left-[19px] right-[19px] rounded-[2px] border border-[var(--teal)]/70"
                style={{ background: 'rgba(31,110,106,0.3)' }}
              />
            </span>
            <span className="figure text-[var(--ink)]">15′ · 10′ · 5′</span>
          </LayerRow>

          {p.hasBlindSpots && (
            <LayerRow
              on={p.filter.showBlindSpots}
              label="服务盲区（缺硬指标）"
              onClick={() => p.onToggleLayer('showBlindSpots')}
            >
              {[1 / 3, 2 / 3, 1].map((s) => (
                <span
                  key={s}
                  className="inline-block h-4 w-6 rounded-[3px]"
                  style={{ background: blindSpotColor(s), opacity: 0.35 + s * 0.45 }}
                  aria-hidden="true"
                />
              ))}
              <span className="ml-1 text-[var(--ink)]">缺 1 → 3 类</span>
            </LayerRow>
          )}

          <div className="mb-1.5 mt-2.5 flex items-center justify-between">
            <p className="kicker">设施（深色 = 硬指标）</p>
            {p.hasPois && (
              <span className="flex gap-1">
                <Chip on={allOn} onClick={p.onAllCategories}>
                  全部
                </Chip>
                <Chip on={essentialOn} onClick={p.onOnlyEssential}>
                  只看硬指标
                </Chip>
              </span>
            )}
          </div>
          <ul
            className="grid grid-cols-2 gap-x-2 gap-y-0.5"
            role="group"
            aria-label="按类别筛选设施"
          >
            {FACILITY_CATEGORIES.map((c) => {
              const on = isCategoryOn(p.filter, c.key)
              const n = p.counts[c.key]
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-150 hover:bg-[var(--paper-2)] ${
                      on
                        ? 'text-[var(--ink)]'
                        : 'text-[var(--ink-3)] line-through decoration-[var(--line-strong)]'
                    }`}
                    aria-pressed={on}
                    onClick={() => p.onToggleCategory(c.key)}
                    title={allOn ? `只看${c.label}` : on ? `隐藏${c.label}` : `显示${c.label}`}
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                        c.essential
                          ? 'border-[var(--vermilion)] bg-[var(--ink)] text-[var(--paper)]'
                          : 'border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]'
                      } ${on ? '' : 'opacity-40'}`}
                    >
                      <CategoryIcon category={c.key} size={10} />
                    </span>
                    <span className="flex-1 whitespace-nowrap">{c.label}</span>
                    {p.hasPois && (
                      <span
                        className="figure text-[11px] text-[var(--ink-3)]"
                        aria-label={`圈内 ${n.inIso} 处，共 ${n.total} 处`}
                      >
                        {n.inIso}/{n.total}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {p.hasPois && (
            <label className="mt-2 flex cursor-pointer select-none items-center gap-1.5 text-xs text-[var(--ink-2)]">
              <input
                type="checkbox"
                className="accent-[var(--teal)]"
                checked={p.filter.onlyInIsochrone}
                onChange={() => p.onToggleLayer('onlyInIsochrone')}
              />
              只看 15 分钟圈内的设施
            </label>
          )}
          <p className="mt-2 text-xs text-[var(--ink-2)]">
            点类别只看该类，可多选；圈外设施淡显；点设施看步行分钟
          </p>
        </div>
      )}
    </div>
  )
}

function LayerRow({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`-mx-1 mb-1 flex w-[calc(100%+0.5rem)] flex-col items-start rounded-[6px] px-1 py-1 text-left transition-colors duration-150 hover:bg-[var(--paper-2)] ${
        on ? '' : 'opacity-50'
      }`}
      aria-pressed={on}
      onClick={onClick}
      title={on ? `隐藏${label}` : `显示${label}`}
    >
      <span className="kicker mb-1 flex w-full items-center justify-between">
        {label}
        <span className="normal-case tracking-normal">{on ? '显示' : '已隐藏'}</span>
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </button>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={`whitespace-nowrap rounded-full border px-2 py-[1px] text-[11px] leading-4 transition-colors duration-150 ${
        on
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
          : 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
      }`}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
