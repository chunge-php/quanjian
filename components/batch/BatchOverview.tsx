import type { BatchArea, BatchPointSummary } from '@/lib/types'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { areaName, areaSpec, scoreStats } from '@/components/batch/batchGeo'
import { gradeOf } from '@/lib/ui/batchExplain'

interface Props {
  area: BatchArea | null
  areaKm2: number | null
  points: BatchPointSummary[]
  /** 计划点数（进行中可能大于已完成数） */
  planned: number
  failed: number
  running: boolean
  /** 打印用：更紧凑 */
  print?: boolean
}

/** 首屏：范围名 + 面积 + 点数 + 平均分大数字 + 最高 / 最低 + 评级分布条 */
export default function BatchOverview({
  area,
  areaKm2,
  points,
  planned,
  failed,
  running,
  print,
}: Props) {
  const st = scoreStats(points)
  const grade = st ? gradeOf(st.avg) : null
  const dist = { A: 0, B: 0, C: 0, D: 0 }
  for (const p of points) dist[p.overallGrade]++
  return (
    <div data-testid="batch-overview">
      <p className="kicker">街道级 · {area ? areaSpec(area) : '范围'}</p>
      <h2
        className={`mt-0.5 break-words font-semibold leading-tight ${print ? 'text-[18px]' : 'text-lg'}`}
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {area ? areaName(area) : '街道体检'}
      </h2>
      <div className="mt-3 flex items-end gap-4">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`figure font-semibold leading-none ${print ? 'text-[44px]' : 'text-5xl'}`}
            style={{ color: grade ? GRADE_COLOR[grade] : 'var(--ink-3)' }}
            data-testid="batch-avg"
          >
            {st ? st.avg : '—'}
          </span>
          <span className="text-xs text-[var(--ink-2)]">
            <span className="block">平均分</span>
            {grade && (
              <span className="font-medium" style={{ color: GRADE_COLOR[grade] }}>
                {grade} · {GRADE_LABEL[grade]}
              </span>
            )}
          </span>
        </div>
        <dl className="figure grid flex-1 grid-cols-3 gap-x-2 text-[11px] leading-4 text-[var(--ink-3)]">
          <div>
            <dt>面积</dt>
            <dd className="text-sm text-[var(--ink)]">
              {areaKm2 != null ? `${areaKm2.toFixed(2)} km²` : '—'}
            </dd>
          </div>
          <div>
            <dt>点数</dt>
            <dd className="text-sm text-[var(--ink)]">
              {points.length}
              {running && planned > points.length ? ` / ${planned}` : ''}
              {failed ? <span className="ml-1 text-[var(--vermilion)]">×{failed}</span> : null}
            </dd>
          </div>
          <div>
            <dt>最高 / 最低</dt>
            <dd className="text-sm text-[var(--ink)]">{st ? `${st.max} / ${st.min}` : '—'}</dd>
          </div>
        </dl>
      </div>
      {points.length > 0 && (
        <div className="mt-3">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--paper-3)]"
            aria-hidden="true"
          >
            {(['A', 'B', 'C', 'D'] as const).map((g) =>
              dist[g] ? (
                <span
                  key={g}
                  style={{
                    width: `${(dist[g] / points.length) * 100}%`,
                    background: GRADE_COLOR[g],
                  }}
                />
              ) : null
            )}
          </div>
          <p className="figure mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--ink-2)]">
            {(['A', 'B', 'C', 'D'] as const).map((g) => (
              <span key={g}>
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: GRADE_COLOR[g] }}
                />
                {GRADE_LABEL[g]} {dist[g]}
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
