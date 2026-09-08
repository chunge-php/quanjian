/** 圈见 · 报告文案小工具（中文方位 / 单位格式化） */

const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const

/**
 * 方位角（0-360，正北 0 顺时针）→ 八方位中文。
 * 每个方位占 45°，以正方向为中心（北 = 337.5°~22.5°）。
 */
export function bearingToChinese(deg: number): string {
  const d = ((deg % 360) + 360) % 360
  const idx = Math.round(d / 45) % 8
  return DIRECTIONS[idx]
}

/** 分钟数 → "7 分钟"；小于 1 分钟显示 "不到 1 分钟" */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return '不可达'
  if (min < 1) return '不到 1 分钟'
  return `${Math.round(min)} 分钟`
}

/** 平方公里 → "1.8 km²" */
export function formatKm2(km2: number): string {
  if (km2 < 0.1) return `${km2.toFixed(2)} km²`
  return `${km2.toFixed(1)} km²`
}

/** 米 → "760 米" / "1.2 公里"；1 公里以内按 10 米取整 */
export function formatMeters(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} 公里`
  return `${Math.max(10, Math.round(m / 10) * 10)} 米`
}

/** 0-1 → "62%" */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** 向上取整到 100 米，用于"在 600 米内增设"这类建议文案 */
export function ceilTo100(m: number): number {
  return Math.max(100, Math.ceil(m / 100) * 100)
}
