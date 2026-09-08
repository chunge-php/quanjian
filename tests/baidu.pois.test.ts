import { describe, it, expect } from 'vitest'
import {
  searchFacilities,
  matchesCategory,
  estimateWalk,
  attachWalkTimes,
  haversineM,
  type BaiduClient,
  type BaiduPlaceResult,
} from '@/lib/baidu'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import { emptyStats } from '@/lib/baidu'

const center = { lng: 121.4797, lat: 31.2397 }
const cat = (k: string) => FACILITY_CATEGORIES.find((c) => c.key === k)!
const poi = (uid: string, name: string, tag: string, dLng = 0.002): BaiduPlaceResult => ({
  uid,
  name,
  location: { lng: center.lng + dLng, lat: center.lat },
  address: '上海市',
  detail_info: { tag },
})

/** 假 client：按 query 关键词返回预置 POI */
function fakeClient(
  byQuery: Record<string, BaiduPlaceResult[]>,
  matrix?: BaiduClient['routeMatrixWalking']
): BaiduClient {
  const stats = emptyStats()
  return {
    hasAk: true,
    stats,
    resetStats() {},
    async geocode() {
      return null
    },
    async reverseGeocode() {
      return { formatted: '' }
    },
    async placeSuggestion() {
      return []
    },
    async placeSearchNearby({ query }) {
      stats.placeSearch += 1
      const out: BaiduPlaceResult[] = []
      for (const q of query.split('$')) out.push(...(byQuery[q] ?? []))
      return out
    },
    routeMatrixWalking: matrix ?? (async (o, d) => o.map(() => d.map(() => null))),
  }
}

describe('matchesCategory 黑白名单', () => {
  it('药店：剔除医药公司/药业，保留药房', () => {
    expect(matchesCategory(poi('1', '国大药房(南京路店)', '医疗;药店'), cat('pharmacy'))).toBe(true)
    expect(matchesCategory(poi('2', '上海医药公司', '公司企业;公司'), cat('pharmacy'))).toBe(false)
    expect(matchesCategory(poi('3', '华氏药业有限公司', '医疗;药店'), cat('pharmacy'))).toBe(false)
  })
  it('小学：剔除培训班/中学，保留小学', () => {
    expect(
      matchesCategory(poi('1', '黄浦区第一中心小学', '教育培训;小学'), cat('primary_school'))
    ).toBe(true)
    expect(
      matchesCategory(poi('2', '小学奥数培训班', '教育培训;培训机构'), cat('primary_school'))
    ).toBe(false)
    expect(matchesCategory(poi('3', '格致中学', '教育培训;中学'), cat('primary_school'))).toBe(
      false
    )
    expect(
      matchesCategory(poi('4', '小学门口停车场', '交通设施;停车场'), cat('primary_school'))
    ).toBe(false)
  })
  it('公园：剔除公园路/购物广场，保留公园/绿地', () => {
    expect(matchesCategory(poi('1', '人民公园', '旅游景点;公园'), cat('park'))).toBe(true)
    expect(matchesCategory(poi('2', '公园路', '交通设施;道路'), cat('park'))).toBe(false)
    expect(matchesCategory(poi('3', '来福士购物广场', '购物;购物中心'), cat('park'))).toBe(false)
    expect(matchesCategory(poi('4', '延中绿地', '旅游景点;公园'), cat('park'))).toBe(true)
  })
  it('银行：剔除保险/证券', () => {
    expect(matchesCategory(poi('1', '中国银行(人民广场支行)', '金融;银行'), cat('bank'))).toBe(true)
    expect(matchesCategory(poi('2', '平安保险', '金融;保险'), cat('bank'))).toBe(false)
  })
})

describe('searchFacilities 去重清洗', () => {
  it('按 uid 去重、跨类别只归最匹配类别、误检剔除、straightM/walk 字段初始化', async () => {
    const client = fakeClient({
      菜市场: [
        poi('m1', '宁海东路菜市场', '购物;集市', 0.003),
        poi('m1', '宁海东路菜市场', '购物;集市', 0.003),
      ],
      生鲜超市: [poi('s1', '盒马生鲜超市', '购物;超市', 0.004)],
      超市: [
        poi('s1', '盒马生鲜超市', '购物;超市', 0.004),
        poi('s2', '全家便利店', '购物;便利店', 0.001),
        poi('s3', '货架批发部', '购物;超市', 0.001),
      ],
      药店: [
        poi('p1', '国大药房', '医疗;药店', 0.002),
        poi('p2', '上海医药公司', '公司企业', 0.002),
      ],
      小学: [
        poi('e1', '实验小学', '教育培训;小学', 0.002),
        poi('e2', '小学托管班', '教育培训;培训机构', 0.002),
      ],
      公园: [
        poi('k1', '人民公园', '旅游景点;公园', 0.002),
        poi('k2', '公园路', '交通设施;道路', 0.002),
        poi('far', '远方公园', '旅游景点;公园', 0.05),
      ],
    })
    const pois = await searchFacilities(client, center, 1000)
    const uids = pois.map((p) => p.uid)
    expect(new Set(uids).size).toBe(uids.length)
    expect(uids.filter((u) => u === 'm1')).toHaveLength(1)
    // s1 同时被 market(生鲜超市) 与 supermarket(超市) 命中：market 是硬指标且名称含"生鲜超市" → 归 market
    expect(pois.find((p) => p.uid === 's1')?.category).toBe('market')
    expect(uids).not.toContain('p2')
    expect(uids).not.toContain('e2')
    expect(uids).not.toContain('k2')
    expect(uids).not.toContain('s3')
    expect(uids).not.toContain('far') // 超出半径
    expect(uids).toEqual(expect.arrayContaining(['m1', 'p1', 'e1', 'k1', 's2']))
    const p1 = pois.find((p) => p.uid === 'p1')!
    expect(p1.straightM).toBeGreaterThan(150)
    expect(p1.straightM).toBeLessThan(250)
    expect(p1).toMatchObject({
      walkM: null,
      walkSec: null,
      walkSource: 'estimate',
      inIsochrone: false,
      category: 'pharmacy',
    })
    expect(client.stats.placeSearch).toBe(FACILITY_CATEGORIES.length)
    // 按直线距离升序
    for (let i = 1; i < pois.length; i++)
      expect(pois[i].straightM).toBeGreaterThanOrEqual(pois[i - 1].straightM)
  })

  it('只检索指定类别；单类别失败不影响其他类别', async () => {
    const client = fakeClient({ 药店: [poi('p1', '国大药房', '医疗;药店')] })
    client.placeSearchNearby = async ({ query }) => {
      if (query.startsWith('小学')) throw new Error('boom')
      return query.startsWith('药店') ? [poi('p1', '国大药房', '医疗;药店')] : []
    }
    const pois = await searchFacilities(client, center, 1000, [
      cat('pharmacy'),
      cat('primary_school'),
    ])
    expect(pois.map((p) => p.uid)).toEqual(['p1'])
  })
})

describe('attachWalkTimes 降级估算', () => {
  const pts = [
    { lng: 121.4817, lat: 31.2397 },
    { lng: 121.4797, lat: 31.2427 },
    { lng: 121.4837, lat: 31.2397 },
  ]

  it('estimateWalk：×1.3 / 1.2', () => {
    expect(estimateWalk(1000)).toEqual({ walkM: 1300, walkSec: 1083, source: 'estimate' })
  })

  it('API 成功的用 api，null 单元降级估算并计 degraded', async () => {
    const client = fakeClient({}, async (o, d) =>
      o.map(() => d.map((_, i) => (i === 1 ? null : { distanceM: 300 + i, durationSec: 250 + i })))
    )
    const r = await attachWalkTimes(client, center, pts)
    expect(r[0]).toEqual({ walkM: 300, walkSec: 250, source: 'api' })
    expect(r[2]).toEqual({ walkM: 302, walkSec: 252, source: 'api' })
    expect(r[1].source).toBe('estimate')
    expect(r[1].walkM).toBe(Math.round(haversineM(center, pts[1]) * 1.3))
    expect(r[1].walkSec).toBe(Math.round(r[1].walkM! / 1.2))
    expect(client.stats.degraded).toBe(1)
  })

  it('整体抛错（如缺 AK）→ 全部估算，不抛', async () => {
    const client = fakeClient({}, async () => {
      throw new Error('no ak')
    })
    const r = await attachWalkTimes(client, center, pts)
    expect(r.every((x) => x.source === 'estimate' && x.walkM! > 0)).toBe(true)
    expect(client.stats.degraded).toBe(3)
    expect(await attachWalkTimes(client, center, [])).toEqual([])
  })
})
