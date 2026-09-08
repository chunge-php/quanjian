import type { FacilityCategory, Poi } from '@/lib/types'
import { ESSENTIAL_CATEGORIES, FACILITY_CATEGORIES } from '@/lib/categories'

/** 地图图层筛选状态：由图例控制，只影响地图显示，不影响报告数据 */
export interface LayerFilter {
  /** 显示的设施类别；null = 全部 */
  categories: FacilityCategory[] | null
  showIsochrone: boolean
  showBlindSpots: boolean
  /** 只显示 15 分钟圈内设施 */
  onlyInIsochrone: boolean
}

export const DEFAULT_FILTER: LayerFilter = {
  categories: null,
  showIsochrone: true,
  showBlindSpots: true,
  onlyInIsochrone: false,
}

export const ALL_CATEGORY_KEYS = FACILITY_CATEGORIES.map((c) => c.key)

export function isCategoryOn(f: LayerFilter, key: FacilityCategory): boolean {
  return f.categories === null || f.categories.includes(key)
}

/** 单击一个类别：全选状态下变为"只看这一类"；否则切换该类；全部关掉时回到全选 */
export function toggleCategory(f: LayerFilter, key: FacilityCategory): LayerFilter {
  if (f.categories === null) return { ...f, categories: [key] }
  const on = f.categories.includes(key)
  const next = on ? f.categories.filter((k) => k !== key) : [...f.categories, key]
  if (next.length === 0 || next.length === ALL_CATEGORY_KEYS.length)
    return { ...f, categories: null }
  return { ...f, categories: next }
}

export function onlyEssential(f: LayerFilter): LayerFilter {
  return { ...f, categories: [...ESSENTIAL_CATEGORIES] }
}

export function isOnlyEssential(f: LayerFilter): boolean {
  return (
    f.categories !== null &&
    f.categories.length === ESSENTIAL_CATEGORIES.length &&
    ESSENTIAL_CATEGORIES.every((k) => f.categories!.includes(k))
  )
}

export function applyPoiFilter(pois: Poi[] | null, f: LayerFilter): Poi[] | null {
  if (!pois) return null
  if (f.categories === null && !f.onlyInIsochrone) return pois
  return pois.filter((p) => isCategoryOn(f, p.category) && (!f.onlyInIsochrone || p.inIsochrone))
}

/** 各类别计数：圈内 / 总数，给图例显示 */
export function countByCategory(
  pois: Poi[] | null
): Record<FacilityCategory, { inIso: number; total: number }> {
  const out = {} as Record<FacilityCategory, { inIso: number; total: number }>
  for (const k of ALL_CATEGORY_KEYS) out[k] = { inIso: 0, total: 0 }
  for (const p of pois ?? []) {
    out[p.category].total += 1
    if (p.inIsochrone) out[p.category].inIso += 1
  }
  return out
}
