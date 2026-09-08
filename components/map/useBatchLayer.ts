'use client'
/**
 * 街道体检地图层：范围轮廓（墨色虚线）+ 网格点圆标（直径按分数 18–28px，中间写分数，边框评级色）
 * + 可选热力（JSAPI GL 自带 HeatmapOverlay 则用之，否则用半透明同心圆渐变叠加）。
 */
import { useEffect, useRef } from 'react'
import type { BatchArea, BatchPointSummary, LngLat } from '@/lib/types'
import { COLORS, GRADE_COLOR, MAP_OVERLAY } from '@/lib/ui/theme'
import { areaPolygon, scoreDiameter } from '@/components/batch/batchGeo'

export interface BatchPointHover {
  index: number
  summary: BatchPointSummary | null
  failed: string | null
  x: number
  y: number
}

export interface BatchLayerInput {
  area: BatchArea | null
  points: LngLat[] | null
  summaries: Record<number, BatchPointSummary>
  failed: Record<number, string>
  selected: number | null
  heat: boolean
  /** 变化一次 = 把范围适配进视野一次 */
  fitKey: number
  insets: { right: number; bottom: number; left: number }
  onSelect: (index: number) => void
  onHover: (h: BatchPointHover | null) => void
}

/** 地图叠加层上的评级色（预加饱和抵消纸色滤镜） */
export const BATCH_GRADE_OVERLAY: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: MAP_OVERLAY.teal,
  B: '#4f8f34',
  C: MAP_OVERLAY.ochre,
  D: MAP_OVERLAY.vermilion,
}

/** 圆标 SVG：待测 = 灰空心；失败 = 朱砂虚线 ×；完成 = 评级色边 + 分数 */
export function batchMarkerUrl(
  s: BatchPointSummary | null,
  opts: { selected: boolean; failed: boolean }
): string {
  if (opts.failed) {
    const d = 20
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
      `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1.5}" fill="${COLORS.paper}" stroke="${MAP_OVERLAY.vermilion}" stroke-width="1.6" stroke-dasharray="3 2"/>` +
      `<path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="${MAP_OVERLAY.vermilion}" stroke-width="1.8" stroke-linecap="round"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  if (!s) {
    const d = 16
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
      `<circle cx="8" cy="8" r="6" fill="${COLORS.paper}" fill-opacity="0.7" stroke="${COLORS.ink3}" stroke-width="1.4" stroke-dasharray="2.5 2"/></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  const color = BATCH_GRADE_OVERLAY[s.overallGrade]
  const inner = scoreDiameter(s.overallScore)
  const d = inner + (opts.selected ? 12 : 4)
  const c = d / 2
  const fill = opts.selected ? color : COLORS.paper
  const text = opts.selected ? COLORS.paper : color
  const ring = opts.selected
    ? `<circle cx="${c}" cy="${c}" r="${c - 1.5}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 2"/>`
    : ''
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    ring +
    `<circle cx="${c}" cy="${c}" r="${inner / 2}" fill="${fill}" stroke="${color}" stroke-width="2.2"/>` +
    `<text x="${c}" y="${c + inner * 0.16}" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${Math.round(inner * 0.46)}" fill="${text}">${s.overallScore}</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

interface HeatmapCtor {
  new (opts: {
    radius: number
    opacity?: number
    gradient?: Record<string, string>
  }): BMapGL.Overlay & {
    setDataSet(d: { data: { lng: number; lat: number; count: number }[]; max: number }): void
  }
}

export function useBatchLayer(
  map: BMapGL.Map | null,
  containerRef: React.RefObject<HTMLDivElement>,
  input: BatchLayerInput | null
) {
  const selectRef = useRef(input?.onSelect)
  selectRef.current = input?.onSelect
  const hoverRef = useRef(input?.onHover)
  hoverRef.current = input?.onHover

  const area = input?.area ?? null
  const points = input?.points ?? null
  const summaries = input?.summaries
  const failed = input?.failed
  const selected = input?.selected ?? null
  const heat = input?.heat ?? false
  const fitKey = input?.fitKey ?? 0
  const spacingHint = points && points.length > 1 ? guessSpacing(points) : 500

  // 范围轮廓
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !area) return
    const style = {
      strokeColor: COLORS.ink,
      strokeWeight: 2,
      strokeOpacity: 0.85,
      strokeStyle: 'dashed' as const,
      fillColor: COLORS.ink,
      fillOpacity: 0.035,
      enableClicking: false,
    }
    const overlay =
      area.kind === 'circle'
        ? new B.Circle(new B.Point(area.center.lng, area.center.lat), area.radiusM, style)
        : new B.Polygon(
            areaPolygon(area).map((p) => new B.Point(p.lng, p.lat)),
            style
          )
    map.addOverlay(overlay)
    return () => map.removeOverlay(overlay)
  }, [map, area])

  // 网格点圆标
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !points || points.length === 0) return
    const container = containerRef.current
    const overlays: BMapGL.Overlay[] = []
    const pixelOf = (e: BMapGL.MapEvent) => {
      const rect = container?.getBoundingClientRect()
      if (e.domEvent && rect)
        return { x: e.domEvent.clientX - rect.left, y: e.domEvent.clientY - rect.top }
      if (e.pixel) return { x: e.pixel.x, y: e.pixel.y }
      return { x: 0, y: 0 }
    }
    points.forEach((p, index) => {
      const s = summaries?.[index] ?? null
      const fail = failed?.[index] ?? null
      const isSel = selected === index
      const url = batchMarkerUrl(s, { selected: isSel, failed: !!fail })
      const d = fail ? 20 : !s ? 16 : scoreDiameter(s.overallScore) + (isSel ? 12 : 4)
      const marker = new B.Marker(new B.Point(p.lng, p.lat), {
        icon: new B.Icon(url, new B.Size(d, d), { anchor: new B.Size(d / 2, d / 2) }),
        title: s
          ? `第 ${index + 1} 点 · ${s.overallScore} 分 · ${s.address}`
          : fail
            ? `第 ${index + 1} 点 · 失败：${fail}`
            : `第 ${index + 1} 点 · 待体检`,
      })
      marker.addEventListener('mouseover', (e) =>
        hoverRef.current?.({ index, summary: s, failed: fail, ...pixelOf(e) })
      )
      marker.addEventListener('mouseout', () => hoverRef.current?.(null))
      if (s) marker.addEventListener('click', () => selectRef.current?.(index))
      map.addOverlay(marker)
      overlays.push(marker)
    })
    return () => {
      overlays.forEach((o) => map.removeOverlay(o))
      hoverRef.current?.(null)
    }
  }, [map, containerRef, points, summaries, failed, selected])

  // 热力：优先原生 HeatmapOverlay，否则同心圆渐变
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !heat || !points || !summaries) return
    const done = points
      .map((p, i) => ({ p, s: summaries[i] }))
      .filter((x): x is { p: LngLat; s: BatchPointSummary } => !!x.s)
    if (done.length === 0) return
    const overlays: BMapGL.Overlay[] = []
    const Heat = (B as unknown as { HeatmapOverlay?: HeatmapCtor }).HeatmapOverlay
    if (Heat) {
      try {
        const h = new Heat({
          radius: 60,
          opacity: 0.55,
          gradient: { 0.2: MAP_OVERLAY.vermilion, 0.5: MAP_OVERLAY.ochre, 0.8: MAP_OVERLAY.teal },
        })
        map.addOverlay(h)
        h.setDataSet({ data: done.map(({ p, s }) => ({ ...p, count: s.overallScore })), max: 100 })
        overlays.push(h)
        return () => overlays.forEach((o) => map.removeOverlay(o))
      } catch {
        /* 退回同心圆 */
      }
    }
    const r0 = spacingHint * 0.62
    for (const { p, s } of done) {
      const color = BATCH_GRADE_OVERLAY[s.overallGrade]
      ;[1, 0.72, 0.42].forEach((k, i) => {
        const c = new B.Circle(new B.Point(p.lng, p.lat), r0 * k, {
          strokeWeight: 0,
          strokeOpacity: 0,
          fillColor: color,
          fillOpacity: 0.09 + i * 0.07,
          enableClicking: false,
        })
        map.addOverlay(c)
        overlays.push(c)
      })
    }
    return () => overlays.forEach((o) => map.removeOverlay(o))
  }, [map, heat, points, summaries, spacingHint])

  // 视野适配
  const insets = input?.insets
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !area || fitKey === 0) return
    const pts = areaPolygon(area).map((p) => new B.Point(p.lng, p.lat))
    try {
      map.setViewport(pts, {
        margins: [
          88,
          24 + (insets?.right ?? 0),
          24 + (insets?.bottom ?? 0),
          24 + (insets?.left ?? 0),
        ],
        enableAnimation: true,
      })
    } catch {
      /* 忽略 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])
}

/** 从网格点估计点距（最近两点距离） */
function guessSpacing(points: LngLat[]): number {
  const a = points[0]
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const dy = (points[i].lat - a.lat) * 111320
    const dx = (points[i].lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180)
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return Number.isFinite(best) && best > 50 ? best : 500
}
