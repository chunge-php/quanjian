'use client'
/**
 * 拟建设施图层：朱砂色虚线描边圆形标记 + 类别图标，与真实 POI（方形）一眼区分；
 * 外加 1 公里虚线圈（盲区判定半径），直观看到这一处能"擦掉"哪些盲区网格。
 * hover 高亮并提示"拟建 · 点击移除"，点击回调 onRemove(id)。
 */
import { useEffect, useRef } from 'react'
import type { FacilityCategory } from '@/lib/types'
import { CATEGORY_ICON, COLORS, MAP_OVERLAY } from '@/lib/ui/theme'
import { virtualLabel, type VirtualFacility } from '@/lib/ui/simulate'
import { DEFAULT_BLIND_RADIUS_M } from '@/lib/report/blindspot'

const SIZE = 34

/** 拟建标记 SVG data URL：纸底、朱砂虚线圆、朱砂图标；hover 时加一个 × 角标 */
export function virtualMarkerUrl(category: FacilityCategory, hover = false): string {
  const { paths, circles = [] } = CATEGORY_ICON[category]
  const r = SIZE / 2 - 2
  const inner = SIZE - 14
  const scale = inner / 24
  const offset = 7
  const stroke = MAP_OVERLAY.vermilion
  const body = `${paths.map((d) => `<path d="${d}"/>`).join('')}${circles
    .map(([cx, cy, rr]) => `<circle cx="${cx}" cy="${cy}" r="${rr}"/>`)
    .join('')}`
  const badge = hover
    ? `<circle cx="${SIZE - 6}" cy="6" r="5.5" fill="${stroke}"/>` +
      `<path d="M${SIZE - 8.5} 3.5l5 5M${SIZE - 3.5} 3.5l-5 5" stroke="${COLORS.paper}" stroke-width="1.6" stroke-linecap="round"/>`
    : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${r}" fill="${hover ? COLORS.paper2 : COLORS.paper}" stroke="${stroke}" stroke-width="2.2" stroke-dasharray="4 2.6"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    badge +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function useVirtualPoiLayer(
  map: BMapGL.Map | null,
  virtuals: VirtualFacility[],
  onRemove?: (id: string) => void
) {
  const removeRef = useRef(onRemove)
  removeRef.current = onRemove

  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || virtuals.length === 0) return
    const overlays: BMapGL.Overlay[] = []
    const iconCache = new Map<string, BMapGL.Icon>()
    const icon = (category: FacilityCategory, hover: boolean) => {
      const key = `${category}-${hover}`
      let i = iconCache.get(key)
      if (!i) {
        i = new B.Icon(virtualMarkerUrl(category, hover), new B.Size(SIZE, SIZE), {
          anchor: new B.Size(SIZE / 2, SIZE / 2),
        })
        iconCache.set(key, i)
      }
      return i
    }
    for (const v of virtuals) {
      const point = new B.Point(v.location.lng, v.location.lat)
      // 1 公里判定圈：淡朱砂虚线，不响应点击（放置模式下仍可在圈内继续点地图）
      const ring = new B.Circle(point, DEFAULT_BLIND_RADIUS_M, {
        strokeColor: MAP_OVERLAY.vermilion,
        strokeWeight: 1.2,
        strokeOpacity: 0.55,
        strokeStyle: 'dashed',
        fillColor: MAP_OVERLAY.vermilion,
        fillOpacity: 0.04,
        enableClicking: false,
      })
      map.addOverlay(ring)
      overlays.push(ring)

      const label = virtualLabel(v, virtuals)
      const marker = new B.Marker(point, {
        icon: icon(v.category, false),
        title: `${label} · 拟建 · 点击移除`,
      })
      marker.addEventListener('mouseover', () => marker.setIcon(icon(v.category, true)))
      marker.addEventListener('mouseout', () => marker.setIcon(icon(v.category, false)))
      marker.addEventListener('click', () => removeRef.current?.(v.id))
      map.addOverlay(marker)
      overlays.push(marker)
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, virtuals])
}
