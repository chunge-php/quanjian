'use client'
import type { HealthReport } from '@/lib/types'
import ReportPanel from '@/components/report/ReportPanel'
import { toast } from '@/lib/ui/toast'
import type { BatchWiring } from '@/components/batch/useBatchWiring'
import BatchSetup, { type BatchSetupProps } from '@/components/batch/BatchSetup'
import BatchView from '@/components/batch/BatchView'
import BatchPrint from '@/components/batch/BatchPrint'
import BatchPointHeader from '@/components/batch/BatchPointHeader'
import { essentialLine } from '@/lib/ui/batchExplain'

/** 设置面板 props（桌面挂地图左下 / 移动端进抽屉顶部共用） */
export function batchSetupProps(batch: BatchWiring): Omit<BatchSetupProps, 'className'> {
  return {
    mode: batch.mode,
    draft: batch.draft,
    onDraft: batch.setDraft,
    state: batch.state,
    estimate: batch.estimate,
    heat: batch.heat,
    onHeat: batch.setHeat,
    onStart: batch.start,
    onCancel: batch.cancel,
    onExit: batch.exit,
    onEdit: batch.toggle,
  }
}

interface Props {
  batch: BatchWiring
  isDesktop: boolean
  printing: boolean
  onPrint: () => void
  /** 「导出此点完整报告」：走打印覆盖机制（AppShell 的 exportSimulated） */
  onExportPoint: (report: HealthReport) => void
}

/**
 * 批量模式下的抽屉内容：移动端顶部设置面板 → 点详情（ReportPanel + 顶部返回条）或汇总视图；
 * 打印只输出 BatchPrint。
 */
export default function BatchDrawer({ batch, isDesktop, printing, onPrint, onExportPoint }: Props) {
  const report = batch.state.report
  const idx = batch.detail
  const summary = idx != null ? batch.state.summaries[idx] : undefined
  const pointReport: HealthReport | null =
    report && summary
      ? (report.reports.find((r) => r.id === summary.reportId) ??
        report.reports[summary.index] ??
        null)
      : null
  const total = batch.state.plan?.points.length ?? report?.points.length ?? 0
  const neighbour = (dir: -1 | 1) => {
    if (idx == null) return null
    let i = idx + dir
    while (i >= 0 && i < total) {
      if (batch.state.summaries[i]) return i
      i += dir
    }
    return null
  }
  const prev = neighbour(-1)
  const next = neighbour(1)

  return (
    <div className="pb-0">
      {!isDesktop && (
        <BatchSetup className="mx-3 mb-2 mt-3 print:hidden" {...batchSetupProps(batch)} />
      )}
      {summary ? (
        <div className="print:hidden">
          <BatchPointHeader
            summary={summary}
            total={total}
            onBack={batch.closeDetail}
            onPrev={prev != null ? () => batch.openDetail(prev) : null}
            onNext={next != null ? () => batch.openDetail(next) : null}
            onExport={() =>
              pointReport
                ? onExportPoint(pointReport)
                : toast('全部点完成后才能导出单点报告', 'info')
            }
          />
          {pointReport ? (
            <ReportPanel
              report={pointReport}
              printing={printing}
              onPrint={() => onExportPoint(pointReport)}
              onRerun={() => toast('街道体检里的单点不单独重跑，请「调整范围重跑」', 'info', 3200)}
              printLabel={`街道体检 · 第 ${summary.index + 1} 点`}
            />
          ) : (
            <div className="mx-5 mt-4 rounded-[var(--r-md)] border border-dashed border-[var(--line-strong)] px-4 py-3 text-sm">
              <p className="font-medium">
                第 {summary.index + 1} 点 · {summary.overallScore} 分
              </p>
              <p className="mt-1 break-words text-[var(--ink-2)]">{summary.address}</p>
              <p className="figure mt-1 text-xs text-[var(--ink-2)]">{essentialLine(summary)}</p>
              <p className="mt-2 text-xs text-[var(--ink-3)]">
                完整报告会在全部点体检完成后一起送达，届时再点这里查看。
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="print:hidden">
          <BatchView batch={batch} onPrint={onPrint} />
        </div>
      )}
      {report && <BatchPrint report={report} />}
    </div>
  )
}
