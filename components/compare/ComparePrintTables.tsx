import type { HealthReport } from '@/lib/types'
import type { Comparison, Slot } from '@/lib/ui/compare'
import { SLOT_HEX } from '@/lib/ui/compare'
import { fmtKm2 } from '@/lib/ui/format'
import { formatMeters } from '@/lib/report/format'
import { blindDirRows, blindSummary, reachRows, ringOf } from '@/lib/ui/compareRows'
import { SlotChip, WinnerMark } from '@/components/compare/SlotChip'
import { TwoCol } from '@/components/compare/ComparePrintParts'
import Suggestions from '@/components/report/Suggestions'

const TH = 'py-1 pr-2 text-left font-normal text-[var(--ink-3)]'
const TD = 'py-1 pr-2 align-top'

function SlotTh({ slot, text }: { slot: Slot; text: string }) {
  return (
    <th className={TH}>
      <span className="inline-flex items-center gap-1">
        <SlotChip slot={slot} size={13} /> {text}
      </span>
    </th>
  )
}

/** 06 硬指标：三行 × A / B 两列，每格 有无 · 最近店名 · 步行分钟 */
export function EssentialGrid({ c }: { c: Comparison }) {
  const rows = c.rows.filter((r) => r.essential)
  const cell = (r: (typeof rows)[number], slot: Slot) => {
    const s = slot === 'A' ? r.a : r.b
    const has = s.nearestWalkMin != null
    const better = r.winner === slot
    return (
      <td className={TD}>
        <p className="flex items-baseline gap-1.5">
          <span
            className="text-[11px] font-semibold"
            style={{ color: has ? 'var(--teal)' : 'var(--vermilion)' }}
          >
            {has ? '有' : '1 公里内无'}
          </span>
          {has && (
            <span
              className="tnum text-[15px] font-bold"
              style={{
                fontFamily: 'var(--font-serif)',
                color: better ? 'var(--teal)' : 'var(--ink)',
              }}
            >
              {Math.round(s.nearestWalkMin!)}
              <span className="text-[10px] font-normal text-[var(--ink-3)]"> 分钟</span>
            </span>
          )}
          <WinnerMark winner={r.winner} slot={slot} compact />
        </p>
        <p className="mt-0.5 break-words text-[11px] leading-4 text-[var(--ink-2)]">
          {s.nearest?.name ?? s.diagnosis}
        </p>
      </td>
    )
  }
  return (
    <table className="w-full border-collapse text-[11.5px] leading-4">
      <thead>
        <tr className="border-b border-[var(--ink)]">
          <th className={`${TH} w-16`}>硬指标</th>
          <SlotTh slot="A" text={c.nameA} />
          <SlotTh slot="B" text={c.nameB} />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.category} className="border-b border-dashed border-[var(--line)]">
            <td className={`${TD} font-medium text-[var(--vermilion)]`}>{r.label}</td>
            {cell(r, 'A')}
            {cell(r, 'B')}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 07 等时圈：两列各 5/10/15 面积 · 等效半径 · 圆度 */
export function IsoCols({ c }: { c: Comparison }) {
  const col = (r: HealthReport) => (
    <dl className="grid grid-cols-3 gap-x-2 gap-y-1 text-[11.5px] leading-4">
      {([5, 10, 15] as const).map((m) => (
        <div key={m}>
          <dt className="text-[var(--ink-3)]">{m} 分钟</dt>
          <dd className="tnum font-semibold">{fmtKm2(ringOf(r, m)?.areaKm2 ?? 0)} km²</dd>
        </div>
      ))}
      <div>
        <dt className="text-[var(--ink-3)]">等效半径</dt>
        <dd className="tnum font-semibold">{Math.round(r.isochrone.equivalentRadiusM)} m</dd>
      </div>
      <div>
        <dt className="text-[var(--ink-3)]">圆度</dt>
        <dd className="tnum font-semibold">{r.isochrone.circularity.toFixed(2)}</dd>
      </div>
      <div>
        <dt className="text-[var(--ink-3)]">采样点</dt>
        <dd className="tnum font-semibold">{r.isochrone.samples.length}</dd>
      </div>
    </dl>
  )
  return <TwoCol c={c} a={col(c.a)} b={col(c.b)} />
}

/** 07 · 16 方向可达距离 A / B 并排（两张 8 行表并排，省纸） */
export function ReachTable({ c }: { c: Comparison }) {
  const rows = reachRows(c)
  const half = Math.ceil(rows.length / 2)
  const maxR = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]))
  const table = (list: typeof rows) => (
    <table className="w-full border-collapse text-[11px] leading-4">
      <thead>
        <tr className="border-b border-[var(--ink)]">
          <th className={TH}>方向</th>
          <SlotTh slot="A" text="米" />
          <SlotTh slot="B" text="米" />
          <th className={`${TH} text-right`}>差</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.bearingDeg} className="border-b border-dashed border-[var(--line)]">
            <td className={`${TD} whitespace-nowrap`}>
              {r.dir}
              <span className="figure ml-1 text-[var(--ink-3)]">{r.bearingDeg}°</span>
            </td>
            <td className={TD}>
              <Bar v={r.a} max={maxR} slot="A" />
            </td>
            <td className={TD}>
              <Bar v={r.b} max={maxR} slot="B" />
            </td>
            <td className={`${TD} tnum whitespace-nowrap text-right`}>
              {r.diff === 0 ? '持平' : `${r.diff > 0 ? '+' : '−'}${Math.abs(r.diff)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-5">
      {table(rows.slice(0, half))}
      {table(rows.slice(half))}
    </div>
  )
}

function Bar({ v, max, slot }: { v: number; max: number; slot: Slot }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--paper-3)]">
        <span
          className="block h-full"
          style={{ width: `${(v / max) * 100}%`, background: SLOT_HEX[slot] }}
        />
      </span>
      <span className="tnum">{v}</span>
    </span>
  )
}

/** 08 服务盲区：两列各 圈内盲区格 / 总格 / 面积 / 最缺类别 */
export function BlindCols({ c }: { c: Comparison }) {
  const col = (r: HealthReport) => {
    const s = blindSummary(r)
    return (
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11.5px] leading-4">
        <div>
          <dt className="text-[var(--ink-3)]">圈内盲区格</dt>
          <dd className="tnum font-semibold">{s.inner}</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-3)]">盲区格总数</dt>
          <dd className="tnum font-semibold">{s.total}</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-3)]">盲区面积</dt>
          <dd className="tnum font-semibold">{fmtKm2(s.areaKm2)} km²</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-3)]">最缺类别</dt>
          <dd className="font-semibold">
            {s.topMissing ? `${s.topMissing}（${s.topMissingCount} 格）` : '无'}
          </dd>
        </div>
      </dl>
    )
  }
  return <TwoCol c={c} a={col(c.a)} b={col(c.b)} />
}

/** 08 · 按方位的盲区表 A / B 并排 */
export function BlindDirTable({ c }: { c: Comparison }) {
  const rows = blindDirRows(c)
  if (rows.length === 0)
    return <p className="mt-2 text-[11.5px] text-[var(--ink-3)]">两地周边 1.5 公里内都没有盲区。</p>
  const cell = (s: (typeof rows)[number]['a']) =>
    s ? (
      <>
        <td className={`${TD} tnum whitespace-nowrap`}>
          {s.count}
          <span className="text-[var(--ink-3)]"> / 圈内 {s.inIso}</span>
        </td>
        <td className={`${TD} whitespace-nowrap`}>
          {formatMeters(s.minM)} ~ {formatMeters(s.maxM)}
        </td>
        <td className={`${TD} text-[var(--ink-2)]`}>{s.missing}</td>
      </>
    ) : (
      <td className={`${TD} text-[var(--ink-3)]`} colSpan={3}>
        无
      </td>
    )
  return (
    <table className="mt-2 w-full border-collapse text-[11px] leading-4">
      <thead>
        <tr className="border-b border-[var(--ink)]">
          <th className={TH} rowSpan={2}>
            方位
          </th>
          <th className={`${TH} border-b border-dashed border-[var(--line)]`} colSpan={3}>
            <span className="inline-flex items-center gap-1">
              <SlotChip slot="A" size={13} /> {c.nameA}
            </span>
          </th>
          <th className={`${TH} border-b border-dashed border-[var(--line)]`} colSpan={3}>
            <span className="inline-flex items-center gap-1">
              <SlotChip slot="B" size={13} /> {c.nameB}
            </span>
          </th>
        </tr>
        <tr className="border-b border-[var(--ink)]">
          <th className={TH}>格数</th>
          <th className={TH}>距中心</th>
          <th className={TH}>缺什么</th>
          <th className={TH}>格数</th>
          <th className={TH}>距中心</th>
          <th className={TH}>缺什么</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.dir} className="border-b border-dashed border-[var(--line)]">
            <td className={`${TD} font-medium`}>{r.dir}</td>
            {cell(r.a)}
            {cell(r.b)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 09 规划建议两列 */
export function SuggestionCols({ c }: { c: Comparison }) {
  return (
    <TwoCol
      c={c}
      a={<Suggestions items={c.a.suggestions} />}
      b={<Suggestions items={c.b.suggestions} />}
      className="text-[11.5px]"
    />
  )
}

/** 11 数据与方法：合并一段 + 两地各一行 API 统计 */
export function MethodBlock({ c }: { c: Comparison }) {
  const line = (slot: Slot, r: HealthReport) => {
    const s = r.apiStats
    const est = r.pois.filter((p) => p.walkSource === 'estimate').length
    return (
      <li key={slot} className="flex gap-1.5">
        <SlotChip slot={slot} size={13} />
        <span>
          {r.dataSource === 'live'
            ? '全部实时调用'
            : r.dataSource === 'sample'
              ? '内置样例数据'
              : '实时调用，部分降级'}
          ；等时圈采样 {r.isochrone.samples.length} 点，设施 {r.pois.length} 处
          {est > 0 ? `（估算 ${est} 处）` : ''}；地理编码 {s.geocode} 次、地点检索 {s.placeSearch}{' '}
          次、批量算路 {s.routeMatrix} 次（{s.routeMatrixPairs} 对）、缓存命中 {s.cacheHits}{' '}
          次、限流退避 {s.rateLimited} 次、降级 {s.degraded} 次，耗时{' '}
          {(s.elapsedMs / 1000).toFixed(1)} 秒。
        </span>
      </li>
    )
  }
  return (
    <div className="text-[11.5px] leading-4 text-[var(--ink-2)]">
      <p>
        数据来源：百度地图开放平台 Web 服务 API（地理编码、地点检索、步行批量算路、静态图）。
        等时圈：16 方向 × 7 半径采样，逐点真实算路，按相邻采样点线性插值取 5 / 10 / 15
        分钟边界。设施：检索半径 1800 米，去重并剔除误检；步行时间为真实路网算路，个别失败按直线 ×
        1.3 ÷ 1.2 m/s 估算。盲区：200 米网格覆盖中心 1.5 公里圆域，判定半径 1
        公里（直线），硬指标为菜市场、药店、小学。两地采用完全相同的参数与评分规则，可直接对照。
      </p>
      <ul className="mt-1.5 space-y-1">
        {line('A', c.a)}
        {line('B', c.b)}
      </ul>
      <p className="mt-1.5">
        坐标系 BD-09；软件：圈见 quanjian（MIT 开源，github.com/chunge-php/quanjian）。
      </p>
    </div>
  )
}
