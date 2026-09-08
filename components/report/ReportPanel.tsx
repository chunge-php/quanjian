'use client'
import type { FacilityCategory, HealthReport } from '@/lib/types'
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
import MapSnapshot from '@/components/report/MapSnapshot'
import PrintGuide, { PrintNote } from '@/components/report/PrintNotes'
import PrintChrome, { PrintHeaderLine } from '@/components/report/PrintChrome'
import PrintFrame from '@/components/report/PrintFrame'
import { PrintCategoryTable, PrintMethod, PrintPoiList } from '@/components/report/PrintDetails'
import { formatMinutes } from '@/lib/report/format'
import { explainRadar, explainWalkBars } from '@/lib/report/explain'

interface Props {
  report: HealthReport
  printing: boolean
  onPrint: () => void
  onRerun: () => void
  /** 单点模式：发起「和另一个地点对比」；对比模式下不传 */
  onCompare?: () => void
  /** 「模拟新建」入口（移动端顶栏不显示，靠这里进）；带类别 = 建议旁「去模拟」 */
  onSimulate?: (category?: FacilityCategory) => void
  /** 打印封头标签（对比模式："地点 A"） */
  printLabel?: string
}

/** 报告面板：图纸式分节，首屏评分 → 图表 → 硬指标 → 盲区 → 建议 → 圈指标 → API 明细 → 图签 */
export default function ReportPanel({
  report,
  printing,
  onPrint,
  onRerun,
  onCompare,
  onSimulate,
  printLabel,
}: Props) {
  return (
    <PrintFrame header={<PrintHeaderLine report={report} label={printLabel} />}>
      <article className="relative pb-6">
        <span className="sheet-corner left-2 top-2 hidden md:block" aria-hidden="true" />
        <span className="sheet-corner right-2 top-2 hidden md:block" aria-hidden="true" />

        <PrintChrome report={report} label={printLabel} />
        <section className="print-only print-avoid px-5">
          <SectionHead no="01" title="地图与等时圈" note="百度静态图 · 圈内硬指标设施" />
          <MapSnapshot report={report} />
        </section>
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

        <div className="no-print mx-5 mb-2 flex flex-wrap gap-2">
          {onCompare && (
            <button type="button" className="btn btn-primary !min-h-9 text-xs" onClick={onCompare}>
              <Icon name="compare" size={14} />
              和另一个地点对比
            </button>
          )}
          {onSimulate && (
            <button type="button" className="btn !min-h-9 text-xs" onClick={() => onSimulate()}>
              <Icon name="pin" size={14} />
              模拟新建
            </button>
          )}
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
          <PrintNote>怎么看：{explainRadar(report)}</PrintNote>
        </section>

        <section className="print-avoid px-5 pt-5">
          <SectionHead no="03" title="最近步行分钟" note="朱砂线 = 15 分钟" />
          <WalkBarChart categories={report.categories} />
          <PrintNote>怎么看：{explainWalkBars(report)}</PrintNote>
        </section>

        <section className="print-avoid px-5 pt-5">
          <SectionHead no="04" title="硬指标" note="缺一项即盲区" />
          <EssentialCards categories={report.categories} />
          <PrintNote>{essentialSummary(report)}</PrintNote>
        </section>

        <section className="print-avoid px-5 pt-6">
          <SectionHead no="05" title="服务盲区" note="200 m 网格 · 1 公里内" />
          <BlindSpotSummary cells={report.blindSpots} />
          <PrintNote>
            怎么看：把中心点周边 1.5 公里切成 200 米的小方格，每格看 1
            公里内有没有菜市场、药店、小学，缺一样就算盲区。 「圈内盲区」是 15
            分钟能走到却仍然缺设施的格子，最该优先补；圈外的格子影响的是邻近社区。
            {report.blindSpots.length === 0 && ' 本次周边 1.5 公里内没有盲区，三项硬指标覆盖完整。'}
          </PrintNote>
        </section>

        <section className="print-avoid px-5 pt-6">
          <SectionHead no="06" title="规划建议" note={`${report.suggestions.length} 条`} />
          <Suggestions items={report.suggestions} onSimulate={onSimulate} />
        </section>

        <section className="print-avoid px-5 pt-6">
          <SectionHead
            no="07"
            title="等时圈"
            note={`${report.isochrone.reachRadiusByBearing.length} 方向`}
          />
          <MapSnapshot report={report} className="no-print mb-3" />
          <IsochroneStats iso={report.isochrone} />
          <PrintNote>
            怎么看：三个数字是 5、10、15 分钟各能覆盖多大面积；「等效半径」是把 15
            分钟圈换算成同面积圆的半径； 「圆度」越接近 1
            说明各方向都走得开，越低说明有方向被河流、铁路或大路挡住。右侧玫瑰图是 16
            个方向各自能走多远。
          </PrintNote>
        </section>

        <section className="print-avoid px-5 pt-6">
          <ApiStatsDetails stats={report.apiStats} forceOpen={printing} />
        </section>

        <PrintGuide report={report} />
        <PrintCategoryTable report={report} />
        <PrintPoiList report={report} />
        <PrintMethod report={report} />

        <section className="print-avoid px-5 pt-6">
          <TitleBlock report={report} />
        </section>
      </article>
    </PrintFrame>
  )
}

/** 硬指标一段直白总结（打印用） */
function essentialSummary(report: HealthReport): string {
  const ess = report.categories.filter((c) => c.essential)
  const ok = ess.filter((c) => c.countWithin1km > 0)
  const missing = ess.filter((c) => c.countWithin1km === 0)
  const parts = ok.map(
    (c) => `${c.label}最近是「${c.nearest?.name ?? '—'}」，步行 ${formatMinutes(c.nearestWalkMin)}`
  )
  const head =
    missing.length === 0
      ? '三项硬指标 1 公里内都有：'
      : `1 公里内缺 ${missing.map((c) => c.label).join('、')}，这就是最要紧的短板；其余：`
  return `${head}${parts.join('；')}。硬指标看的是「最近一处」，不看数量。`
}
