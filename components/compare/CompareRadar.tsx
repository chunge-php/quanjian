'use client'
import { useMemo } from 'react'
import type { Comparison } from '@/lib/ui/compare'
import { SLOT_HEX, SLOT_SOFT } from '@/lib/ui/compare'
import EChart from '@/components/report/EChart'
import { CHART, type EChartsOption } from '@/lib/ui/echarts'
import { SlotChip } from '@/components/compare/SlotChip'

/** 十类覆盖雷达：A 青 B 赭两条线叠加 */
export default function CompareRadar({ c }: { c: Comparison }) {
  const option = useMemo<EChartsOption>(() => {
    const byLabel = new Map(c.rows.map((r) => [r.label, r]))
    return {
      textStyle: { fontFamily: CHART.font },
      tooltip: {
        trigger: 'item',
        backgroundColor: CHART.paper,
        borderColor: CHART.ink,
        borderWidth: 1,
        textStyle: { color: CHART.ink, fontSize: 12 },
        formatter: (params: unknown) => {
          const one = Array.isArray(params) ? params[0] : params
          const name = (one as { name?: string } | undefined)?.name
          const slot = name === 'B' ? 'B' : 'A'
          return (
            `<b>${slot}</b><br/>` +
            c.rows
              .map((r) => {
                const s = slot === 'A' ? r.a : r.b
                return `${r.essential ? '▪ ' : '· '}${r.label} <b>${s.score}</b> ${s.grade}`
              })
              .join('<br/>')
          )
        },
      },
      radar: {
        radius: '66%',
        center: ['50%', '52%'],
        splitNumber: 4,
        shape: 'polygon',
        axisName: {
          formatter: (name?: string) => {
            const r = name ? byLabel.get(name) : undefined
            return r?.essential ? `{e|${name}}` : `{n|${name}}`
          },
          rich: {
            e: { color: CHART.vermilion, fontSize: 11, fontWeight: 600 },
            n: { color: CHART.ink2, fontSize: 11 },
          },
        },
        splitLine: { lineStyle: { color: CHART.line, width: 1 } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: CHART.line } },
        indicator: c.rows.map((r) => ({ name: r.label, max: 100 })),
      },
      series: [
        {
          type: 'radar',
          symbol: 'rect',
          symbolSize: 5,
          data: [
            {
              name: 'A',
              value: c.rows.map((r) => r.a.score),
              lineStyle: { color: SLOT_HEX.A, width: 2 },
              itemStyle: { color: SLOT_HEX.A },
              areaStyle: { color: SLOT_SOFT.A },
            },
            {
              name: 'B',
              value: c.rows.map((r) => r.b.score),
              lineStyle: { color: SLOT_HEX.B, width: 2, type: 'dashed' },
              itemStyle: { color: SLOT_HEX.B },
              areaStyle: { color: SLOT_SOFT.B },
            },
          ],
        },
      ],
    }
  }, [c])

  return (
    <div>
      <EChart option={option} height={250} ariaLabel="A 与 B 十类设施覆盖得分雷达叠加图" />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-2)]">
        <span className="flex items-center gap-1.5">
          <SlotChip slot="A" size={14} />
          <span className="inline-block h-0.5 w-5" style={{ background: SLOT_HEX.A }} />
          {c.nameA}
        </span>
        <span className="flex items-center gap-1.5">
          <SlotChip slot="B" size={14} />
          <span
            className="inline-block h-0 w-5 border-t-2 border-dashed"
            style={{ borderColor: SLOT_HEX.B }}
          />
          {c.nameB}
        </span>
      </div>
    </div>
  )
}
