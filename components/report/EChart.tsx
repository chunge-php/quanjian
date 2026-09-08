'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { echarts, type EChartsOption } from '@/lib/ui/echarts'

interface Props {
  option: EChartsOption
  height: number
  className?: string
  ariaLabel: string
}

/** 打印用图片的固定绘制宽度（A4 内容区 ≈ 680px） */
const PRINT_W = 680

/**
 * ECharts 容器：按需引入、ResizeObserver 自适应。
 *
 * 打印策略：屏幕上的 canvas 在隐藏页签里没有尺寸、在 Chrome 打印时又来不及重绘，
 * 所以另起一个挂在 document.body 上的离屏实例（固定 680 宽），每次 option 变化绘制完成后
 * 立刻导出成图片放进 <img class="echart-print">。打印样式隐藏 canvas、显示这张图，
 * 图片在打印之前就已经准备好，不依赖 beforeprint 时机。
 */
export default function EChart({ option, height, className, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const offRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const offChartRef = useRef<echarts.ECharts | null>(null)
  const [printSrc, setPrintSrc] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // 屏幕实例
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => chart.resize()) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  // 离屏实例（portal 到 body，不受隐藏父级影响）
  useEffect(() => {
    const el = offRef.current
    if (!mounted || !el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas', width: PRINT_W, height })
    offChartRef.current = chart
    return () => {
      chart.dispose()
      offChartRef.current = null
    }
  }, [mounted, height])

  useEffect(() => {
    const chart = offChartRef.current
    if (!chart) return
    let done = false
    const finish = () => {
      if (done) return
      done = true
      chart.off('finished', finish)
      try {
        setPrintSrc(chart.getDataURL({ pixelRatio: 2, backgroundColor: 'transparent' }))
      } catch {
        /* 导出失败则打印时退回 canvas */
      }
    }
    chart.on('finished', finish)
    chart.setOption({ ...option, animation: false }, { notMerge: true })
    // 兜底：某些版本不触发 finished
    const t = window.setTimeout(finish, 300)
    return () => {
      window.clearTimeout(t)
      chart.off('finished', finish)
    }
  }, [option, mounted, height])

  return (
    <>
      <div
        ref={ref}
        className={`echart-box ${printSrc ? 'has-print' : ''} ${className ?? ''}`}
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
      />
      {printSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={printSrc}
          alt={ariaLabel}
          className="echart-print print-only"
          style={{ aspectRatio: `${PRINT_W} / ${height}` }}
        />
      )}
      {mounted &&
        createPortal(
          <div
            ref={offRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              left: -10000,
              top: 0,
              width: PRINT_W,
              height,
              pointerEvents: 'none',
              opacity: 0,
            }}
          />,
          document.body
        )}
    </>
  )
}
