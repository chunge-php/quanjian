'use client'
import type { AnalyzeStage } from '@/lib/types'
const SHORT: Record<AnalyzeStage, string> = {
  geocode: '定位',
  sampling: '采样',
  routing: '算路',
  isochrone: '等时圈',
  poi_search: '设施检索',
  poi_routing: '设施算路',
  scoring: '评分',
  blindspot: '盲区',
  done: '完成',
}

const ORDER: AnalyzeStage[] = [
  'geocode',
  'sampling',
  'routing',
  'isochrone',
  'poi_search',
  'poi_routing',
  'scoring',
  'blindspot',
]

interface Props {
  stage: AnalyzeStage | null
  progress: number
  message: string
  onCancel: () => void
}

/** 分析进度：贴在地图左下，像图纸角落的施工日志，不遮挡地图主体 */
export default function ProgressOverlay({ stage, progress, message, onCancel }: Props) {
  const idx = stage ? ORDER.indexOf(stage) : -1
  return (
    <div
      className="panel map-ui no-print rise-in absolute bottom-4 left-3 right-3 z-[var(--z-overlay)] border border-[var(--line-strong)] bg-[var(--paper)] md:left-4 md:right-auto md:w-[22rem]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="分析进度"
    >
      <div className="progress-track">
        <div
          className="progress-bar"
          style={{ transform: `scaleX(${Math.max(0.03, progress)})` }}
        />
      </div>
      <div className="flex items-start gap-3 px-3.5 pb-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="kicker">分析中</span>
            <span className="figure text-xs text-[var(--ink-3)]">
              {Math.round(progress * 100)}%
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm font-medium">{message || '准备中…'}</p>
          <ol className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1 whitespace-nowrap text-[0.6875rem] leading-tight text-[var(--ink-3)]">
            {ORDER.map((s, i) => {
              const state = i < idx ? 'done' : i === idx ? 'active' : 'todo'
              return (
                <li key={s} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 ${
                      state === 'done'
                        ? 'bg-[var(--teal)]'
                        : state === 'active'
                          ? 'blink bg-[var(--vermilion)]'
                          : 'border border-[var(--line-strong)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className={state === 'active' ? 'text-[var(--ink)]' : undefined}>
                    {SHORT[s]}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
        <button type="button" className="btn btn-ghost !min-h-8 !px-2 text-xs" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
