'use client'
import { useEffect, useRef } from 'react'
import { echarts, type EChartsOption } from '@/lib/ui/echarts'

interface Props {
  option: EChartsOption
  height: number
  className?: string
  ariaLabel: string
}

/** ECharts 容器：按需引入、ResizeObserver 自适应、打印前按 A4 宽度重绘 */
export default function EChart({ option, height, className, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => chart.resize()) : null
    ro?.observe(el)
    const before = () => chart.resize({ width: 680, height })
    const after = () => chart.resize({ width: 'auto', height: 'auto' })
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      ro?.disconnect()
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      chart.dispose()
      chartRef.current = null
    }
  }, [height])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return (
    <div
      ref={ref}
      className={`echart-box ${className ?? ''}`}
      style={{ height }}
      role="img"
      aria-label={ariaLabel}
    />
  )
}
