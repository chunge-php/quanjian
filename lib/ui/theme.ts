import type { FacilityCategory } from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'

/** 图纸配色（与 globals.css 一致；地图/SVG 需要裸 hex） */
export const COLORS = {
  paper: '#f3ede0',
  paper2: '#ebe3d1',
  ink: '#23261f',
  ink2: '#4b4e45',
  ink3: '#6f6b5f',
  line: '#cbc1aa',
  lineStrong: '#a89e86',
  vermilion: '#c0391d',
  vermilionDeep: '#8f2812',
  teal: '#1f6e6a',
  tealDeep: '#154f4c',
  ochre: '#b0801f',
  moss: '#4f7a3a',
} as const

export const GRADE_COLOR: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: COLORS.teal,
  B: COLORS.moss,
  C: COLORS.ochre,
  D: COLORS.vermilion,
}

export const GRADE_LABEL: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '优',
  B: '良',
  C: '中',
  D: '差',
}

export const PRIORITY_COLOR = {
  high: COLORS.vermilion,
  medium: COLORS.ochre,
  low: COLORS.teal,
} as const

export const PRIORITY_LABEL = { high: '优先', medium: '建议', low: '可选' } as const

/** 等时圈三环：同一青色，透明度递减叠成热力 */
export const RING_STYLE: Record<
  5 | 10 | 15,
  { fillOpacity: number; strokeWeight: number; strokeOpacity: number }
> = {
  5: { fillOpacity: 0.3, strokeWeight: 1, strokeOpacity: 0.7 },
  10: { fillOpacity: 0.18, strokeWeight: 1, strokeOpacity: 0.6 },
  15: { fillOpacity: 0.1, strokeWeight: 2, strokeOpacity: 0.95 },
}

/** 盲区颜色：severity 0→灰 1→朱砂 */
export function blindSpotColor(severity: number): string {
  const s = Math.max(0, Math.min(1, severity))
  const from = [154, 143, 134] // 灰
  const to = [217, 51, 20] // 朱砂（预加饱和，抵消地图滤镜）
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * s))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function blindSpotOpacity(severity: number, inIsochrone: boolean): number {
  const base = 0.16 + Math.max(0, Math.min(1, severity)) * 0.36
  return inIsochrone ? base : base * 0.4
}

/** 类别图标：lucide 线条（ISC），24 viewBox 的 path 数据 */
export const CATEGORY_ICON: Record<
  FacilityCategory,
  { paths: string[]; circles?: [number, number, number][] }
> = {
  market: {
    paths: [
      'm15 11l-1 9m5-9l-4-7M2 11h20M3.5 11l1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4M4.5 15.5h15M5 11l4-7m0 7l1 9',
    ],
  },
  pharmacy: {
    paths: [
      'M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z',
    ],
  },
  primary_school: {
    paths: [
      'M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z',
    ],
  },
  kindergarten: {
    paths: [
      'M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2',
      'M14 2h6a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
    ],
  },
  clinic: {
    paths: [
      'M11 2v2M5 2v2m0-1H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1',
      'M8 15a6 6 0 0 0 12 0v-3',
    ],
    circles: [[20, 10, 2]],
  },
  elderly: {
    paths: [
      'm18 19l1-7l-6 1M5 8l3-3l5.5 3l-2.36 3.5m-6.9 3a5 5 0 0 0 6.88 6',
      'M13.76 17.5a5 5 0 0 0-6.88-6',
    ],
    circles: [[16, 4, 1]],
  },
  supermarket: {
    paths: [
      'm2.05 2.05l1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18',
      'M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25',
    ],
    circles: [
      [8, 21, 1],
      [19, 21, 1],
    ],
  },
  park: {
    paths: [
      'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0m-3 6v6m6-3v3',
      'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5',
    ],
  },
  bus_stop: {
    paths: [
      'M8 6v6m7-6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2s-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3',
      'M9 18h5',
    ],
    circles: [
      [7, 18, 2],
      [17, 18, 2],
    ],
  },
  bank: {
    paths: [
      'M10 18v-7m1.119-8.795a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949zM14 18v-7m4 7v-7M3 22h18M6 18v-7',
    ],
  },
}

export const CATEGORY_LABEL: Record<FacilityCategory, string> = Object.fromEntries(
  FACILITY_CATEGORIES.map((c) => [c.key, c.label])
) as Record<FacilityCategory, string>

export const ESSENTIAL_SET = new Set<FacilityCategory>(
  FACILITY_CATEGORIES.filter((c) => c.essential).map((c) => c.key)
)

/** 生成地图 Marker 用的 SVG data URL（硬指标：墨底纸线、大一号；其余：纸底墨线） */
export function categoryMarkerUrl(
  category: FacilityCategory,
  opts: { essential: boolean; dim: boolean }
): string {
  const { paths, circles = [] } = CATEGORY_ICON[category]
  const size = opts.essential ? 30 : 24
  const bg = opts.essential ? COLORS.ink : COLORS.paper
  const fg = opts.essential ? COLORS.paper : COLORS.ink
  const border = opts.essential ? COLORS.vermilion : COLORS.ink
  const opacity = opts.dim ? 0.42 : 1
  const inner = size - 10
  const scale = inner / 24
  const offset = 5
  const body = `${paths.map((d) => `<path d="${d}"/>`).join('')}${circles
    .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`)
    .join('')}`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" opacity="${opacity}">` +
    `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="${bg}" stroke="${border}" stroke-width="${opts.essential ? 2 : 1.2}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * 中心点十字标：单点模式朱砂无字；对比模式 A 青 / B 赭，圈里写槽位字母
 */
export function centerMarkerUrl(slot?: 'A' | 'B'): string {
  const color =
    slot === 'A' ? MAP_OVERLAY.teal : slot === 'B' ? MAP_OVERLAY.ochre : COLORS.vermilion
  const core = slot
    ? `<circle cx="22" cy="22" r="11" fill="${color}"/>` +
      `<text x="22" y="27" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="15" fill="${COLORS.paper}">${slot}</text>`
    : `<circle cx="22" cy="22" r="4" fill="${color}"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">` +
    `<circle cx="22" cy="22" r="17" fill="none" stroke="${color}" stroke-width="2"/>` +
    core +
    `<path d="M22 1v10M22 33v10M1 22h10M33 22h10" stroke="${color}" stroke-width="2"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/**
 * 采样点：按步行分钟深浅着色（0′ 淡青 → 15′ 深青 → 更远墨绿），不可达朱砂。
 * shade 取 0-4 五档，便于图标缓存。
 */
export function sampleDotUrl(shade: number | null): string {
  const ramp = ['#7fc9c3', '#3fa39c', '#0e8c84', '#0b6660', '#083f3c']
  const c = shade == null ? COLORS.vermilion : ramp[Math.max(0, Math.min(4, shade))]
  const r = shade == null ? 3 : 2.4 + shade * 0.3
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="${r}" fill="${c}" opacity="0.9" stroke="${COLORS.paper}" stroke-width="0.8"/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** 步行秒数 → 采样点色阶 0-4（≤5′ / ≤10′ / ≤15′ / ≤20′ / 更远） */
export function sampleShade(walkSec: number | null): number | null {
  if (walkSec == null) return null
  const m = walkSec / 60
  return m <= 5 ? 0 : m <= 10 ? 1 : m <= 15 ? 2 : m <= 20 ? 3 : 4
}

/** 地图叠加层用色：容器上有 saturate/sepia 滤镜把底图洗成纸色，叠加层色要预先加饱和以抵消 */
export const MAP_OVERLAY = {
  teal: '#0e8c84',
  vermilion: '#d93314',
  ochre: '#d59a1a',
} as const
