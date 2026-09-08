'use client'
import type { Poi } from '@/lib/types'
import { CategoryIcon, Icon } from '@/components/Icon'
import { CATEGORY_LABEL, ESSENTIAL_SET } from '@/lib/ui/theme'
import { fmtMeters, fmtSecToMin } from '@/lib/ui/format'

/** 点击 POI 后的信息条：名称 / 类别 / 步行分钟（无弹窗，贴在地图上沿） */
export default function PoiCard({ poi, onClose }: { poi: Poi; onClose: () => void }) {
  const min = fmtSecToMin(poi.walkSec)
  const essential = ESSENTIAL_SET.has(poi.category)
  return (
    <div className="map-ui no-print rise-in absolute left-3 right-3 top-[4.5rem] z-[var(--z-overlay)] border border-[var(--ink)] bg-[var(--paper)] md:left-4 md:right-auto md:top-auto md:bottom-4 md:w-[22rem]">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border ${
            essential
              ? 'border-[var(--vermilion)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-[var(--ink)] text-[var(--ink)]'
          }`}
        >
          <CategoryIcon category={poi.category} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="kicker">{CATEGORY_LABEL[poi.category]}</span>
            {essential && <span className="text-[0.6875rem] text-[var(--vermilion)]">硬指标</span>}
            {!poi.inIsochrone && (
              <span className="text-[0.6875rem] text-[var(--ink-3)]">15 分钟圈外</span>
            )}
          </div>
          <p className="break-words font-medium leading-snug">{poi.name}</p>
          {poi.address && (
            <p className="mt-0.5 truncate text-xs text-[var(--ink-3)]">{poi.address}</p>
          )}
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[var(--ink-3)]">步行</dt>
              <dd className="tnum">
                {min == null ? (
                  <span className="text-[var(--ink-3)]">未知</span>
                ) : (
                  <>
                    <span
                      className={`font-semibold ${min > 15 ? 'text-[var(--vermilion)]' : 'text-[var(--teal)]'}`}
                    >
                      {min}
                    </span>{' '}
                    分钟
                  </>
                )}
                {poi.walkSource === 'estimate' && (
                  <span className="ml-1 text-[0.6875rem] text-[var(--ink-3)]">估算</span>
                )}
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[var(--ink-3)]">路程</dt>
              <dd className="tnum">{fmtMeters(poi.walkM)}</dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="text-xs text-[var(--ink-3)]">直线</dt>
              <dd className="tnum">{fmtMeters(poi.straightM)}</dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon !min-h-8 !h-8 !w-8"
          aria-label="关闭设施信息"
          onClick={onClose}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  )
}
