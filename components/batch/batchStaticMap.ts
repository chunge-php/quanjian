/**
 * 街道体检打印用静态图地址（浏览器端，不含 AK）：
 * center + 一条范围路径（圆 36 点 / 矩形 4 角）+ 每个点一个 marker（markerStyles=s,,0x<评级色>）。
 * 同时带 pois=（当前 /api/staticmap 只认 center/rings/pois，能先出图；后端支持 markers 后自动生效）。
 */
import type { BatchReport, LngLat } from '@/lib/types'
import { GRADE_COLOR } from '@/lib/ui/theme'
import { areaCenter, circlePolygon, rectPolygon } from '@/components/batch/batchGeo'

const fmt = (p: LngLat) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`

export const BATCH_MAP_SIZE = { w: 800, h: 440 } as const

export function batchStaticMapUrl(report: BatchReport, size = BATCH_MAP_SIZE): string {
  const q = new URLSearchParams()
  const area = report.area
  q.set('center', fmt(areaCenter(area)))
  const ring =
    area.kind === 'circle'
      ? circlePolygon(area.center, area.radiusM, 36)
      : rectPolygon(area.sw, area.ne)
  const path = [...ring, ring[0]].map(fmt).join(';')
  q.set('rings', path)
  q.set('pois', report.points.map((p) => fmt(p.center)).join(';'))
  q.set('markers', report.points.map((p) => fmt(p.center)).join('|'))
  q.set(
    'markerStyles',
    report.points.map((p) => `s,,0x${GRADE_COLOR[p.overallGrade].slice(1)}`).join('|')
  )
  q.set('w', String(size.w))
  q.set('h', String(size.h))
  return `/api/staticmap?${q.toString()}`
}
