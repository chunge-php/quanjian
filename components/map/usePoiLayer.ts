'use client'
import { useEffect, useRef } from 'react'
import type { LngLat, Poi } from '@/lib/types'
import { categoryMarkerUrl, centerMarkerUrl, ESSENTIAL_SET } from '@/lib/ui/theme'

/** POI 标记：硬指标类别更醒目；圈外淡显；点击回传 */
export function usePoiLayer(
  map: BMapGL.Map | null,
  pois: Poi[] | null,
  onSelect: (poi: Poi) => void
) {
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !pois) return
    const overlays: BMapGL.Overlay[] = []
    const iconCache = new Map<string, BMapGL.Icon>()
    const getIcon = (poi: Poi) => {
      const essential = ESSENTIAL_SET.has(poi.category)
      const key = `${poi.category}-${essential}-${poi.inIsochrone}`
      let icon = iconCache.get(key)
      if (!icon) {
        const size = essential ? 30 : 24
        icon = new B.Icon(
          categoryMarkerUrl(poi.category, { essential, dim: !poi.inIsochrone }),
          new B.Size(size, size),
          {
            anchor: new B.Size(size / 2, size / 2),
          }
        )
        iconCache.set(key, icon)
      }
      return icon
    }
    // 先画非硬指标，再画硬指标，保证硬指标压在上层
    const ordered = pois
      .slice()
      .sort((a, b) => Number(ESSENTIAL_SET.has(a.category)) - Number(ESSENTIAL_SET.has(b.category)))
    for (const poi of ordered) {
      const marker = new B.Marker(new B.Point(poi.location.lng, poi.location.lat), {
        icon: getIcon(poi),
        title: poi.name,
      })
      marker.addEventListener('click', () => onSelectRef.current(poi))
      map.addOverlay(marker)
      overlays.push(marker)
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, pois])
}

/** 中心点标记：可拖动，拖完回传新坐标 */
export function useCenterMarker(
  map: BMapGL.Map | null,
  center: LngLat | null,
  onDragEnd: (p: LngLat) => void,
  /** 对比模式：A 青 / B 赭，圈里带字母；不传 = 单点朱砂 */
  slot?: 'A' | 'B',
  /** 是否允许拖动（街道体检模式下关闭，拖动会误触发单点分析） */
  draggable = true
) {
  const cbRef = useRef(onDragEnd)
  cbRef.current = onDragEnd
  const markerRef = useRef<BMapGL.Marker | null>(null)

  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B) return
    const icon = new B.Icon(centerMarkerUrl(slot), new B.Size(44, 44), {
      anchor: new B.Size(22, 22),
    })
    const marker = new B.Marker(new B.Point(center?.lng ?? 0, center?.lat ?? 0), {
      icon,
      enableDragging: draggable,
      title: slot ? `${slot} 中心点（可拖动）` : '分析中心点（可拖动）',
    })
    marker.addEventListener('dragend', () => {
      const p = marker.getPosition()
      if (p) cbRef.current({ lng: p.lng, lat: p.lat })
    })
    map.addOverlay(marker)
    if (!center) marker.hide()
    markerRef.current = marker
    return () => {
      map.removeOverlay(marker)
      markerRef.current = null
    }
    // 只在 map / 槽位样式变化时重建，位置变化走 setPosition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, slot, draggable])

  useEffect(() => {
    const B = window.BMapGL
    const marker = markerRef.current
    if (!B || !marker) return
    if (!center) {
      marker.hide()
      return
    }
    marker.setPosition(new B.Point(center.lng, center.lat))
    marker.show()
  }, [center, map])
}
