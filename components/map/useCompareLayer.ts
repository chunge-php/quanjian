'use client'
import { useEffect } from 'react'
import type { Isochrone } from '@/lib/types'
import type { Slot } from '@/lib/ui/compare'
import { MAP_OVERLAY, RING_STYLE } from '@/lib/ui/theme'

const SLOT_OVERLAY: Record<Slot, string> = { A: MAP_OVERLAY.teal, B: MAP_OVERLAY.ochre }

/**
 * 对比模式等时圈：A 青 / B 赭。
 * 聚焦的槽位画 5/10/15 三环热力；未聚焦的只画 15 分钟外圈（虚线描边 + 淡填充），
 * 两个圈同屏也不打架。
 */
export function useCompareLayer(
  map: BMapGL.Map | null,
  isochrone: Isochrone | null,
  slot: Slot,
  focused: boolean
) {
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !isochrone) return
    const color = SLOT_OVERLAY[slot]
    const overlays: BMapGL.Overlay[] = []
    const rings = isochrone.rings
      .slice()
      .sort((a, b) => b.minutes - a.minutes)
      .filter((r) => focused || r.minutes === 15)
    for (const ring of rings) {
      const style = RING_STYLE[ring.minutes]
      const pts = ring.polygon.coordinates[0].map(([lng, lat]) => new B.Point(lng, lat))
      const poly = new B.Polygon(pts, {
        strokeColor: color,
        strokeWeight: focused ? style.strokeWeight : 2,
        strokeOpacity: focused ? style.strokeOpacity : 0.9,
        strokeStyle: focused ? 'solid' : 'dashed',
        fillColor: color,
        fillOpacity: focused ? style.fillOpacity : 0.06,
        enableClicking: false,
      })
      map.addOverlay(poly)
      overlays.push(poly)
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, isochrone, slot, focused])
}
