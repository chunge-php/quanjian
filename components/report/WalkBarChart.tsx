'use client'
import { useMemo } from 'react'
import type { CategoryScore } from '@/lib/types'
import EChart from '@/components/report/EChart'
import { CHART, type EChartsOption } from '@/lib/ui/echarts'

const CAP = 30

/** 各类别最近步行分钟：横向柱，15 分钟参考线；无设施画到刻度末端并标"圈内无" */
export default function WalkBarChart({ categories }: { categories: CategoryScore[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = categories
      .slice()
      .sort((a, b) => (b.nearestWalkMin ?? 1e9) - (a.nearestWalkMin ?? 1e9))
    const maxVal = Math.max(20, ...sorted.map((c) => Math.min(CAP, c.nearestWalkMin ?? 0))) + 4
    return {
      textStyle: { fontFamily: CHART.font },
      grid: { left: 8, right: 44, top: 16, bottom: 22, containLabel: true },
      tooltip: {
        trigger: 'item',
        backgroundColor: CHART.paper,
        borderColor: CHART.ink,
        borderWidth: 1,
        textStyle: { color: CHART.ink, fontSize: 12 },
        formatter: (p: unknown) => {
          const { dataIndex } = p as { dataIndex: number }
          const c = sorted[dataIndex]
          return c.nearestWalkMin == null
            ? `${c.label}：15 分钟圈内无`
            : `${c.label}：最近 ${c.nearest?.name ?? ''}<br/>步行 <b>${c.nearestWalkMin}</b> 分钟`
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
        data: sorted.map((c) => c.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: CHART.line } },
        axisLabel: {
          fontSize: 11,
          formatter: (v: string) =>
            sorted.find((c) => c.label === v)?.essential ? `{e|${v}}` : `{n|${v}}`,
          rich: {
            e: { color: CHART.vermilion, fontWeight: 600, fontSize: 11 },
            n: { color: CHART.ink2, fontSize: 11 },
          },
        },
      },
      series: [
        {
          type: 'bar',
          barWidth: 12,
          data: sorted.map((c) => {
            const v = c.nearestWalkMin
            const none = v == null
            const val = none ? maxVal - 2 : Math.min(CAP, v)
            const color = none
              ? CHART.line
              : v <= 15
                ? CHART.teal
                : v <= 22
                  ? CHART.ochre
                  : CHART.vermilion
            return {
              value: val,
              itemStyle: {
                color,
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
                position: 'right',
                fontSize: 11,
                color: none ? CHART.ink3 : color,
                fontWeight: 600,
                formatter: none ? '圈内无' : v > CAP ? `${v}′ ▸` : `${v}′`,
              },
            }
          }),
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
      ],
    }
  }, [categories])

  return (
    <EChart
      option={option}
      height={Math.max(220, categories.length * 24 + 40)}
      ariaLabel="各类设施最近步行分钟柱状图，15 分钟参考线"
    />
  )
}
