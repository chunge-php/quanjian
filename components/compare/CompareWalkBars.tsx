'use client'
import { useMemo } from 'react'
import type { Comparison } from '@/lib/ui/compare'
import { SLOT_HEX } from '@/lib/ui/compare'
import EChart from '@/components/report/EChart'
import { CHART, type EChartsOption } from '@/lib/ui/echarts'
import { SlotChip } from '@/components/compare/SlotChip'

const CAP = 30

/**
 * 最近步行分钟分组横向柱：每个类别两根柱（A 青 / B 赭），15 分钟朱砂参考线；
 * 周边没有的画到刻度末端并打斜纹标「无」。
 */
export default function CompareWalkBars({ c }: { c: Comparison }) {
  const option = useMemo<EChartsOption>(() => {
    const rows = c.rows
      .slice()
      .sort(
        (x, y) =>
          Math.max(y.a.nearestWalkMin ?? 1e9, y.b.nearestWalkMin ?? 1e9) -
          Math.max(x.a.nearestWalkMin ?? 1e9, x.b.nearestWalkMin ?? 1e9)
      )
    const all = rows.flatMap((r) => [r.a.nearestWalkMin ?? 0, r.b.nearestWalkMin ?? 0])
    const maxVal = Math.max(20, ...all.map((v) => Math.min(CAP, v))) + 4
    const series = (slot: 'A' | 'B') => ({
      name: slot,
      type: 'bar' as const,
      barWidth: 9,
      barGap: '25%',
      data: rows.map((r) => {
        const v = slot === 'A' ? r.a.nearestWalkMin : r.b.nearestWalkMin
        const none = v == null
        const color = SLOT_HEX[slot]
        return {
          value: none ? maxVal - 2 : Math.min(CAP, v),
          itemStyle: {
            color: none ? CHART.line : color,
            decal: none
              ? {
                  symbol: 'rect',
                  dashArrayX: [1, 0],
                  dashArrayY: [2, 3],
                  rotation: Math.PI / 4,
                  color: CHART.ink3,
                }
              : undefined,
          },
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            fontWeight: 600 as const,
            color: none ? CHART.ink3 : color,
            formatter: none ? '无' : v > CAP ? `${Math.round(v)}′ ▸` : `${Math.round(v)}′`,
          },
        }
      }),
    })
    return {
      textStyle: { fontFamily: CHART.font },
      grid: { left: 8, right: 44, top: 28, bottom: 22, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: CHART.paper,
        borderColor: CHART.ink,
        borderWidth: 1,
        textStyle: { color: CHART.ink, fontSize: 12 },
        formatter: (p: unknown) => {
          const list = p as { dataIndex: number }[]
          const r = rows[list[0]?.dataIndex ?? 0]
          if (!r) return ''
          const line = (s: 'A' | 'B') => {
            const x = s === 'A' ? r.a : r.b
            return x.nearestWalkMin == null
              ? `${s}：周边无`
              : `${s}：${x.nearest?.name ?? ''} <b>${Math.round(x.nearestWalkMin)}</b> 分钟`
          }
          return `<b>${r.label}</b><br/>${line('A')}<br/>${line('B')}`
        },
      },
      xAxis: {
        type: 'value',
        max: maxVal,
        axisLabel: { color: CHART.ink3, fontSize: 10, formatter: '{value}′' },
        splitLine: { lineStyle: { color: CHART.line, type: 'dashed' } },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: CHART.line } },
        axisLabel: {
          fontSize: 11,
          formatter: (v: string) =>
            rows.find((r) => r.label === v)?.essential ? `{e|${v}}` : `{n|${v}}`,
          rich: {
            e: { color: CHART.vermilion, fontWeight: 600, fontSize: 11 },
            n: { color: CHART.ink2, fontSize: 11 },
          },
        },
      },
      series: [
        {
          ...series('A'),
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: CHART.vermilion, type: 'solid', width: 1.5 },
            label: {
              position: 'end',
              formatter: '15 分钟',
              color: CHART.vermilion,
              fontSize: 10,
              fontWeight: 600,
            },
            data: [{ xAxis: 15 }],
          },
        },
        series('B'),
      ],
    }
  }, [c])

  return (
    <div>
      <EChart
        option={option}
        height={Math.max(260, c.rows.length * 34 + 40)}
        ariaLabel="A 与 B 各类设施最近步行分钟分组柱状图，15 分钟参考线"
      />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
        {(['A', 'B'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <SlotChip slot={s} size={14} />
            <span className="inline-block h-2 w-5" style={{ background: SLOT_HEX[s] }} />
            {s === 'A' ? c.nameA : c.nameB}
          </span>
        ))}
      </div>
    </div>
  )
}
