import type { ApiStats } from '@/lib/types'
import { fmtMs } from '@/lib/ui/format'

/** 折叠的 API 调用明细：评委看"API 深度调用"，打印时强制展开 */
export default function ApiStatsDetails({
  stats,
  forceOpen,
}: {
  stats: ApiStats
  forceOpen: boolean
}) {
  const totalCalls = stats.geocode + stats.placeSearch + stats.routeMatrix
  const rows: [string, string, string?][] = [
    ['地理编码 / 逆地理编码', String(stats.geocode)],
    ['地点检索 place/v2/search', String(stats.placeSearch), '10 类 × 关键词'],
    ['批量算路 routematrix', String(stats.routeMatrix), `${stats.routeMatrixPairs} 组 O×D`],
    ['缓存命中', String(stats.cacheHits)],
    ['限流退避', String(stats.rateLimited), stats.rateLimited > 0 ? '已自动退避重试' : undefined],
    ['降级估算', String(stats.degraded), stats.degraded > 0 ? '直线距离 × 折减系数' : undefined],
    ['总耗时', fmtMs(stats.elapsedMs)],
  ]
  return (
    <details className="print-open group" open={forceOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-baseline gap-2.5 py-1 [&::-webkit-details-marker]:hidden">
        <span className="figure text-[0.6875rem] text-[var(--ink-3)]">08</span>
        <span className="text-[0.9375rem] font-semibold tracking-wide">API 调用明细</span>
        <span className="ml-auto tnum text-xs text-[var(--ink-3)]">
          {totalCalls} 次 · {stats.routeMatrixPairs} 对
        </span>
        <span
          className="text-xs text-[var(--ink-3)] transition-transform duration-200 group-open:rotate-180 print:hidden"
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>
      <div className="hairline mb-3 mt-1" />
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v, note]) => (
            <tr key={k} className="border-b border-dashed border-[var(--line)] last:border-0">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-[var(--ink-2)]">
                {k}
                {note && (
                  <span className="ml-1.5 text-[0.6875rem] text-[var(--ink-3)]">{note}</span>
                )}
              </th>
              <td className="tnum py-1.5 text-right font-medium">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
