'use client'
import { useMemo, useState } from 'react'
import type { BatchPointSummary } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { GRADE_COLOR } from '@/lib/ui/theme'
import { rankPoints, shortPointAddress } from '@/components/batch/batchGeo'

interface Props {
  points: BatchPointSummary[]
  failed?: Record<number, string>
  selected?: number | null
  /** 点行 = 定位并高亮 */
  onSelect?: (index: number) => void
  /** 行尾「报告」 */
  onOpen?: (index: number) => void
  /** 打印：无交互、字更小 */
  print?: boolean
}

type SortKey = 'score' | 'index'

/** 点位排名表：序号、地址简称、分数评级、硬指标三项分钟、圈内盲区格 */
export default function BatchRankTable({
  points,
  failed,
  selected,
  onSelect,
  onOpen,
  print,
}: Props) {
  const [sort, setSort] = useState<SortKey>('score')
  const [desc, setDesc] = useState(true)
  const rows = useMemo(() => {
    const base =
      sort === 'score' ? rankPoints(points) : points.slice().sort((a, b) => a.index - b.index)
    return desc ? base : base.slice().reverse()
  }, [points, sort, desc])
  const rankOf = useMemo(() => {
    const m = new Map<number, number>()
    rankPoints(points).forEach((p, i) => m.set(p.index, i + 1))
    return m
  }, [points])
  const fails = Object.entries(failed ?? {})

  const head = (key: SortKey, label: string, cls = '') => (
    <th
      className={`py-1.5 pr-2 text-left font-medium ${cls}`}
      aria-sort={!print && sort === key ? (desc ? 'descending' : 'ascending') : undefined}
    >
      {print ? (
        label
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-[var(--ink)]"
          onClick={() => (sort === key ? setDesc((d) => !d) : (setSort(key), setDesc(true)))}
        >
          {label}
          {sort === key && (
            <Icon name="chevronDown" size={10} className={desc ? '' : 'rotate-180'} />
          )}
        </button>
      )}
    </th>
  )
  const fs = print ? 'text-[10.5px]' : 'text-xs'

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${fs}`} data-testid="batch-rank-table">
        <thead>
          <tr className="border-b border-[var(--ink)] text-[var(--ink-3)]">
            {head('score', '名次', 'whitespace-nowrap')}
            {head('index', '点位')}
            <th className="py-1.5 pr-2 text-left font-medium">地址</th>
            <th className="py-1.5 pr-2 text-right font-medium">分数</th>
            <th
              className="py-1.5 pr-1 text-right font-medium text-[var(--vermilion)]"
              title="最近菜市场步行分钟"
            >
              菜
            </th>
            <th
              className="py-1.5 pr-1 text-right font-medium text-[var(--vermilion)]"
              title="最近药店步行分钟"
            >
              药
            </th>
            <th
              className="py-1.5 pr-1 text-right font-medium text-[var(--vermilion)]"
              title="最近小学步行分钟"
            >
              学
            </th>
            <th
              className="py-1.5 text-right font-medium"
              title="15 分钟圈内仍缺硬指标的 200 m 网格数"
            >
              盲区
            </th>
            {onOpen && !print && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const on = selected === p.index
            const color = GRADE_COLOR[p.overallGrade]
            return (
              <tr
                key={p.index}
                className={`border-b border-[var(--line)] ${onSelect && !print ? 'cursor-pointer hover:bg-[var(--paper-2)]' : ''} ${
                  on ? 'bg-[var(--teal-tint)]' : ''
                }`}
                onClick={onSelect && !print ? () => onSelect(p.index) : undefined}
                aria-selected={on}
                data-testid="batch-rank-row"
              >
                <td className="figure py-1.5 pr-2 text-[var(--ink-3)]">{rankOf.get(p.index)}</td>
                <td className="figure whitespace-nowrap py-1.5 pr-2">第 {p.index + 1} 点</td>
                <td className="py-1.5 pr-2 text-[var(--ink)]" title={p.address}>
                  {shortPointAddress(p.address, print ? 18 : 12)}
                </td>
                <td className="figure py-1.5 pr-2 text-right font-semibold" style={{ color }}>
                  {p.overallScore}
                  <span className="ml-0.5 text-[10px] font-normal">{p.overallGrade}</span>
                </td>
                <Min v={p.essentialWalkMin.market} />
                <Min v={p.essentialWalkMin.pharmacy} />
                <Min v={p.essentialWalkMin.primary_school} />
                <td
                  className={`figure py-1.5 text-right ${p.blindInIso > 0 ? 'text-[var(--ochre)]' : 'text-[var(--ink-3)]'}`}
                >
                  {p.blindInIso}
                </td>
                {onOpen && !print && (
                  <td className="py-1 pl-1 text-right">
                    <button
                      type="button"
                      className="btn !min-h-6 !px-1.5 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpen(p.index)
                      }}
                      aria-label={`看第 ${p.index + 1} 点完整报告`}
                    >
                      报告
                    </button>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {fails.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-[var(--vermilion)]">
          {fails.map(([i, msg]) => (
            <li key={i} className="break-words">
              第 {Number(i) + 1} 点失败：{msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Min({ v }: { v: number | null }) {
  const bad = v == null || v > 15
  return (
    <td
      className={`figure py-1.5 pr-1 text-right ${bad ? 'font-semibold text-[var(--vermilion)]' : 'text-[var(--ink)]'}`}
    >
      {v == null ? '无' : `${v < 1 ? '<1' : Math.round(v)}′`}
    </td>
  )
}
