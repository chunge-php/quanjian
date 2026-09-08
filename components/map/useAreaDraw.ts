'use client'
/**
 * 街道体检 · 在地图上按住拖出矩形：mousedown → mousemove 实时画墨色虚线框 → mouseup 得到 sw/ne。
 * 对角线超过 RECT_MAX_DIAG_M 时回调 onTooBig，不落框。触屏用 touchstart/touchmove/touchend 同一套。
 */
import { useEffect, useRef } from 'react'
import type { LngLat } from '@/lib/types'
import { eventLngLat } from '@/components/map/useBaiduMap'
import { COLORS } from '@/lib/ui/theme'
import { RECT_MAX_DIAG_M, rectDiagonalM } from '@/components/batch/batchGeo'

/** JSAPI GL 有但本项目声明里没有的方法 */
interface DrawMap extends BMapGL.Map {
  disableDragging?: () => void
  disableDoubleClickZoom?: () => void
  enableDoubleClickZoom?: () => void
}

export function useAreaDraw(
  map: BMapGL.Map | null,
  active: boolean,
  onDone: (sw: LngLat, ne: LngLat) => void,
  onTooBig?: (diagM: number) => void
) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const tooBigRef = useRef(onTooBig)
  tooBigRef.current = onTooBig

  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !active) return
    const m = map as DrawMap
    let start: LngLat | null = null
    let poly: BMapGL.Polygon | null = null

    const corners = (a: LngLat, b: LngLat) => {
      const sw = { lng: Math.min(a.lng, b.lng), lat: Math.min(a.lat, b.lat) }
      const ne = { lng: Math.max(a.lng, b.lng), lat: Math.max(a.lat, b.lat) }
      return { sw, ne }
    }
    const rectPts = (a: LngLat, b: LngLat) => {
      const { sw, ne } = corners(a, b)
      return [
        new B.Point(sw.lng, sw.lat),
        new B.Point(ne.lng, sw.lat),
        new B.Point(ne.lng, ne.lat),
        new B.Point(sw.lng, ne.lat),
      ]
    }
    const clear = () => {
      if (poly) map.removeOverlay(poly)
      poly = null
      start = null
    }

    const onDown = (e: BMapGL.MapEvent) => {
      const p = eventLngLat(e)
      if (!p) return
      e.domEvent?.preventDefault?.()
      start = p
      poly = new B.Polygon(rectPts(p, p), {
        strokeColor: COLORS.ink,
        strokeWeight: 2,
        strokeOpacity: 0.9,
        strokeStyle: 'dashed',
        fillColor: COLORS.ink,
        fillOpacity: 0.06,
        enableClicking: false,
      })
      map.addOverlay(poly)
    }
    const onMove = (e: BMapGL.MapEvent) => {
      if (!start || !poly) return
      const p = eventLngLat(e)
      if (!p) return
      poly.setPath(rectPts(start, p))
      const diag = rectDiagonalM(start, p)
      poly.setStrokeWeight(diag > RECT_MAX_DIAG_M ? 3 : 2)
    }
    const onUp = (e: BMapGL.MapEvent) => {
      if (!start) return
      const p = eventLngLat(e) ?? start
      const { sw, ne } = corners(start, p)
      const diag = rectDiagonalM(sw, ne)
      clear()
      if (diag < 200) return // 只是点了一下，不算框
      if (diag > RECT_MAX_DIAG_M) {
        tooBigRef.current?.(diag)
        return
      }
      doneRef.current(sw, ne)
    }

    m.disableDragging?.()
    m.disableDoubleClickZoom?.()
    map.addEventListener('mousedown', onDown)
    map.addEventListener('mousemove', onMove)
    map.addEventListener('mouseup', onUp)
    map.addEventListener('touchstart', onDown)
    map.addEventListener('touchmove', onMove)
    map.addEventListener('touchend', onUp)
    return () => {
      map.removeEventListener('mousedown', onDown)
      map.removeEventListener('mousemove', onMove)
      map.removeEventListener('mouseup', onUp)
      map.removeEventListener('touchstart', onDown)
      map.removeEventListener('touchmove', onMove)
      map.removeEventListener('touchend', onUp)
      clear()
      try {
        m.enableDragging()
        m.enableDoubleClickZoom?.()
      } catch {
        /* 地图已销毁 */
      }
    }
  }, [map, active])
}
