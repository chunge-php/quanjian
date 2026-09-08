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
  hasIsochrone: boolean
  /** 地图上有拟建设施（模拟）时加一行说明 */
  hasVirtuals: boolean
  /** 对比模式：等时圈行显示 A 青 / B 赭 两个色样 */
  compare: boolean
  /** 街道体检模式：只显示评级色圆标说明，隐藏设施筛选区 */
  batch?: boolean
  showSamples: boolean
  onToggleSamples: () => void
  rightInset: number
  /** 移动端底部抽屉当前占用高度（px），图例贴在抽屉上方不被盖住 */
  bottomInset?: number
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
  // 手机默认收起（展开会占满地图区），桌面默认展开
  const [open, setOpen] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  )
  const allOn = p.filter.categories === null
  const essentialOn = isOnlyEssential(p.filter)
  const filtering = !allOn || p.filter.onlyInIsochrone

  return (
    <div
      className="map-ui no-print absolute left-3 z-[var(--z-map-ui)] md:left-auto"
      style={{
        right: p.rightInset ? p.rightInset + 16 : undefined,
        // 手机：抽屉顶边之上 12px；桌面：固定 16px（抽屉在右侧不遮）
        bottom: p.bottomInset ? p.bottomInset + 12 : 16,
      }}
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
          className="panel rise-in mt-1 max-h-[32vh] w-[19rem] overflow-auto md:max-h-none scroll-thin border border-[var(--line-strong)] bg-[var(--paper)] px-3.5 py-3 text-[0.8125rem] leading-5"
        >
          {p.batch ? (
            <BatchLegend />
          ) : (
            <>
              <LayerRow
                on={p.filter.showIsochrone}
                label="步行等时圈"
                onClick={() => p.onToggleLayer('showIsochrone')}
              >
                <RingSwatch color="var(--teal)" rgb="31,110,106" />
                {p.compare ? (
                  <>
                    <span className="figure text-[var(--teal)]">A</span>
                    <RingSwatch color="var(--ochre)" rgb="176,128,31" dashed />
                    <span className="figure text-[var(--ochre)]">B</span>
                    <span className="text-[var(--ink-3)]">· 未聚焦的只画 15′ 外圈</span>
                  </>
                ) : (
                  <span className="figure text-[var(--ink)]">15′ · 10′ · 5′</span>
                )}
              </LayerRow>
              {p.hasIsochrone && <SampleToggle on={p.showSamples} onToggle={p.onToggleSamples} />}

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

              {p.hasVirtuals && (
                <div className="-mx-1 mb-1 rounded-[6px] px-1 py-1">
                  <span className="kicker mb-1 flex w-full items-center justify-between">
                    拟建设施（模拟）
                    <span className="normal-case tracking-normal">点标记可移除</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-dashed border-[var(--vermilion)] bg-[var(--paper)] text-[var(--vermilion)]"
                      aria-hidden="true"
                    >
                      <Icon name="pin" size={11} />
                    </span>
                    <span
                      className="inline-block h-5 w-9 rounded-full border border-dashed border-[var(--vermilion)] bg-[rgba(184,58,42,0.05)]"
                      aria-hidden="true"
                    />
                    <span className="text-[var(--ink)]">1 km 虚线圈 = 盲区判定半径</span>
                  </span>
                </div>
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
            </>
          )}
        </div>
      )}
    </div>
  )
}

const BATCH_GRADES: { g: 'A' | 'B' | 'C' | 'D'; color: string; text: string }[] = [
  { g: 'A', color: 'var(--teal)', text: '优 ≥85' },
  { g: 'B', color: 'var(--moss)', text: '良 70–84' },
  { g: 'C', color: 'var(--ochre)', text: '中 50–69' },
  { g: 'D', color: 'var(--vermilion)', text: '差 <50' },
]

/** 街道体检行：评级色圆标说明（圆标直径随分数 18–28px，中间是分数） */
function BatchLegend() {
  return (
    <div data-testid="legend-batch">
      <p className="kicker mb-1.5 flex w-full items-center justify-between">
        街道体检 · 网格点
        <span className="normal-case tracking-normal">圆越大分越高</span>
      </p>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {BATCH_GRADES.map(({ g, color, text }) => (
          <li key={g} className="flex items-center gap-1.5">
            <span
              className="figure inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--paper)] text-[10px] font-bold"
              style={{ borderColor: color, color }}
              aria-hidden="true"
            >
              {g}
            </span>
            <span className="text-[var(--ink)]">{text}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border border-dashed border-[var(--ink-3)] bg-[var(--paper)]"
            aria-hidden="true"
          />
          <span className="text-[var(--ink-2)]">待体检</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--vermilion)] text-[10px] leading-none text-[var(--vermilion)]"
            aria-hidden="true"
          >
            ×
          </span>
          <span className="text-[var(--ink-2)]">失败</span>
        </li>
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--ink-2)]">
        <span
          className="inline-block h-4 w-8 rounded-[3px] border border-dashed border-[var(--ink)]"
          aria-hidden="true"
        />
        墨色虚线 = 体检范围；悬停看地址与分数，点圆标看该点完整报告
      </p>
    </div>
  )
}

function RingSwatch({ color, rgb, dashed }: { color: string; rgb: string; dashed?: boolean }) {
  const border = dashed ? 'border-dashed' : ''
  return (
    <span className="relative inline-block h-5 w-14" aria-hidden="true">
      <span
        className={`absolute inset-0 rounded-[3px] border ${border}`}
        style={{ borderColor: color, background: `rgba(${rgb},0.1)` }}
      />
      {!dashed && (
        <>
          <span
            className="absolute inset-y-[3px] left-[9px] right-[9px] rounded-[2px] border"
            style={{ borderColor: color, background: `rgba(${rgb},0.18)` }}
          />
          <span
            className="absolute inset-y-[6px] left-[19px] right-[19px] rounded-[2px] border"
            style={{ borderColor: color, background: `rgba(${rgb},0.3)` }}
          />
        </>
      )}
    </span>
  )
}

/** 采样点小开关：挂在等时圈行下面，(?) 展开一段解释，文字换行不截断 */
function SampleToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const [tip, setTip] = useState(false)
  return (
    <div className="relative -mt-0.5 mb-1.5 flex items-center gap-1.5 pl-1 text-xs text-[var(--ink-2)]">
      <label className="flex cursor-pointer select-none items-center gap-1.5">
        <input type="checkbox" className="accent-[var(--teal)]" checked={on} onChange={onToggle} />
        采样点
      </label>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="inline-block rounded-full"
            style={{
              width: 5 + i,
              height: 5 + i,
              background: ['#7fc9c3', '#3fa39c', '#0e8c84', '#0b6660', '#083f3c'][i],
            }}
          />
        ))}
      </span>
      <button
        type="button"
        className={`ml-auto inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] leading-none transition-colors duration-150 ${
          tip
            ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
            : 'border-[var(--line-strong)] text-[var(--ink-3)] hover:border-[var(--ink)] hover:text-[var(--ink)]'
        }`}
        aria-label="采样点是什么"
        aria-expanded={tip}
        aria-controls="sample-tip"
        onClick={() => setTip((v) => !v)}
        onBlur={() => setTip(false)}
      >
        ?
      </button>
      {tip && (
        <p
          id="sample-tip"
          role="tooltip"
          className="panel rise-in absolute bottom-full right-0 z-10 mb-1.5 w-[17rem] border border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-xs leading-5 text-[var(--ink)]"
        >
          算等时圈用的 112 个探测点，颜色深浅 = 步行分钟（浅 ≤5′ → 深 &gt;20′，朱砂 =
          不可达），用来核对圈的形状。
        </p>
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
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
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
