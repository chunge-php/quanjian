'use client'
import { useEffect, useState } from 'react'
import type { BatchReport } from '@/lib/types'
import { GRADE_LABEL } from '@/lib/ui/theme'
import { areaCenter, areaName, areaSpec } from '@/components/batch/batchGeo'
import { BATCH_MAP_SIZE, batchStaticMapUrl } from '@/components/batch/batchStaticMap'
import { explainBatchMap, gradeOf } from '@/lib/ui/batchExplain'

export const BATCH_PRINT_TITLE = '15 分钟生活圈体检报告 · 街道级'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 每页页眉（PrintFrame thead 重复） */
export function BatchHeaderLine({ report }: { report: BatchReport }) {
  return (
    <>
      <span>圈见 · {BATCH_PRINT_TITLE}</span>
      <span>
        {areaName(report.area)} · {report.points.length} 点 · 编号 {report.id} ·{' '}
        {fmtTime(report.generatedAt)}
      </span>
    </>
  )
}

/** 封头 */
export function BatchCover({ report }: { report: BatchReport }) {
  const c = areaCenter(report.area)
  const g = gradeOf(report.scoreAvg)
  return (
    <header className="print-cover px-5">
      <p className="kicker">圈见 · QuanJian</p>
      <h1
        className="mt-1 text-[26px] font-bold leading-tight"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {BATCH_PRINT_TITLE}
      </h1>
      <p className="mt-2 text-[13px] text-[var(--ink)]">
        {areaName(report.area)} · {areaSpec(report.area)}
      </p>
      <dl className="mt-3 grid grid-cols-4 gap-x-4 text-[11px] leading-4 text-[var(--ink-2)]">
        <div>
          <dt className="kicker">平均分</dt>
          <dd className="tnum text-[15px] font-semibold text-[var(--ink)]">
            {report.scoreAvg}{' '}
            <span className="text-[11px] font-normal">
              / 100 · {GRADE_LABEL[g]} · {report.points.length} 点
            </span>
          </dd>
        </div>
        <div>
          <dt className="kicker">范围中心</dt>
          <dd className="figure text-[var(--ink)]">
            {c.lng.toFixed(5)}, {c.lat.toFixed(5)}
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
        本报告在所选范围内按 {report.spacingM} 米间距布设 {report.points.length}{' '}
        个体检点，每个点各自按真实步行路网计算 15 分钟可达范围并统计十类民生设施，再把{' '}
        {report.points.length} 份结果汇总成街道级的平均分、排名、可达占比与建议。
        评分与建议仅供规划参考，设施数据以现场核实为准。
      </p>
    </header>
  )
}

/** 范围静态图：加载失败整块隐藏 */
export function BatchStaticMap({ report }: { report: BatchReport }) {
  const src = batchStaticMapUrl(report)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed) return <p className="text-[11px] text-[var(--ink-3)]">（静态地图不可用，已略过）</p>
  return (
    <figure className="map-snapshot m-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={BATCH_MAP_SIZE.w}
        height={BATCH_MAP_SIZE.h}
        alt={`${areaName(report.area)} 的街道体检范围与 ${report.points.length} 个体检点`}
        className="block h-auto w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--paper-2)]"
        style={{ aspectRatio: `${BATCH_MAP_SIZE.w} / ${BATCH_MAP_SIZE.h}` }}
        onError={() => setFailed(true)}
      />
      <figcaption className="mt-1.5 text-[10.5px] leading-4 text-[var(--ink-3)]">
        {explainBatchMap(report)}
      </figcaption>
    </figure>
  )
}

export function Explain({ children }: { children: string }) {
  if (!children) return null
  return <p className="mt-2 text-[12px] leading-5 text-[var(--ink-2)]">{children}</p>
}

/** 图签 */
export function BatchTitleBlock({ report }: { report: BatchReport }) {
  const rows: [string, string][] = [
    ['项目', BATCH_PRINT_TITLE],
    [
      '范围',
      `${areaName(report.area)} · ${areaSpec(report.area)} · ${report.areaKm2.toFixed(2)} km²`,
    ],
    ['点位', `${report.points.length} 个 · 点距 ${report.spacingM} m`],
    ['编号', report.id],
    ['生成', fmtTime(report.generatedAt)],
    ['出图', '圈见 QuanJian · 百度地图开放平台'],
  ]
  return (
    <table
      className="w-full border-collapse border border-[var(--ink)] text-[10.5px]"
      aria-label="报告图签"
    >
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-[var(--line)]">
            <th className="w-16 border-r border-[var(--ink)] bg-[var(--paper-2)] px-2 py-1 text-left font-medium">
              {k}
            </th>
            <td className="px-2 py-1">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
