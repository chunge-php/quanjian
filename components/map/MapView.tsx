'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlindSpotCell, Isochrone, LngLat, Poi } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { useBaiduMap, eventLngLat } from '@/components/map/useBaiduMap'
import { useIsochroneLayer, useSampleLayer } from '@/components/map/useIsochroneLayer'
import { useCenterMarker, usePoiLayer } from '@/components/map/usePoiLayer'
import { useBlindSpotLayer, type CellHover } from '@/components/map/useBlindSpotLayer'
import MapLegend from '@/components/map/MapLegend'
import PoiCard from '@/components/map/PoiCard'
import BlindSpotTip from '@/components/map/BlindSpotTip'

export interface MapViewProps {
  center: LngLat | null
  isochrone: Isochrone | null
  pois: Poi[] | null
  blindSpots: BlindSpotCell[] | null
  showSamples: boolean
  /** 右侧抽屉占用宽度（桌面），用于 setViewport 留边 */
  rightInset: number
  bottomInset: number
  /** 每次变化触发一次视野适配 */
  fitKey: number
  onCenterChange: (p: LngLat, source: 'click' | 'drag') => void
  onStatus?: (status: 'loading' | 'ready' | 'error', error?: string) => void
}

export default function MapView(props: MapViewProps) {
  const {
    center,
    isochrone,
    pois,
    blindSpots,
    showSamples,
    rightInset,
    bottomInset,
    fitKey,
    onCenterChange,
    onStatus,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, status, error } = useBaiduMap(containerRef, center)
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null)
  const [hover, setHover] = useState<CellHover | null>(null)
  const [bounds, setBounds] = useState({ w: 0, h: 0 })
  const centerChangeRef = useRef(onCenterChange)
  centerChangeRef.current = onCenterChange

  useEffect(() => {
    onStatus?.(status, error ?? undefined)
  }, [status, error, onStatus])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setBounds({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 地图点击设中心点
  useEffect(() => {
    if (!map) return
    const handler = (e: BMapGL.MapEvent) => {
      const p = eventLngLat(e)
      if (p) centerChangeRef.current(p, 'click')
    }
    map.addEventListener('click', handler)
    return () => map.removeEventListener('click', handler)
  }, [map])

  useIsochroneLayer(map, isochrone)
  useSampleLayer(map, isochrone, showSamples)
  useBlindSpotLayer(map, blindSpots, containerRef, setHover)
  usePoiLayer(map, pois, setSelectedPoi)
  useCenterMarker(
    map,
    center,
    useCallback((p: LngLat) => centerChangeRef.current(p, 'drag'), [])
  )

  // 选中的 POI 若已不在列表里（重新分析），关闭信息条
  useEffect(() => {
    setSelectedPoi((cur) => (cur && pois?.some((p) => p.uid === cur.uid) ? cur : null))
  }, [pois])

  // 视野适配：等时圈出来后一次性 fit
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !isochrone || fitKey === 0) return
    const ring = isochrone.rings.find((r) => r.minutes === 15) ?? isochrone.rings[0]
    if (!ring) return
    const pts = ring.polygon.coordinates[0].map(([lng, lat]) => new B.Point(lng, lat))
    try {
      map.setViewport(pts, {
        margins: [72, 24 + rightInset, 24 + bottomInset, 24],
        enableAnimation: true,
      })
    } catch {
      map.setCenter(new B.Point(isochrone.center.lng, isochrone.center.lat))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])

  // 中心点变化（无等时圈时）→ 平移过去
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !center) return
    map.panTo(new B.Point(center.lng, center.lat))
  }, [map, center])

  return (
    <div className="map-root absolute inset-0">
      <div
        ref={containerRef}
        className="map-canvas absolute inset-0 bg-[var(--paper-2)]"
        aria-label="地图：点击任意位置设为分析中心点"
      />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="blink text-sm text-[var(--ink-3)]">地图加载中…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md border border-[var(--vermilion)] bg-[var(--paper)] p-5">
            <p className="flex items-center gap-2 font-medium text-[var(--vermilion)]">
              <Icon name="alert" size={18} />
              地图无法显示
            </p>
            <p className="mt-2 text-sm text-[var(--ink-2)]">{error}</p>
            <p className="mt-2 text-xs text-[var(--ink-3)]">
              报告仍可通过样例数据查看（右侧抽屉）。
            </p>
          </div>
        </div>
      )}
      {status === 'ready' && (
        <MapLegend hasBlindSpots={!!blindSpots && blindSpots.length > 0} rightInset={rightInset} />
      )}
      {selectedPoi && <PoiCard poi={selectedPoi} onClose={() => setSelectedPoi(null)} />}
      {hover && <BlindSpotTip hover={hover} bounds={bounds} />}
    </div>
  )
}
