import type { LngLat } from '@/lib/types'

export function fmtKm2(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return v >= 10 ? v.toFixed(1) : v.toFixed(2)
}

export function fmtMeters(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—'
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return '—'
  return min < 1 ? '<1' : String(Math.round(min))
}

export function fmtSecToMin(sec: number | null | undefined): number | null {
  if (sec == null || !Number.isFinite(sec)) return null
  return Math.round(sec / 60)
}

export function fmtLngLat(p: LngLat, digits = 5): string {
  return `${p.lng.toFixed(digits)}, ${p.lat.toFixed(digits)}`
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(d)
}

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`
}

export function fmtPct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`
}

/** 中文短地址：过长时保留末尾（街道/门牌更有辨识度） */
export function shortAddress(s: string, max = 22): string {
  if (s.length <= max) return s
  return `…${s.slice(s.length - max + 1)}`
}
