'use client'
import { useEffect } from 'react'
import type { Isochrone } from '@/lib/types'
import { MAP_OVERLAY, RING_STYLE, sampleDotUrl } from '@/lib/ui/theme'

/** 三环等时圈：15 分钟最外、5 分钟最内，先画外环再画内环，透明度叠加成热力渐变 */
export function useIsochroneLayer(map: BMapGL.Map | null, isochrone: Isochrone | null) {
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !isochrone) return
    const overlays: BMapGL.Overlay[] = []
    const rings = isochrone.rings.slice().sort((a, b) => b.minutes - a.minutes)
    for (const ring of rings) {
      const style = RING_STYLE[ring.minutes]
      const pts = ring.polygon.coordinates[0].map(([lng, lat]) => new B.Point(lng, lat))
      const poly = new B.Polygon(pts, {
        strokeColor: MAP_OVERLAY.teal,
        strokeWeight: style.strokeWeight,
        strokeOpacity: style.strokeOpacity,
        fillColor: MAP_OVERLAY.teal,
        fillOpacity: style.fillOpacity,
        enableClicking: false,
      })
      map.addOverlay(poly)
      overlays.push(poly)
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, isochrone])
}

/** 调试：等时圈采样点 */
export function useSampleLayer(map: BMapGL.Map | null, isochrone: Isochrone | null, show: boolean) {
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !isochrone || !show) return
    const overlays: BMapGL.Overlay[] = []
    const okIcon = new B.Icon(sampleDotUrl(true), new B.Size(8, 8), { anchor: new B.Size(4, 4) })
    const badIcon = new B.Icon(sampleDotUrl(false), new B.Size(8, 8), { anchor: new B.Size(4, 4) })
    for (const s of isochrone.samples) {
      const m = new B.Marker(new B.Point(s.point.lng, s.point.lat), {
        icon: s.walkSec == null ? badIcon : okIcon,
        title:
          s.walkSec == null
            ? `${s.bearingDeg}° ${s.radiusM} m · 不可达`
            : `${s.bearingDeg}° ${s.radiusM} m · ${Math.round(s.walkSec / 60)} 分钟`,
      })
      map.addOverlay(m)
      overlays.push(m)
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, isochrone, show])
}
