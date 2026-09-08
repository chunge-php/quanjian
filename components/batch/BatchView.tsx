'use client'
import type { BatchPointSummary } from '@/lib/types'
import type { BatchWiring } from '@/components/batch/useBatchWiring'
import { Icon } from '@/components/Icon'
import SectionHead from '@/components/report/SectionHead'
import Suggestions from '@/components/report/Suggestions'
import BatchOverview from '@/components/batch/BatchOverview'
import BatchRankTable from '@/components/batch/BatchRankTable'
import BatchCoverageBars from '@/components/batch/BatchCoverageBars'
import BatchWorstCards from '@/components/batch/BatchWorstCards'
import { ProgressBlock } from '@/components/batch/BatchSetupParts'
import { areaKm2 as calcAreaKm2 } from '@/components/batch/batchGeo'
import {
  explainBatchConclusion,
  explainBatchCoverage,
  explainBatchOverview,
  explainBatchRanking,
  explainBatchSuggestions,
  explainBatchWorst,
} from '@/lib/ui/batchExplain'

interface Props {
  batch: BatchWiring
  onPrint: () => void
}

/** 大白话说明：屏幕上也显示（批量视图本身是新页，不靠打印才解释） */
function Explain({ children }: { children: string }) {
  if (!children) return null
  return <p className="mt-2 text-[12px] leading-5 text-[var(--ink-2)]">{children}</p>
}

/**
 * 街道体检汇总视图（屏幕）：首屏统计 → 排名表 → 可达占比 → 最差三点 → 建议 → 结论。
 * 进行中显示已完成点位的实时统计与进度。
 */
export default function BatchView({ batch, onPrint }: Props) {
  const { state, mode } = batch
  const report = state.report
  const live: BatchPointSummary[] = report
    ? report.points
    : Object.values(state.summaries).sort((a, b) => a.index - b.index)
  const area = report?.area ?? state.request?.area ?? batch.area
  const km2 = report?.areaKm2 ?? state.plan?.areaKm2 ?? (area ? calcAreaKm2(area) : null)
  const planned = state.plan?.points.length ?? state.progress.total
  const failedN = Object.keys(state.failed).length
  const running = mode === 'running'

  if (mode === 'setup' && !report && live.length === 0) return <SetupHint />

  return (
    <article className="relative pb-6" data-testid="batch-view">
      <span className="sheet-corner left-2 top-2 hidden md:block" aria-hidden="true" />
      <span className="sheet-corner right-2 top-2 hidden md:block" aria-hidden="true" />
      <div className="px-5 pt-5">
        <BatchOverview
          area={area}
          areaKm2={km2}
          points={live}
          planned={planned}
          failed={failedN}
          running={running}
        />
        {report && <Explain>{explainBatchOverview(report)}</Explain>}
      </div>

      {running && (
        <div className="mx-5 mt-4 rounded-[var(--r-md)] border border-[var(--line-strong)] px-3 pb-3 pt-0 md:hidden">
          <ProgressBlock state={state} onCancel={batch.cancel} />
        </div>
      )}

      {report && (
        <>
          {report.warnings.length > 0 && (
            <ul className="mx-5 mt-3 space-y-1 border-l-2 border-[var(--ochre)] pl-3 text-xs text-[var(--ink-2)]">
              {report.warnings.map((w, i) => (
                <li key={i} className="break-words">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="mx-5 mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn !min-h-9 text-xs" onClick={onPrint}>
              <Icon name="printer" size={14} />
              导出街道报告 PDF
            </button>
            <button
              type="button"
              className={`btn !min-h-9 text-xs ${batch.heat ? 'btn-primary' : ''}`}
              aria-pressed={batch.heat}
              onClick={() => batch.setHeat(!batch.heat)}
            >
              <Icon name="layers" size={14} />
              热力图
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={batch.toggle}>
              调整范围重跑
            </button>
          </div>
          {report.headline.length > 0 && (
            <ul
              className="mx-5 mt-4 space-y-1.5 border-l-2 border-[var(--ink)] pl-3 text-sm leading-relaxed"
              data-testid="batch-headline"
            >
              {report.headline.map((h, i) => (
                <li key={i} className="break-words">
                  {h}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="px-5 pt-6">
        <SectionHead
          no="01"
          title="点位排名"
          note={
            report ? `${live.length} 点 · 点行定位` : `已完成 ${live.length} / ${planned || '—'}`
          }
        />
        {live.length > 0 ? (
          <BatchRankTable
            points={live}
            failed={state.failed}
            selected={batch.selected}
            onSelect={batch.select}
            onOpen={batch.openDetail}
          />
        ) : (
          <p className="text-sm text-[var(--ink-3)]">第一个点出来后这里会实时排名。</p>
        )}
        {report && <Explain>{explainBatchRanking(report)}</Explain>}
      </section>

      {report && (
        <>
          <section className="px-5 pt-6">
            <SectionHead no="02" title="15 分钟可达点位占比" note="十类 · 红字硬指标" />
            <BatchCoverageBars coverage={report.coverageByCategory} />
            <Explain>{explainBatchCoverage(report)}</Explain>
          </section>

          <section className="px-5 pt-6">
            <SectionHead no="03" title="最差三点" note="优先补配" />
            <BatchWorstCards report={report} onOpen={batch.openDetail} />
            <Explain>{explainBatchWorst(report)}</Explain>
          </section>

          <section className="px-5 pt-6">
            <SectionHead no="04" title="街道级建议" note={`${report.suggestions.length} 条`} />
            <Suggestions items={report.suggestions} />
            <Explain>{explainBatchSuggestions(report)}</Explain>
          </section>

          <section className="px-5 pt-6">
            <SectionHead no="05" title="结论" note="自动归纳" />
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
              {report.headline.map((h, i) => (
                <li key={i} className="break-words">
                  {h}
                </li>
              ))}
            </ol>
            <Explain>{explainBatchConclusion(report)}</Explain>
          </section>
        </>
      )}

      {state.status === 'error' && state.error && (
        <div className="mx-5 mt-6 border border-[var(--vermilion)] px-4 py-3 text-sm">
          <p className="font-medium text-[var(--vermilion)]">街道体检失败</p>
          <p className="mt-1 break-words text-[var(--ink-2)]">{state.error}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn !min-h-9 text-xs" onClick={batch.start}>
              重试
            </button>
            <button type="button" className="btn btn-ghost !min-h-9 text-xs" onClick={batch.exit}>
              退出
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function SetupHint() {
  return (
    <div className="px-5 pt-8 text-sm text-[var(--ink-2)]" data-testid="batch-setup-hint">
      <p className="kicker">街道体检</p>
      <p className="mt-2 leading-relaxed">
        先在地图上定一个范围：圆形用搜索框选中心（或点地图），矩形直接在地图上拖；然后点「开始体检」。
        系统会在范围里每隔 400–800 米布一个点，逐个做 15 分钟生活圈体检，最后汇总成街道级报告。
      </p>
      <p className="mt-3 text-xs text-[var(--ink-3)]">
        桌面端设置面板在地图左下角，手机端在本抽屉顶部。
      </p>
    </div>
  )
}
