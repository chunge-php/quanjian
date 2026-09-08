import type { HealthReport } from '@/lib/types'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import SourceBadge from '@/components/report/SourceBadge'

const CN_NO = ['一', '二', '三']

/** 首屏：地址 + 大数字评分（宋体）+ 评级图章 + 三条结论 */
export default function ScoreHeader({ report }: { report: HealthReport }) {
  const color = GRADE_COLOR[report.overallGrade]
  return (
    <section className="print-avoid px-5 pb-5 pt-4 md:pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="kicker">生活圈体检 · 中心点</p>
          <h1 className="mt-0.5 break-words text-base font-semibold leading-snug">
            {report.address.formatted || '未命名地点'}
          </h1>
          {(report.address.district || report.address.city) && (
            <p className="text-xs text-[var(--ink-3)]">
              {[report.address.city, report.address.district, report.address.street]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        <SourceBadge source={report.dataSource} />
      </div>

      <div className="mt-5 flex items-end gap-4">
        <div className="flex items-baseline gap-1.5">
          <span
            className="tnum text-[4.25rem] font-bold leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-serif)', color }}
          >
            {report.overallScore}
          </span>
          <span className="text-sm text-[var(--ink-3)]">/ 100</span>
        </div>
        <div className="mb-1.5 flex items-center gap-3">
          <span className="stamp text-xl" style={{ color }}>
            {report.overallGrade} · {GRADE_LABEL[report.overallGrade]}
          </span>
          <span className="text-xs leading-tight text-[var(--ink-3)]">
            硬指标 60%
            <br />
            加分项 40%
          </span>
        </div>
      </div>

      <ol className="mt-5 space-y-2">
        {report.headline.slice(0, 3).map((h, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
            <span
              className="shrink-0 font-semibold"
              style={{ fontFamily: 'var(--font-serif)', color }}
            >
              {CN_NO[i] ?? i + 1}
            </span>
            <span className="min-w-0 break-words text-[var(--ink)]">{h}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
