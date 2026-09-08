'use client'
import { useEffect } from 'react'
import type { Isochrone } from '@/lib/types'
import { MAP_OVERLAY, RING_STYLE, sampleDotUrl, sampleShade } from '@/lib/ui/theme'

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

/** 采样点：算等时圈用的探测点，颜色深浅 = 步行分钟，用来核对圈的形状 */
export function useSampleLayer(map: BMapGL.Map | null, isochrone: Isochrone | null, show: boolean) {
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !isochrone || !show) return
    const overlays: BMapGL.Overlay[] = []
    const icons = new Map<string, BMapGL.Icon>()
    const iconFor = (shade: number | null) => {
      const key = String(shade)
      let ic = icons.get(key)
      if (!ic) {
        ic = new B.Icon(sampleDotUrl(shade), new B.Size(10, 10), { anchor: new B.Size(5, 5) })
        icons.set(key, ic)
      }
      return ic
    }
    for (const s of isochrone.samples) {
      const m = new B.Marker(new B.Point(s.point.lng, s.point.lat), {
        icon: iconFor(sampleShade(s.walkSec)),
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
