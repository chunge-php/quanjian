/**
 * 设施检索与多源清洗：按类别调用地点检索，去重、跨类别归属、黑白名单过滤误检。
 */
import type { FacilityCategory, FacilityCategoryMeta, LngLat, Poi } from '../types'
import { FACILITY_CATEGORIES } from '../categories'
import type { BaiduClient, BaiduPlaceResult } from './client'
import { fromBaiduLocation, haversineM } from './geo'

interface CleanRule {
  /** 名称命中即剔除（误检典型：药店→医药公司，小学→培训班，公园→公园路） */
  nameExclude?: RegExp
  /** 名称必须命中之一（不满足则看 tag 是否命中 tagInclude） */
  nameRequire?: RegExp
  /** tag 命中即剔除 */
  tagExclude?: RegExp
  /** tag 命中视为强匹配（用于跨类别归属打分与 nameRequire 豁免） */
  tagInclude?: RegExp
}

/** 各类别清洗规则（基于实测百度 POI 常见误检整理） */
export const CLEAN_RULES: Record<FacilityCategory, CleanRule> = {
  market: {
    nameExclude:
      /市场路|市场街|市场管理|物业|停车|批发市场办|建材|家具|花鸟|二手|汽车|电子|服装|小商品|钢材|商行|贸易|批发部/,
    tagExclude: /房地产|公司企业|汽车|交通/,
    tagInclude: /购物;(集市|超市|市场)|农贸|生鲜|菜市场/,
  },
  pharmacy: {
    nameExclude:
      /医药公司|药业|医药有限|批发|药材公司|制药|生物|医疗器械|药械|医药物流|药品监|药监|保健品/,
    tagExclude: /公司企业|房地产|政府机构/,
    tagInclude: /药店|药房/,
  },
  primary_school: {
    nameExclude:
      /培训|辅导|托管|托班|晚托|课后|补习|教育科技|教育咨询|幼儿园|中学|大学|学院|附中|书法|美术|舞蹈|钢琴|英语|奥数|少年宫|门卫|门口|食堂|宿舍|操场|停车|校车|路$|街$/,
    nameRequire: /小学|实验学校|九年一贯制|外国语学校|学校/,
    tagExclude: /培训机构|亲子教育|公司企业|房地产|交通设施|出入口/,
    tagInclude: /教育培训;小学/,
  },
  kindergarten: {
    nameExclude: /培训|用品|玩具|教育科技|幼儿园路|早教中心|门口|门卫|停车|加盟|装修|路$|街$/,
    nameRequire: /幼儿园|幼稚园|托育|托儿所/,
    tagExclude: /培训机构|购物|公司企业|房地产/,
    tagInclude: /教育培训;幼儿园|幼儿园/,
  },
  clinic: {
    nameExclude:
      /宠物|动物|美容|整形|医美|药店|药房|器械|眼镜|养生馆|按摩|足疗|殡葬|公司|医院路|门口|停车/,
    tagExclude: /宠物|公司企业|房地产|购物|美容/,
    tagInclude: /医疗;(社区医疗|诊所|综合医院|专科医院|卫生院)|医疗/,
  },
  elderly: {
    nameExclude: /用品|设备|器械|培训|公司|保险|地产|路$|街$|门口|停车/,
    nameRequire: /养老|敬老|老年|老人|颐养|日间照料|长者|社区食堂|为老/,
    tagExclude: /公司企业|购物|房地产/,
    tagInclude: /养老|福利/,
  },
  supermarket: {
    nameExclude:
      /批发|超市路|设备|货架|仓储|物流|配送中心|门口|停车|管理|售卖亭|售货亭|自动售货|路$|街$/,
    tagExclude: /公司企业|房地产|交通/,
    tagInclude: /购物;(超市|便利店)/,
  },
  park: {
    nameExclude:
      /公园路|公园街|公园门|广场路|广场街|停车|购物|商业|写字楼|大厦|公寓|小区|物业|售楼|地铁|出口|管理处|派出所|厕所|党群|服务站|服务中心|办公室|路$|街$|弄$|号$|店$|门$/,
    nameRequire: /公园|广场|绿地|绿道|花园|园$|滨江|步道|湿地|游园/,
    tagExclude: /房地产|购物|交通设施|公司企业|出入口|写字楼/,
    tagInclude: /旅游景点;(公园|广场|绿地|植物园|动物园)|公园/,
  },
  bus_stop: {
    nameExclude: /公交公司|车队|维修|充电|停车|保养|枢纽管理|路$|街$/,
    nameRequire: /站|地铁|公交/,
    tagExclude: /公司企业|房地产|出入口/,
    tagInclude: /交通设施;(公交车站|地铁站)/,
  },
  bank: {
    nameExclude: /保险|证券|投资|担保|贷款|典当|培训|理财公司|金融服务|支付|银行路|银行街|路$|街$/,
    nameRequire: /银行|ATM|自助|信用社|信用联社/,
    tagExclude: /公司企业|房地产/,
    tagInclude: /金融;(银行|atm)|银行/i,
  },
}

/** 从原始 POI 取出 tag 字符串（多来源兜底） */
export function poiTag(p: BaiduPlaceResult): string {
  const d = p.detail_info
  return String(d?.tag ?? d?.classified_poi_tag ?? d?.label ?? '')
}

/**
 * 判断原始 POI 是否属于某类别（黑白名单清洗）。
 * 顺序：黑名单（名称/tag）→ 白名单（tag 强命中豁免 nameRequire）→ nameRequire。
 */
export function matchesCategory(p: BaiduPlaceResult, meta: FacilityCategoryMeta): boolean {
  const rule = CLEAN_RULES[meta.key]
  const name = String(p.name ?? '')
  const tag = poiTag(p)
  if (!name) return false
  if (rule.nameExclude?.test(name)) return false
  if (rule.tagExclude?.test(tag)) return false
  if (rule.tagInclude?.test(tag)) return true
  if (rule.nameRequire) return rule.nameRequire.test(name)
  // 无 nameRequire 的类别：名称至少含一个检索词
  return meta.queries.some((q) => name.includes(q))
}

/**
 * 跨类别归属打分：tag 强命中 +4，名称含检索词每个 +2，硬指标类别 +1（同分时优先硬指标）。
 */
export function categoryScore(p: BaiduPlaceResult, meta: FacilityCategoryMeta): number {
  const rule = CLEAN_RULES[meta.key]
  const name = String(p.name ?? '')
  const tag = poiTag(p)
  let s = 0
  if (rule.tagInclude?.test(tag)) s += 4
  if (meta.tags?.some((t) => tag.includes(t))) s += 2
  for (const q of meta.queries) if (name.includes(q)) s += 2
  if (meta.essential) s += 1
  return s
}

/**
 * 检索 center 周边 radiusM 内的民生设施并清洗。
 * - 每个类别一次检索（queries 用 $ 拼接，自动翻页）；
 * - 按 uid 去重；同一 uid 命中多类别时只归 categoryScore 最高的类别；
 * - 按 CLEAN_RULES 过滤误检；
 * - straightM 用直线距离；walkM/walkSec 先置 null，walkSource='estimate'，inIsochrone=false，
 *   由 attachWalkTimes / 等时圈模块后续填充；
 * - 单类别检索失败不影响其他类别（该类别为空）。
 */
export async function searchFacilities(
  client: BaiduClient,
  center: LngLat,
  radiusM: number,
  categories: FacilityCategoryMeta[] = FACILITY_CATEGORIES,
  opts: { onError?: (category: FacilityCategoryMeta, message: string) => void } = {}
): Promise<Poi[]> {
  const perCategory = await Promise.all(
    categories.map(async (meta) => {
      try {
        const raw = await client.placeSearchNearby({
          query: meta.queries.join('$'),
          location: center,
          radius: radiusM,
        })
        return raw.filter((p) => matchesCategory(p, meta)).map((p) => ({ p, meta }))
      } catch (e) {
        // 单类别失败不影响其他类别，但把原因交给调用方（用户看到"0 个设施"时最需要的就是这句）
        opts.onError?.(meta, e instanceof Error ? e.message : String(e))
        return [] as { p: BaiduPlaceResult; meta: FacilityCategoryMeta }[]
      }
    })
  )

  // 按 uid 归并，跨类别只留最匹配的一个
  const best = new Map<string, { p: BaiduPlaceResult; meta: FacilityCategoryMeta; score: number }>()
  for (const list of perCategory) {
    for (const { p, meta } of list) {
      const loc = fromBaiduLocation(p.location)
      if (!loc) continue
      const key = String(p.uid || `${p.name}@${loc.lng.toFixed(5)},${loc.lat.toFixed(5)}`)
      const score = categoryScore(p, meta)
      const prev = best.get(key)
      if (!prev || score > prev.score) best.set(key, { p, meta, score })
    }
  }

  const pois: Poi[] = []
  const limit = radiusM * 1.05
  for (const [uid, { p, meta }] of best) {
    const location = fromBaiduLocation(p.location) as LngLat
    const straightM = Math.round(haversineM(center, location))
    if (straightM > limit) continue
    pois.push({
      uid,
      name: String(p.name),
      category: meta.key,
      location,
      address: typeof p.address === 'string' && p.address ? p.address : undefined,
      straightM,
      walkM: null,
      walkSec: null,
      walkSource: 'estimate',
      inIsochrone: false,
    })
  }
  pois.sort((a, b) => a.straightM - b.straightM)
  return pois
}
