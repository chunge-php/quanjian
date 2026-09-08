import type { FacilityCategory, HealthReport, Poi } from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import SectionHead from '@/components/report/SectionHead'
import { bearingToChinese, formatMeters, formatMinutes } from '@/lib/report/format'
import { bearingBetween, haversineM } from '@/lib/isochrone/geo'
import { explainBlindByDirection, explainPoiList, explainReach } from '@/lib/report/explain'

const GRADE_WORD = { A: '优', B: '良', C: '中', D: '差' } as const
const MAX_PER_CATEGORY = 8

/** 10 · 各类设施明细表（打印专用） */
export function PrintCategoryTable({ report }: { report: HealthReport }) {
  return (
    <section className="print-only print-avoid px-5 pt-6">
      <SectionHead no="10" title="各类设施明细" note="按硬指标优先排序" />
      <table className="mt-2 w-full border-collapse text-[11.5px] leading-4">
        <thead>
          <tr className="border-b border-[var(--ink)] text-left text-[var(--ink-3)]">
            <th className="py-1 pr-2 font-normal">类别</th>
            <th className="py-1 pr-2 font-normal">评级</th>
            <th className="py-1 pr-2 font-normal">圈内/1km</th>
            <th className="py-1 pr-2 font-normal">最近一处</th>
            <th className="py-1 pr-2 font-normal">步行</th>
            <th className="py-1 font-normal">一句话结论</th>
          </tr>
        </thead>
        <tbody>
          {report.categories.map((c) => (
            <tr key={c.category} className="border-b border-dashed border-[var(--line)] align-top">
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {c.label}
                {c.essential && <span className="ml-1 text-[var(--vermilion)]">硬</span>}
              </td>
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {c.score} · {GRADE_WORD[c.grade]}
              </td>
              <td className="figure py-1.5 pr-2 whitespace-nowrap">
                {c.countInIsochrone} / {c.countWithin1km}
              </td>
              <td className="py-1.5 pr-2">{c.nearest ? c.nearest.name : '周边没有'}</td>
              <td className="py-1.5 pr-2 whitespace-nowrap">
                {c.nearestWalkMin === null ? '—' : formatMinutes(c.nearestWalkMin)}
                {c.nearest && (
                  <span className="text-[var(--ink-3)]">
                    {' '}
                    · {formatMeters(c.nearest.straightM)}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-[var(--ink-2)]">{c.diagnosis}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[var(--ink-3)]">
        「圈内」指 15 分钟步行等时圈内的数量；「1
        公里内」按直线距离统计。步行分钟为百度地图真实路网算路结果。
      </p>
    </section>
  )
}

/** 11 · 圈内设施清单：每类最多列 8 处，按步行分钟排序 */
export function PrintPoiList({ report }: { report: HealthReport }) {
  const inIso = report.pois.filter((p) => p.inIsochrone)
  if (inIso.length === 0) return null
  const groups = FACILITY_CATEGORIES.map((c) => ({
    meta: c,
    list: inIso
      .filter((p) => p.category === c.key)
      .sort((a, b) => (a.walkSec ?? 1e9) - (b.walkSec ?? 1e9)),
  })).filter((g) => g.list.length > 0)
  return (
    <section className="print-only px-5 pt-6">
      <SectionHead no="11" title="15 分钟圈内设施清单" note={`共 ${inIso.length} 处`} />
      <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-2)]">{explainPoiList(report)}</p>
      <div className="mt-2 columns-2 gap-6 text-[11.5px] leading-4">
        {groups.map((g) => (
          <div key={g.meta.key} className="mb-3 break-inside-avoid">
            <p className="font-medium text-[var(--ink)]">
              {g.meta.label}
              <span className="figure ml-1 text-[var(--ink-3)]">{g.list.length}</span>
            </p>
            <ol className="mt-0.5 space-y-0.5 text-[var(--ink-2)]">
              {g.list.slice(0, MAX_PER_CATEGORY).map((p) => (
                <li key={p.uid} className="flex gap-2">
                  <span className="min-w-0 flex-1 break-words">{p.name}</span>
                  <span className="figure whitespace-nowrap">{walkLabel(p, report.center)}</span>
                </li>
              ))}
              {g.list.length > MAX_PER_CATEGORY && (
                <li className="text-[var(--ink-3)]">
                  另有 {g.list.length - MAX_PER_CATEGORY} 处未列出
                </li>
              )}
            </ol>
          </div>
        ))}
      </div>
    </section>
  )
}

function walkLabel(p: Poi, center: HealthReport['center']): string {
  const min = p.walkSec === null ? null : p.walkSec / 60
  const dir = bearingToChinese(bearingBetween(center, p.location))
  return `${min === null ? '—' : `${Math.round(min)}′`} ${dir}${p.walkSource === 'estimate' ? ' *' : ''}`
}

/** 12 · 各方向可达半径 + 13 · 盲区按方位 + 14 · 数据与方法 */
export function PrintMethod({ report }: { report: HealthReport }) {
  const iso = report.isochrone
  const reach = iso.reachRadiusByBearing
  const maxR = Math.max(...reach.map((r) => r.radiusM), 1)
  const estimated = report.pois.filter((p) => p.walkSource === 'estimate').length
  const sampleEst = iso.samples.filter((s) => s.source === 'estimate').length
  const blindByDir = groupBlindByDirection(report)
  return (
    <>
      <section className="print-only print-avoid px-5 pt-6">
        <SectionHead no="12" title="各方向 15 分钟可达距离" note="米" />
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-2)]">{explainReach(report)}</p>
        <div className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1 text-[11.5px]">
          {reach.map((r) => (
            <div key={r.bearingDeg} className="flex items-center gap-2">
              <span className="w-8 text-[var(--ink-2)]">{bearingToChinese(r.bearingDeg)}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-3)]">
                <span
                  className="block h-full bg-[var(--teal)]"
                  style={{ width: `${(r.radiusM / maxR) * 100}%` }}
                />
              </span>
              <span className="figure w-10 text-right">{Math.round(r.radiusM)}</span>
            </div>
          ))}
        </div>
      </section>

      {blindByDir.length > 0 && (
        <section className="print-only print-avoid px-5 pt-6">
          <SectionHead no="13" title="盲区分布" note="按方位统计" />
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--ink-2)]">
            {explainBlindByDirection(report)}
          </p>
          <table className="mt-2 w-full border-collapse text-[11.5px]">
            <thead>
              <tr className="border-b border-[var(--ink)] text-left text-[var(--ink-3)]">
                <th className="py-1 pr-2 font-normal">方位</th>
                <th className="py-1 pr-2 font-normal">网格数</th>
                <th className="py-1 pr-2 font-normal">圈内</th>
                <th className="py-1 pr-2 font-normal">距中心</th>
                <th className="py-1 font-normal">缺什么</th>
              </tr>
            </thead>
            <tbody>
              {blindByDir.map((d) => (
                <tr key={d.dir} className="border-b border-dashed border-[var(--line)]">
                  <td className="py-1 pr-2">{d.dir}</td>
                  <td className="figure py-1 pr-2">{d.count}</td>
                  <td className="figure py-1 pr-2">{d.inIso}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {formatMeters(d.minM)} ~ {formatMeters(d.maxM)}
                  </td>
                  <td className="py-1 text-[var(--ink-2)]">{d.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="print-only print-avoid px-5 pt-6">
        <SectionHead no="14" title="数据与方法" note="可复现" />
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11.5px] leading-4 text-[var(--ink-2)]">
          <li>
            数据来源：百度地图开放平台 Web 服务 API（地理编码、地点检索、步行批量算路）；本次{' '}
            {report.dataSource === 'live'
              ? '全部实时调用'
              : report.dataSource === 'sample'
                ? '使用内置样例数据'
                : '实时调用，部分降级'}
            ，生成于 {new Date(report.generatedAt).toLocaleString('zh-CN', { hour12: false })}。
          </li>
          <li>
            等时圈：16 方向 × 7 半径共 {iso.samples.length} 个采样点，真实算路{' '}
            {iso.samples.length - sampleEst} 个{sampleEst > 0 ? `，估算 ${sampleEst} 个` : ''}
            ；按相邻采样点线性插值取 5 / 10 / 15 分钟边界，相邻方向做一次平滑。
          </li>
          <li>
            设施：检索半径 1800 米，共 {report.pois.length}{' '}
            处，去重并剔除误检（如「医药公司」不算药店、「小学培训班」不算小学）； 步行时间真实算路{' '}
            {report.pois.length - estimated} 处
            {estimated > 0
              ? `，估算 ${estimated} 处（清单中以 * 标记，按直线 × 1.3 ÷ 1.2 m/s）`
              : ''}
            。
          </li>
          <li>
            盲区：200 米网格覆盖中心 1.5 公里圆域，判定半径 1
            公里（直线），硬指标为菜市场、药店、小学。
          </li>
          <li>
            接口调用：地理编码 {report.apiStats.geocode} 次、地点检索 {report.apiStats.placeSearch}{' '}
            次、批量算路 {report.apiStats.routeMatrix} 次（{report.apiStats.routeMatrixPairs}{' '}
            对）、缓存命中 {report.apiStats.cacheHits} 次、限流退避 {report.apiStats.rateLimited}{' '}
            次、降级 {report.apiStats.degraded} 次，总耗时{' '}
            {(report.apiStats.elapsedMs / 1000).toFixed(1)} 秒。
          </li>
          {report.warnings.map((w, i) => (
            <li key={i}>提示：{w}</li>
          ))}
          <li>坐标系 BD-09；软件：圈见 quanjian（MIT 开源，github.com/chunge-php/quanjian）。</li>
        </ul>
      </section>
    </>
  )
}

interface DirRow {
  dir: string
  count: number
  inIso: number
  minM: number
  maxM: number
  missing: string
}

function groupBlindByDirection(report: HealthReport): DirRow[] {
  const map = new Map<
    string,
    { count: number; inIso: number; minM: number; maxM: number; miss: Record<string, number> }
  >()
  const labelOf = (k: FacilityCategory) => FACILITY_CATEGORIES.find((c) => c.key === k)?.label ?? k
  for (const cell of report.blindSpots) {
    const dir = bearingToChinese(bearingBetween(report.center, cell.center))
    const d = haversineM(report.center, cell.center)
    const g = map.get(dir) ?? { count: 0, inIso: 0, minM: Infinity, maxM: 0, miss: {} }
    g.count += 1
    if (cell.inIsochrone) g.inIso += 1
    g.minM = Math.min(g.minM, d)
    g.maxM = Math.max(g.maxM, d)
    for (const m of cell.missing) g.miss[m] = (g.miss[m] ?? 0) + 1
    map.set(dir, g)
  }
  const order = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return order
    .filter((dir) => map.has(dir))
    .map((dir) => {
      const g = map.get(dir)!
      const missing = Object.entries(g.miss)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${labelOf(k as FacilityCategory)} ${n} 格`)
        .join('、')
      return { dir, count: g.count, inIso: g.inIso, minM: g.minM, maxM: g.maxM, missing }
    })
}
