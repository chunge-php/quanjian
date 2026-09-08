'use client'
import type { BatchReport } from '@/lib/types'
import PrintFrame from '@/components/report/PrintFrame'
import SectionHead from '@/components/report/SectionHead'
import Suggestions from '@/components/report/Suggestions'
import BatchOverview from '@/components/batch/BatchOverview'
import BatchRankTable from '@/components/batch/BatchRankTable'
import BatchCoverageBars from '@/components/batch/BatchCoverageBars'
import BatchWorstCards from '@/components/batch/BatchWorstCards'
import {
  BatchCover,
  BatchHeaderLine,
  BatchStaticMap,
  BatchTitleBlock,
  Explain,
} from '@/components/batch/BatchPrintParts'
import {
  explainBatchConclusion,
  explainBatchCoverage,
  explainBatchMethod,
  explainBatchOverview,
  explainBatchRanking,
  explainBatchSuggestions,
  explainBatchWorst,
} from '@/lib/ui/batchExplain'

/**
 * 街道级 PDF（print-only）：封头 → 01 范围地图 → 02 平均分与分布 → 03 排名表 → 04 可达占比
 * → 05 最差三点 → 06 建议与结论 → 07 方法说明 → 图签。
 */
export default function BatchPrint({ report }: { report: BatchReport }) {
  const sec = 'print-avoid px-5 pt-5'
  return (
    <div className="print-only cmp-print" data-testid="batch-print">
      <PrintFrame header={<BatchHeaderLine report={report} />}>
        <article className="pb-0">
          <BatchCover report={report} />

          <section className="print-avoid px-5">
            <SectionHead no="01" title="范围与体检点" note="百度静态图 · 点色 = 评级" />
            <BatchStaticMap report={report} />
          </section>

          <section className={sec}>
            <SectionHead no="02" title="平均分与分布" note="各点简单平均" />
            <BatchOverview
              area={report.area}
              areaKm2={report.areaKm2}
              points={report.points}
              planned={report.points.length}
              failed={0}
              running={false}
              print
            />
            <Explain>{explainBatchOverview(report)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="03" title="点位排名" note="分数降序 · 红字超 15 分钟" />
            <BatchRankTable points={report.points} print />
            <Explain>{explainBatchRanking(report)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="04" title="15 分钟可达点位占比" note="十类 · 红字硬指标" />
            <BatchCoverageBars coverage={report.coverageByCategory} print />
            <Explain>{explainBatchCoverage(report)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="05" title="最差三点" note="各一行硬指标分钟" />
            <BatchWorstCards report={report} print />
            <Explain>{explainBatchWorst(report)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="06" title="建议与结论" note={`${report.suggestions.length} 条建议`} />
            <Suggestions items={report.suggestions} />
            <Explain>{explainBatchSuggestions(report)}</Explain>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] leading-5">
              {report.headline.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
            <Explain>{explainBatchConclusion(report)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="07" title="方法说明" note="可复现" />
            <p className="text-[11.5px] leading-5 text-[var(--ink-2)]">
              {explainBatchMethod(report)}
            </p>
            {report.warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5 border-l-2 border-[var(--ochre)] pl-3 text-[11px] text-[var(--ink-2)]">
                {report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <BatchTitleBlock report={report} />
            </div>
          </section>
        </article>
      </PrintFrame>
    </div>
  )
}
