import { describe, expect, it } from 'vitest'
import type { Poi } from '@/lib/types'
import { buildIsochrone, buildSamples, offsetMeters, haversineM } from '@/lib/isochrone'
import { detectBlindSpots, summarizeBlindSpots } from '@/lib/report/blindspot'
import {
  baseScoreByMinutes,
  buildOverall,
  gradeOf,
  scoreCategories,
  weakestDirection,
} from '@/lib/report/scoring'
import {
  bearingToChinese,
  formatKm2,
  formatMeters,
  formatMinutes,
  ceilTo100,
} from '@/lib/report/format'

const C = { lng: 121.4737, lat: 31.2304 }
const iso = buildIsochrone(
  C,
  buildSamples(C).map((s) => ({ ...s, walkSec: s.radiusM / 1.2, source: 'api' as const }))
)

function poi(
  category: Poi['category'],
  dx: number,
  dy: number,
  walkSec: number | null = null
): Poi {
  const location = offsetMeters(C, dx, dy)
  return {
    uid: `${category}-${dx}-${dy}`,
    name: category,
    category,
    location,
    straightM: haversineM(C, location),
    walkM: null,
    walkSec,
    walkSource: walkSec === null ? 'estimate' : 'api',
    inIsochrone: false,
  }
}

describe('format', () => {
  it('bearingToChinese 八方位', () => {
    expect(bearingToChinese(0)).toBe('北')
    expect(bearingToChinese(45)).toBe('东北')
    expect(bearingToChinese(90)).toBe('东')
    expect(bearingToChinese(135)).toBe('东南')
    expect(bearingToChinese(180)).toBe('南')
    expect(bearingToChinese(225)).toBe('西南')
    expect(bearingToChinese(270)).toBe('西')
    expect(bearingToChinese(315)).toBe('西北')
    expect(bearingToChinese(350)).toBe('北')
    expect(bearingToChinese(-90)).toBe('西')
  })
  it('单位格式化', () => {
    expect(formatMinutes(7.4)).toBe('7 分钟')
    expect(formatMinutes(null)).toBe('不可达')
    expect(formatKm2(1.83)).toBe('1.8 km²')
    expect(formatMeters(760)).toBe('760 米')
    expect(formatMeters(1234)).toBe('1.2 公里')
    expect(ceilTo100(512)).toBe(600)
  })
})

describe('scoreCategories 边界', () => {
  it('分钟阈值 → 基础分与评级', () => {
    expect(baseScoreByMinutes(5)).toBe(100)
    expect(baseScoreByMinutes(5.01)).toBe(85)
    expect(baseScoreByMinutes(10)).toBe(85)
    expect(baseScoreByMinutes(15)).toBe(70)
    expect(baseScoreByMinutes(20)).toBe(45)
    expect(baseScoreByMinutes(21)).toBe(20)
    expect(baseScoreByMinutes(null)).toBe(0)
    expect(gradeOf(85)).toBe('A')
    expect(gradeOf(84.9)).toBe('B')
    expect(gradeOf(70)).toBe('B')
    expect(gradeOf(50)).toBe('C')
    expect(gradeOf(49)).toBe('D')
  })
  it('没有 POI → 0 分 D 级，硬指标诊断含"盲区"', () => {
    const scores = scoreCategories([], iso)
    expect(scores).toHaveLength(10)
    const market = scores.find((s) => s.category === 'market')!
    expect(market).toMatchObject({
      score: 0,
      grade: 'D',
      nearestWalkMin: null,
      countInIsochrone: 0,
      countWithin1km: 0,
    })
    expect(market.diagnosis).toContain('盲区')
  })
  it('API 步行 7 分钟 → 85 + 圈内加成；三处圈内 = +6', () => {
    const pois = [
      poi('pharmacy', 300, 0, 420),
      poi('pharmacy', 400, 0, 500),
      poi('pharmacy', 500, 0, 600),
    ]
    const s = scoreCategories(pois, iso).find((x) => x.category === 'pharmacy')!
    expect(s.nearestWalkMin).toBe(7)
    expect(s.countInIsochrone).toBe(3) // 位置在 15 分钟环内，用几何判断补上 inIsochrone=false
    expect(s.countWithin1km).toBe(3)
    expect(s.score).toBe(91)
    expect(s.grade).toBe('A')
    expect(s.diagnosis).toBe('最近的药店步行 7 分钟，覆盖良好')
    expect(s.nearest?.uid).toBe('pharmacy-300-0')
  })
  it('无算路结果时用直线估算；加成封顶 100', () => {
    const near = Array.from({ length: 8 }, (_, i) => poi('supermarket', 100 + i * 10, 0))
    const s = scoreCategories(near, iso).find((x) => x.category === 'supermarket')!
    expect(s.nearestWalkMin).toBeCloseTo((100 * 1.25) / 1.2 / 60, 1)
    expect(s.score).toBe(100)
  })
  it('1 公里外的硬指标：countWithin1km=0，诊断为盲区', () => {
    const s = scoreCategories([poi('market', 1300, 0, 1300)], iso).find(
      (x) => x.category === 'market'
    )!
    expect(s.countWithin1km).toBe(0)
    expect(s.countInIsochrone).toBe(0)
    expect(s.diagnosis).toContain('1 公里内没有菜市场')
  })
})

describe('buildOverall', () => {
  it('全部设施就近 → 高分 A，无盲区建议', () => {
    const cats: Poi['category'][] = [
      'market',
      'pharmacy',
      'primary_school',
      'kindergarten',
      'clinic',
      'elderly',
      'supermarket',
      'park',
      'bus_stop',
      'bank',
    ]
    const pois: Poi[] = []
    for (const c of cats)
      for (let dx = -1200; dx <= 1200; dx += 600)
        for (let dy = -1200; dy <= 1200; dy += 600) pois.push(poi(c, dx, dy, 200))
    const scores = scoreCategories(pois, iso)
    const blind = summarizeBlindSpots(detectBlindSpots(C, pois, iso))
    const r = buildOverall(scores, blind, iso)
    expect(blind.cellCount).toBe(0)
    expect(r.overallScore).toBeGreaterThanOrEqual(90)
    expect(r.overallGrade).toBe('A')
    expect(r.headline.length).toBeLessThanOrEqual(3)
    expect(r.headline[0]).toMatch(/^15 分钟步行可达 .* km²，相当于 \d+ 米半径的圆，圆度 \d\.\d\d/)
    expect(r.headline).toContain('分析范围内未发现服务盲区')
    expect(r.suggestions.filter((s) => s.priority === 'high')).toHaveLength(0)
  })
  it('缺菜市场（药店小学只在西侧）→ high 建议且方位指向东', () => {
    const pois = [
      poi('pharmacy', -300, 0, 300),
      poi('primary_school', -300, 0, 300),
      poi('pharmacy', -1200, 0, 1200),
      poi('primary_school', -1200, 0, 1200),
    ]
    const scores = scoreCategories(pois, iso)
    const cells = detectBlindSpots(C, pois, iso)
    const blind = summarizeBlindSpots(cells)
    const r = buildOverall(scores, blind, iso)
    const market = r.suggestions.find((s) => s.category === 'market')!
    expect(market.priority).toBe('high')
    expect(market.text).toMatch(/^在.+方向 \d+ 米内增设一处菜市场可消除 \d+ 个盲区网格$/)
    // 菜市场全域缺失，质心≈中心，方位不限；小学/药店缺失网格在东侧
    const school = r.suggestions.find((s) => s.category === 'primary_school')
    if (school) expect(school.text).toMatch(/东(北|南)?方向/)
    expect(r.suggestions[0].priority).toBe('high')
    expect(r.overallScore).toBeLessThan(60)
    expect(r.headline[1]).toContain('缺少菜市场')
  })
  it('盲区面积扣分与硬指标权重', () => {
    const scores = scoreCategories([], iso).map((s) => ({ ...s, score: s.essential ? 100 : 0 }))
    const noBlind = buildOverall(scores, summarizeBlindSpots([]), iso)
    expect(noBlind.overallScore).toBe(60)
    const halfBlind = { ...summarizeBlindSpots([]), cellCount: 90, areaKm2: 3.6 }
    expect(buildOverall(scores, halfBlind, iso).overallScore).toBe(45)
  })
  it('weakestDirection 指向被截断的方向', () => {
    const samples = buildSamples(C).map((s) => ({
      ...s,
      walkSec: s.bearingDeg === 90 && s.radiusM >= 500 ? null : s.radiusM / 1.2,
      source: 'api' as const,
    }))
    const blocked = buildIsochrone(C, samples)
    expect(weakestDirection(blocked)).toBe('东')
    const r = buildOverall(scoreCategories([], blocked), summarizeBlindSpots([]), blocked)
    expect(r.headline[0]).toContain('东侧通达性最弱')
  })
})
