/**
 * 百度国内天气查询（/weather/v1/）的纯解析层：原始 result → WeatherInfo，
 * 以及"步行舒适度"一句话提示。不发请求，便于单测。
 *
 * 实测（2026-09-08）：
 * - `location=lng,lat`（注意与其它接口相反，是经度在前）可直接查，返回 result.location.id 即 adcode；
 * - `district_id=<adcode>` 同样可用；两者返回结构一致；
 * - 非法坐标返回 status 41 "查询的经纬度值范围无效"。
 */
import type { WeatherForecastDay, WeatherInfo } from '../types'

type Json = Record<string, unknown>

/** 预报最多保留天数 */
export const FORECAST_DAYS = 3

function num(v: unknown): number | undefined {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** "2级" → "2 级"；"<3级" → "<3 级"；已带空格的原样返回 */
export function normalizeWindClass(v: unknown): string | undefined {
  const s = str(v)
  if (!s) return undefined
  return s.replace(/\s*级$/, ' 级')
}

/** "20260908135500" → "2026-09-08 13:55"；格式不符原样返回 */
export function formatUptime(v: unknown): string | undefined {
  const s = str(v)
  if (!s) return undefined
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s)
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : s
}

/**
 * 步行舒适度提示（中文一句话）。优先级：降水/降雪 > 极端温度 > 雾霾沙尘 > 适宜。
 * @param text 天气现象（如"小雨"）
 * @param tempC 气温；缺省时只按天气现象判断
 */
export function walkComment(text: string, tempC?: number): string {
  if (/雪|冻雨|冰雹/.test(text)) return '有雪，路面湿滑，老人儿童步行需格外小心'
  if (/雨/.test(text)) return '有雨，步行意愿下降，建议关注遮蔽设施（骑楼、连廊、公交候车亭）'
  if (tempC != null) {
    if (tempC >= 35)
      return `高温 ${Math.round(tempC)}°C，老人儿童步行 15 分钟负担较大，建议关注林荫与遮阳`
    if (tempC >= 30) return '气温偏高，步行 15 分钟略感闷热，建议避开正午出行'
    if (tempC <= 0) return '气温 0°C 以下，步行需防滑保暖，出行半径会明显收缩'
    if (tempC < 10) return '气温偏低，步行需注意保暖'
  }
  if (/雾|霾|沙|尘/.test(text)) return '能见度或空气质量欠佳，建议减少户外长时间步行'
  return '气温适宜，适合步行'
}

/**
 * 解析百度天气 result（含 now / forecasts）。缺少 now.text 或 now.temp 视作无效返回 null。
 * @param result 接口返回的 result 对象
 * @param fetchedAt 本次拉取时间 ISO
 */
export function parseWeather(
  result: unknown,
  fetchedAt = new Date().toISOString()
): WeatherInfo | null {
  if (!result || typeof result !== 'object') return null
  const r = result as Json
  const now = (r.now ?? {}) as Json
  const text = str(now.text)
  const tempC = num(now.temp)
  if (!text || tempC === undefined) return null

  const forecast: WeatherForecastDay[] = []
  const list = Array.isArray(r.forecasts) ? (r.forecasts as Json[]) : []
  for (const f of list.slice(0, FORECAST_DAYS)) {
    const high = num(f.high)
    const low = num(f.low)
    const date = str(f.date)
    if (high === undefined || low === undefined || !date) continue
    forecast.push({ date, week: str(f.week) ?? '', high, low, text: str(f.text_day) ?? '' })
  }

  return {
    text,
    tempC,
    feelsLikeC: num(now.feels_like),
    humidity: num(now.rh),
    windDir: str(now.wind_dir),
    windClass: normalizeWindClass(now.wind_class),
    uptime: formatUptime(now.uptime),
    fetchedAt,
    forecast: forecast.length ? forecast : undefined,
    walkComment: walkComment(text, tempC),
  }
}

/** 天气一行摘要："多云 22°C · 体感 24°C · 东北风 2 级 · 湿度 60%"（UI 与图签共用） */
export function weatherSummary(w: WeatherInfo): string {
  const parts = [`${w.text} ${Math.round(w.tempC)}°C`]
  if (w.feelsLikeC != null) parts.push(`体感 ${Math.round(w.feelsLikeC)}°C`)
  const wind = [w.windDir, w.windClass].filter(Boolean).join(' ')
  if (wind) parts.push(wind)
  if (w.humidity != null) parts.push(`湿度 ${Math.round(w.humidity)}%`)
  return parts.join(' · ')
}
