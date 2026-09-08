'use client'
import { useMemo } from 'react'
import type { CategoryScore } from '@/lib/types'
import EChart from '@/components/report/EChart'
import { CHART, type EChartsOption } from '@/lib/ui/echarts'

/** 十类覆盖雷达：硬指标轴名用朱砂标出 */
export default function RadarChart({ categories }: { categories: CategoryScore[] }) {
  const option = useMemo<EChartsOption>(() => {
    const byKey = new Map(categories.map((c) => [c.label, c]))
    return {
      textStyle: { fontFamily: CHART.font },
      tooltip: {
        trigger: 'item',
        backgroundColor: CHART.paper,
        borderColor: CHART.ink,
        borderWidth: 1,
        textStyle: { color: CHART.ink, fontSize: 12 },
        formatter: () =>
          categories
            .map((c) => `${c.essential ? '▪ ' : '· '}${c.label} <b>${c.score}</b> ${c.grade}`)
            .join('<br/>'),
      },
      radar: {
        radius: '68%',
        center: ['50%', '52%'],
        splitNumber: 4,
        shape: 'polygon',
        axisName: {
          formatter: (name?: string) => {
            const c = name ? byKey.get(name) : undefined
            return c?.essential ? `{e|${name}}` : `{n|${name}}`
          },
          rich: {
            e: { color: CHART.vermilion, fontSize: 11, fontWeight: 600 },
            n: { color: CHART.ink2, fontSize: 11 },
          },
        },
        splitLine: { lineStyle: { color: CHART.line, width: 1 } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: CHART.line } },
        indicator: categories.map((c) => ({ name: c.label, max: 100 })),
      },
      series: [
        {
          type: 'radar',
          symbol: 'rect',
          symbolSize: 5,
          lineStyle: { color: CHART.teal, width: 2 },
          itemStyle: { color: CHART.teal },
          areaStyle: { color: CHART.tealSoft },
          data: [{ value: categories.map((c) => c.score), name: '覆盖得分' }],
        },
      ],
    }
  }, [categories])

  return <EChart option={option} height={250} ariaLabel="十类民生设施覆盖得分雷达图" />
}
