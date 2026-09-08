import type { HealthReport } from '@/lib/types'
import { fmtDateTime, fmtLngLat } from '@/lib/ui/format'
import { weatherSummary } from '@/lib/baidu/weather'

/** 图签（title block）：图纸右下角那张表，报告身份信息都在这 */
export default function TitleBlock({ report }: { report: HealthReport }) {
  const cells: [string, string][] = [
    ['图名', '15 分钟生活圈体检报告'],
    ['中心点', fmtLngLat(report.center)],
    ['坐标系', 'BD-09（百度）'],
    ['步行速度', '4.3 km/h · 等时圈 5/10/15′'],
    [
      '数据',
      report.dataSource === 'live'
        ? '百度地图开放平台 · 实时'
        : report.dataSource === 'mixed'
          ? '百度地图开放平台 · 部分降级'
          : '内置样例',
    ],
    ['生成时间', fmtDateTime(report.generatedAt)],
    ['报告编号', report.id],
    ['出图', '圈见 · quanjian'],
  ]
  // 有天气才加一行（两格），保证单元格数为偶数、每行两组
  if (report.weather)
    cells.push(['天气', weatherSummary(report.weather)], ['步行舒适', report.weather.walkComment])
  return (
    <table
      className="w-full border-collapse border border-[var(--ink)] text-xs"
      aria-label="报告图签"
    >
      <tbody>
        {Array.from({ length: cells.length / 2 }, (_, r) => (
          <tr key={r}>
            {[cells[r * 2], cells[r * 2 + 1]].map(([k, v]) => (
              <Cell key={k} k={k} v={v} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <>
      <th
        scope="row"
        className="w-[4.5rem] border border-[var(--line-strong)] bg-[var(--paper-2)] px-2 py-1 text-left font-normal text-[var(--ink-3)]"
      >
        {k}
      </th>
      <td className="figure break-words border border-[var(--line-strong)] px-2 py-1 text-[var(--ink)]">
        {v}
      </td>
    </>
  )
}
