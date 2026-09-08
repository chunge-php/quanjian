'use client'
import { useEffect, useState } from 'react'
import type { HealthReport } from '@/lib/types'
import { staticMapUrl, type StaticMapOptions } from '@/lib/ui/staticMapUrl'

interface Props extends StaticMapOptions {
  report: HealthReport
  className?: string
  /** 图注；传 null 不显示 */
  caption?: string | null
}

export const MAP_SNAPSHOT_CAPTION =
  '实线为 15 / 10 / 5 分钟步行等时圈，红点为中心点，青点为硬指标设施'

/**
 * 地图快照：服务端代理的百度静态图（三环 + 中心 + 硬指标设施）。
 * 屏幕与打印都用这一张：屏幕上加载过一次，打印时浏览器缓存里一定有。加载失败整块隐藏。
 */
export default function MapSnapshot({ report, className = '', caption, w, h, label }: Props) {
  const src = staticMapUrl(report, { w, h, label })
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed) return null
  const width = w ?? 800
  const height = h ?? 560
  return (
    <figure className={`map-snapshot m-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={width}
        height={height}
        alt={`${report.address.formatted || '中心点'} 的 15 分钟等时圈地图快照`}
        className="block h-auto w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--paper-2)]"
        style={{ aspectRatio: `${width} / ${height}` }}
        onError={() => setFailed(true)}
      />
      {caption !== null && (
        <figcaption className="mt-1.5 text-[0.6875rem] leading-4 text-[var(--ink-3)]">
          {caption ?? MAP_SNAPSHOT_CAPTION}
        </figcaption>
      )}
    </figure>
  )
}
