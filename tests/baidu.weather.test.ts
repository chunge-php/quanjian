/** 天气解析 + client.weather：location 优先、adcode 回退、不计入 stats、不写缓存 */
import { describe, expect, it, vi } from 'vitest'
import {
  createBaiduClient,
  parseWeather,
  walkComment,
  weatherSummary,
  normalizeWindClass,
  formatUptime,
  BaiduApiError,
} from '@/lib/baidu'

/** 按 2026-09-08 实测返回裁剪的样例 */
const SAMPLE = {
  status: 0,
  result: {
    location: { country: '中国', province: '重庆市', city: '重庆市', name: '璧山区', id: '500120' },
    now: {
      text: '晴',
      temp: 35,
      feels_like: 36,
      rh: 45,
      wind_class: '2级',
      wind_dir: '西南风',
      uptime: '20260908135500',
    },
    forecasts: [
      { text_day: '晴', high: 36, low: 25, wc_day: '<3级', date: '2026-09-08', week: '星期二' },
      { text_day: '多云', high: 35, low: 22, wc_day: '<3级', date: '2026-09-09', week: '星期三' },
      { text_day: '小雨', high: 24, low: 21, wc_day: '<3级', date: '2026-09-10', week: '星期四' },
      { text_day: '小雨', high: 26, low: 20, wc_day: '<3级', date: '2026-09-11', week: '星期五' },
    ],
  },
}

function mk(handler: (url: URL) => unknown) {
  const calls: URL[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    calls.push(url)
    return new Response(JSON.stringify(handler(url)), { status: 200 })
  }) as unknown as typeof fetch
  const client = createBaiduClient({
    ak: 'TESTAK',
    cacheDir: null,
    retryBaseMs: 1,
    qps: 1000,
    fetchImpl,
  })
  return { client, calls }
}

describe('parseWeather / walkComment', () => {
  it('解析 now + 最多 3 天预报，风力规范为"2 级"，uptime 格式化', () => {
    const w = parseWeather(SAMPLE.result, '2026-09-08T06:00:00.000Z')!
    expect(w.text).toBe('晴')
    expect(w.tempC).toBe(35)
    expect(w.feelsLikeC).toBe(36)
    expect(w.humidity).toBe(45)
    expect(w.windDir).toBe('西南风')
    expect(w.windClass).toBe('2 级')
    expect(w.uptime).toBe('2026-09-08 13:55')
    expect(w.fetchedAt).toBe('2026-09-08T06:00:00.000Z')
    expect(w.forecast).toHaveLength(3)
    expect(w.forecast![2]).toEqual({
      date: '2026-09-10',
      week: '星期四',
      high: 24,
      low: 21,
      text: '小雨',
    })
    expect(w.walkComment).toContain('高温 35°C')
    expect(weatherSummary(w)).toBe('晴 35°C · 体感 36°C · 西南风 2 级 · 湿度 45%')
  })
  it('缺 now.text / temp 时返回 null', () => {
    expect(parseWeather({ now: { temp: 20 } })).toBeNull()
    expect(parseWeather({ now: { text: '晴' } })).toBeNull()
    expect(parseWeather(null)).toBeNull()
  })
  it('步行舒适度：降水 > 极端温度 > 雾霾 > 适宜', () => {
    expect(walkComment('小雨', 22)).toContain('有雨')
    expect(walkComment('中雪', -2)).toContain('有雪')
    expect(walkComment('晴', 36)).toContain('老人儿童步行 15 分钟负担较大')
    expect(walkComment('多云', 31)).toContain('闷热')
    expect(walkComment('阴', -1)).toContain('0°C 以下')
    expect(walkComment('阴', 5)).toContain('保暖')
    expect(walkComment('霾', 20)).toContain('空气质量')
    expect(walkComment('多云', 22)).toBe('气温适宜，适合步行')
    expect(normalizeWindClass('<3级')).toBe('<3 级')
    expect(formatUptime('bad')).toBe('bad')
  })
})

describe('client.weather', () => {
  it('优先用 location=lng,lat 查询，data_type=all；不计入 stats', async () => {
    const { client, calls } = mk(() => SAMPLE)
    const w = await client.weather({ location: { lng: 106.2277, lat: 29.5921 }, adcode: '500120' })
    expect(w?.text).toBe('晴')
    expect(calls).toHaveLength(1)
    expect(calls[0].pathname).toBe('/weather/v1/')
    expect(calls[0].searchParams.get('location')).toBe('106.2277,29.5921')
    expect(calls[0].searchParams.get('district_id')).toBeNull()
    expect(calls[0].searchParams.get('data_type')).toBe('all')
    expect(client.stats.geocode + client.stats.placeSearch + client.stats.routeMatrix).toBe(0)
    expect(client.stats.cacheHits).toBe(0)
    // 第二次同参仍然真请求（不走缓存）
    await client.weather({ location: { lng: 106.2277, lat: 29.5921 } })
    expect(calls).toHaveLength(2)
    expect(client.stats.cacheHits).toBe(0)
  })
  it('location 被拒（status 41）时回退 district_id；都失败抛 BaiduApiError', async () => {
    const { client, calls } = mk((u) =>
      u.searchParams.has('location') ? { status: 41, message: '查询的经纬度值范围无效' } : SAMPLE
    )
    const w = await client.weather({ location: { lng: 0, lat: 0 }, adcode: '500120' })
    expect(w?.text).toBe('晴')
    expect(calls).toHaveLength(2)
    expect(calls[1].searchParams.get('district_id')).toBe('500120')
    const bad = mk(() => ({ status: 41, message: 'x' }))
    await expect(bad.client.weather({ location: { lng: 0, lat: 0 } })).rejects.toBeInstanceOf(
      BaiduApiError
    )
    expect(await bad.client.weather({})).toBeNull()
  })
})
