'use client'
import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '@/lib/types'
import { loadBaiduMap } from '@/lib/ui/loadBaiduMap'

export const DEFAULT_CENTER: LngLat = { lng: 106.2277, lat: 29.5921 }

export type MapStatus = 'loading' | 'ready' | 'error'

/** 初始化百度地图 GL 实例（禁用默认 POI 点击），返回 map 与状态。纸质调性由容器 CSS filter 实现（个性化样式需额外权限） */
export function useBaiduMap(
  containerRef: React.RefObject<HTMLDivElement>,
  initialCenter: LngLat | null
) {
  const [map, setMap] = useState<BMapGL.Map | null>(null)
  const [status, setStatus] = useState<MapStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const initialRef = useRef(initialCenter ?? DEFAULT_CENTER)

  useEffect(() => {
    let disposed = false
    let instance: BMapGL.Map | null = null
    const el = containerRef.current
    if (!el) return
    loadBaiduMap()
      .then((B) => {
        if (disposed) return
        instance = new B.Map(el, { enableMapClick: false, minZoom: 10, maxZoom: 19 })
        const c = initialRef.current
        instance.centerAndZoom(new B.Point(c.lng, c.lat), 15)
        instance.enableScrollWheelZoom(true)
        setMap(instance)
        setStatus('ready')
      })
      .catch((e: unknown) => {
        if (disposed) return
        setError(e instanceof Error ? e.message : '地图加载失败')
        setStatus('error')
      })
    return () => {
      disposed = true
      try {
        instance?.destroy()
      } catch {
        /* 已销毁 */
      }
      setMap(null)
    }
  }, [containerRef])

  return { map, status, error }
}

export function toPoint(B: typeof BMapGL, p: LngLat): BMapGL.Point {
  return new B.Point(p.lng, p.lat)
}

export function eventLngLat(e: BMapGL.MapEvent): LngLat | null {
  const p = e.latlng ?? e.latLng ?? e.point
  if (!p || typeof p.lng !== 'number' || typeof p.lat !== 'number') return null
  return { lng: p.lng, lat: p.lat }
}
