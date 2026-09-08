import type { HealthReport } from '@/lib/types'
import { GRADE_LABEL } from '@/lib/ui/theme'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * PDF 专用的报告封头（屏幕上不显示）。页眉见 PrintFrame（thead 每页重复）。
 */
export function printTitle(label?: string): string {
  return label ? `15 分钟生活圈体检报告 · ${label}` : '15 分钟生活圈体检报告'
}

/** 每页页眉内容（配合 PrintFrame 的 thead 重复） */
export function PrintHeaderLine({ report, label }: { report: HealthReport; label?: string }) {
  return (
    <>
      <span>圈见 · {printTitle(label)}</span>
      <span>
        {report.address.formatted} · 编号 {report.id} · {fmtTime(report.generatedAt)}
      </span>
    </>
  )
}

export default function PrintChrome({
  report,
  label,
  cover = true,
}: {
  report: HealthReport
  label?: string
  /** 是否渲染封头（对比模式下每份报告各自有封头） */
  cover?: boolean
}) {
  const title = printTitle(label)
  return (
    <>
      {cover && (
        <header className="print-only print-cover px-5">
          <p className="kicker">圈见 · QuanJian</p>
          <h1
            className="mt-1 text-[26px] font-bold leading-tight"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {title}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--ink)]">{report.address.formatted}</p>
          <dl className="mt-3 grid grid-cols-4 gap-x-4 text-[11px] leading-4 text-[var(--ink-2)]">
            <div>
              <dt className="kicker">综合评分</dt>
              <dd className="tnum text-[15px] font-semibold text-[var(--ink)]">
                {report.overallScore}{' '}
                <span className="text-[11px] font-normal">
                  / 100 · {GRADE_LABEL[report.overallGrade]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="kicker">中心点</dt>
              <dd className="figure text-[var(--ink)]">
                {report.center.lng.toFixed(5)}, {report.center.lat.toFixed(5)}
              </dd>
            </div>
            <div>
              <dt className="kicker">生成时间</dt>
              <dd className="text-[var(--ink)]">{fmtTime(report.generatedAt)}</dd>
            </div>
            <div>
              <dt className="kicker">数据来源</dt>
              <dd className="text-[var(--ink)]">
                百度地图 ·{' '}
                {report.dataSource === 'live'
                  ? '实时'
                  : report.dataSource === 'sample'
                    ? '内置样例'
                    : '实时（部分估算）'}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11.5px] leading-5 text-[var(--ink-2)]">
            本报告以所选地点为中心，按真实步行路网计算 5 / 10 / 15
            分钟可达范围，统计范围内菜市场、药店、小学等十类民生设施， 并标出 1
            公里内缺少硬指标设施的服务盲区。评分与建议仅供规划参考，设施数据以现场核实为准。
          </p>
        </header>
      )}
    </>
  )
}
