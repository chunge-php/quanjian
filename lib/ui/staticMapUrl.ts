/**
 * 从体检报告生成 /api/staticmap 请求地址（浏览器端，不含 AK）。
 * 内容：三环等时圈（15′ → 10′ → 5′）+ 中心点 + 圈内硬指标设施标记。
 */
import type { HealthReport, LngLat } from '@/lib/types'
import { ESSENTIAL_CATEGORIES } from '@/lib/categories'

export const STATIC_MAP_MAX_POIS = 30

const fmt = (p: LngLat) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`

export interface StaticMapOptions {
  w?: number
  h?: number
  /** 中心点大标记上的字母（对比模式 A / B） */
  label?: string
}

/** 三环路径参数：外环 → 内环，每环首尾闭合 */
export function ringsParam(report: HealthReport): string {
  return report.isochrone.rings
    .slice()
    .sort((a, b) => b.minutes - a.minutes)
    .map((r) => {
      const ring = r.polygon.coordinates[0] ?? []
      const pts = ring.map(([lng, lat]) => fmt({ lng, lat }))
      if (pts.length && pts[0] !== pts[pts.length - 1]) pts.push(pts[0])
      return pts.join(';')
    })
    .filter(Boolean)
    .join('|')
}

/** 圈内硬指标设施（按步行时间由近到远，最多 30 个） */
export function essentialPoisParam(report: HealthReport): string {
  const ess = new Set<string>(ESSENTIAL_CATEGORIES)
  return report.pois
    .filter((p) => p.inIsochrone && ess.has(p.category))
    .sort((a, b) => (a.walkSec ?? 1e9) - (b.walkSec ?? 1e9))
    .slice(0, STATIC_MAP_MAX_POIS)
    .map((p) => fmt(p.location))
    .join(';')
}

export function staticMapUrl(report: HealthReport, opts: StaticMapOptions = {}): string {
  const q = new URLSearchParams()
  q.set('center', fmt(report.center))
  const rings = ringsParam(report)
  if (rings) q.set('rings', rings)
  const pois = essentialPoisParam(report)
  if (pois) q.set('pois', pois)
  q.set('w', String(opts.w ?? 800))
  q.set('h', String(opts.h ?? 560))
  if (opts.label) q.set('label', opts.label)
  return `/api/staticmap?${q.toString()}`
}
