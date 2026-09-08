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
  const imgRef = useRef<HTMLImageElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => chart.resize()) : null
    ro?.observe(el)
    // 打印：先按 A4 内容宽把图重绘成固定尺寸，再导出成图片交给 <img> 打印。
    // 直接打印 canvas 在隐藏页签（display:none）里会被压成 0 宽，图片不受布局影响。
    const before = () => {
      chart.resize({ width: 680, height })
      try {
        const url = chart.getDataURL({ pixelRatio: 2, backgroundColor: 'transparent' })
        if (imgRef.current) imgRef.current.src = url
      } catch {
        /* 导出失败就退回打印 canvas */
      }
    }
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
    <>
      <div
        ref={ref}
        className={`echart-box ${className ?? ''}`}
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        alt={ariaLabel}
        className="echart-print print-only"
        style={{ aspectRatio: `680 / ${height}` }}
      />
    </>
  )
}
