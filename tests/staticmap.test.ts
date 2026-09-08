import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { HealthReport } from '@/lib/types'
import { autoZoom } from '@/lib/baidu/staticmap'
import { essentialPoisParam, ringsParam, staticMapUrl } from '@/lib/ui/staticMapUrl'

function sampleReport(): HealthReport {
  const raw = JSON.parse(readFileSync('data/samples/bishan-biquan.json', 'utf8')) as {
    events: { type: string; report?: HealthReport }[]
  }
  return raw.events.find((e) => e.type === 'done')!.report!
}

describe('staticmap', () => {
  const report = sampleReport()
  const ring15 = report.isochrone.rings.find((r) => r.minutes === 15)!.polygon.coordinates[0]
  const pts = ring15.map(([lng, lat]) => ({ lng, lat }))

  it('autoZoom：800×560 取 16，480×360 取 15~16，夹在 14~17', () => {
    expect(autoZoom(pts, 800, 560)).toBe(16)
    expect(autoZoom(pts, 480, 360)).toBeGreaterThanOrEqual(15)
    expect(autoZoom(pts, 480, 360)).toBeLessThanOrEqual(16)
    expect(autoZoom(pts, 200, 200)).toBeGreaterThanOrEqual(14)
    expect(autoZoom([{ lng: 106.2, lat: 29.5 }], 800, 560)).toBe(17)
    expect(autoZoom([], 800, 560)).toBe(16)
  })

  it('ringsParam：三环外→内、5 位小数、首尾闭合', () => {
    const rings = ringsParam(report).split('|')
    expect(rings).toHaveLength(3)
    const pts0 = rings[0].split(';')
    expect(pts0[0]).toBe(pts0[pts0.length - 1])
    expect(pts0[0]).toMatch(/^\d+\.\d{5},\d+\.\d{5}$/)
    // 第一条是 15 分钟环（面积最大 → 点集包围盒最大）
    const span = (r: string) => {
      const xs = r.split(';').map((p) => Number(p.split(',')[0]))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(span(rings[0])).toBeGreaterThan(span(rings[2]))
  })

  it('essentialPoisParam：只放圈内硬指标、最多 30 个', () => {
    const pois = essentialPoisParam(report).split(';').filter(Boolean)
    expect(pois.length).toBeGreaterThan(0)
    expect(pois.length).toBeLessThanOrEqual(30)
  })

  it('staticMapUrl：不含 ak，带 center / rings / pois / w / h / label', () => {
    const url = staticMapUrl(report, { w: 480, h: 360, label: 'A' })
    expect(url.startsWith('/api/staticmap?')).toBe(true)
    expect(url).not.toContain('ak=')
    const q = new URLSearchParams(url.slice(url.indexOf('?') + 1))
    expect(q.get('center')).toBe('106.22770,29.59210')
    expect(q.get('w')).toBe('480')
    expect(q.get('h')).toBe('360')
    expect(q.get('label')).toBe('A')
    expect(q.get('rings')?.split('|')).toHaveLength(3)
  })
})
