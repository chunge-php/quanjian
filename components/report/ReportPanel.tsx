'use client'
import type { HealthReport } from '@/lib/types'
import { Icon } from '@/components/Icon'
import SectionHead from '@/components/report/SectionHead'
import ScoreHeader from '@/components/report/ScoreHeader'
import RadarChart from '@/components/report/RadarChart'
import WalkBarChart from '@/components/report/WalkBarChart'
import EssentialCards from '@/components/report/EssentialCards'
import BlindSpotSummary from '@/components/report/BlindSpotSummary'
import Suggestions from '@/components/report/Suggestions'
import IsochroneStats from '@/components/report/IsochroneStats'
import ApiStatsDetails from '@/components/report/ApiStatsDetails'
import TitleBlock from '@/components/report/TitleBlock'

interface Props {
  report: HealthReport
  printing: boolean
  onPrint: () => void
  onRerun: () => void
}

/** 报告面板：图纸式分节，首屏评分 → 图表 → 硬指标 → 盲区 → 建议 → 圈指标 → API 明细 → 图签 */
export default function ReportPanel({ report, printing, onPrint, onRerun }: Props) {
  return (
    <article className="relative pb-6">
      <span className="sheet-corner left-2 top-2 hidden md:block" aria-hidden="true" />
      <span className="sheet-corner right-2 top-2 hidden md:block" aria-hidden="true" />

      <ScoreHeader report={report} />

      {report.warnings.length > 0 && (
        <ul className="mx-5 mb-4 space-y-1 border-l-2 border-[var(--ochre)] pl-3 text-xs text-[var(--ink-2)]">
          {report.warnings.map((w, i) => (
            <li key={i} className="break-words">
              {w}
            </li>
          ))}
        </ul>
      )}

      <div className="no-print mx-5 mb-2 flex gap-2">
        <button type="button" className="btn !min-h-9 text-xs" onClick={onPrint}>
          <Icon name="printer" size={14} />
          导出 PDF
        </button>
        <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={onRerun}>
          重新分析
        </button>
      </div>

      <section className="print-avoid px-5 pt-4">
        <SectionHead no="02" title="十类设施覆盖" note="雷达 · 满分 100" />
        <RadarChart categories={report.categories} />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="03" title="最近步行分钟" note="朱砂线 = 15 分钟" />
        <WalkBarChart categories={report.categories} />
      </section>

      <section className="print-avoid px-5 pt-5">
        <SectionHead no="04" title="硬指标" note="缺一项即盲区" />
        <EssentialCards categories={report.categories} />
      </section>

      <section className="print-avoid px-5 pt-6">
        <SectionHead no="05" title="服务盲区" note="200 m 网格 · 1 公里内" />
        <BlindSpotSummary cells={report.blindSpots} />
      </section>

      <section className="print-avoid px-5 pt-6">
        <SectionHead no="06" title="规划建议" note={`${report.suggestions.length} 条`} />
        <Suggestions items={report.suggestions} />
      </section>

      <section className="print-avoid px-5 pt-6">
        <SectionHead
          no="07"
          title="等时圈"
          note={`${report.isochrone.reachRadiusByBearing.length} 方向`}
        />
        <IsochroneStats iso={report.isochrone} />
      </section>

      <section className="print-avoid px-5 pt-6">
        <ApiStatsDetails stats={report.apiStats} forceOpen={printing} />
      </section>

      <section className="print-avoid px-5 pt-6">
        <TitleBlock report={report} />
      </section>
    </article>
  )
}
