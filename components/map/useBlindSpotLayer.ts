'use client'
import { useEffect, useRef } from 'react'
import type { BlindSpotCell } from '@/lib/types'
import { blindSpotColor, blindSpotOpacity } from '@/lib/ui/theme'

export interface CellHover {
  cell: BlindSpotCell
  x: number
  y: number
}

/** 盲区网格：半透明灰红方块，severity 越高越红；hover 回传单元格与像素位置 */
export function useBlindSpotLayer(
  map: BMapGL.Map | null,
  cells: BlindSpotCell[] | null,
  containerRef: React.RefObject<HTMLDivElement>,
  onHover: (h: CellHover | null) => void
) {
  const hoverRef = useRef(onHover)
  hoverRef.current = onHover

  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !cells || cells.length === 0) return
    const overlays: BMapGL.Overlay[] = []
    const container = containerRef.current

    const pixelOf = (e: BMapGL.MapEvent): { x: number; y: number } => {
      const rect = container?.getBoundingClientRect()
      if (e.domEvent && rect)
        return { x: e.domEvent.clientX - rect.left, y: e.domEvent.clientY - rect.top }
      if (e.pixel) return { x: e.pixel.x, y: e.pixel.y }
      return { x: 0, y: 0 }
    }

    for (const cell of cells) {
      const half = cell.sizeM / 2
      const dLat = half / 111320
      const dLng = half / (111320 * Math.cos((cell.center.lat * Math.PI) / 180))
      const { lng, lat } = cell.center
      const pts = [
        new B.Point(lng - dLng, lat - dLat),
        new B.Point(lng + dLng, lat - dLat),
        new B.Point(lng + dLng, lat + dLat),
        new B.Point(lng - dLng, lat + dLat),
      ]
      const color = blindSpotColor(cell.severity)
      const poly = new B.Polygon(pts, {
        strokeColor: color,
        strokeWeight: cell.inIsochrone ? 1 : 0.5,
        strokeOpacity: cell.inIsochrone ? 0.55 : 0.3,
        fillColor: color,
        fillOpacity: blindSpotOpacity(cell.severity, cell.inIsochrone),
      })
      poly.addEventListener('mouseover', (e) => hoverRef.current({ cell, ...pixelOf(e) }))
      poly.addEventListener('mouseout', () => hoverRef.current(null))
      poly.addEventListener('click', (e) => hoverRef.current({ cell, ...pixelOf(e) }))
      map.addOverlay(poly)
      overlays.push(poly)
    }
    return () => {
      overlays.forEach((o) => map.removeOverlay(o))
      hoverRef.current(null)
    }
  }, [map, cells, containerRef])
}
