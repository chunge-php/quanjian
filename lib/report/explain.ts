/**
 * 打印版"大白话"解释：把报告里的真实数字写进句子，普通读者不看图也能读懂。
 * 全部纯函数，供 PrintNote / PrintDetails 使用。
 */
import type { HealthReport, CategoryScore } from '@/lib/types'
import { bearingToChinese, formatMeters, formatMinutes } from './format'
import { bearingBetween, haversineM } from '../isochrone/geo'

const byScoreDesc = (a: CategoryScore, b: CategoryScore) => b.score - a.score
/** 数字开头的量词前补一个空格（"7 分钟"→" 7 分钟"，"不到 1 分钟"不补） */
const sp = (t: string) => (/^\d/.test(t) ? ` ${t}` : t)

/** 02 雷达图：哪几类强、哪几类弱 */
export function explainRadar(report: HealthReport): string {
  const cats = report.categories.slice().sort(byScoreDesc)
  const top = cats
    .slice(0, 3)
    .map((c) => c.label)
    .join('、')
  const weak = cats
    .slice()
    .reverse()
    .filter((c) => c.score < 70)
    .slice(0, 3)
  const weakTxt =
    weak.length === 0
      ? '十类都在 70 分以上，没有明显短板'
      : `图形往${weak.map((c) => c.label).join('、')}这几个角瘪进去，说明这几类离你远或者根本没有`
  return `这张图有十个角，一个角代表一类设施；离外圈越近，分数越高，说明这类设施离你越近、越多。你这里最靠外的是${top}；${weakTxt}。红字的菜市场、药店、小学是国家规定必须有的三项。`
}

/** 03 柱状图：几类在 15 分钟内、几类超出 */
export function explainWalkBars(report: HealthReport): string {
  const has = report.categories.filter((c) => c.nearestWalkMin !== null)
  const within = has.filter((c) => (c.nearestWalkMin ?? 99) <= 15)
  const over = has.filter((c) => (c.nearestWalkMin ?? 0) > 15)
  const none = report.categories.filter((c) => c.nearestWalkMin === null)
  const example = has.slice().sort((a, b) => (a.nearestWalkMin ?? 0) - (b.nearestWalkMin ?? 0))[0]
  const parts = [
    `每一条代表一类设施里离你最近的那一家，走过去要几分钟`,
    example
      ? `比如${example.label}那条是${sp(formatMinutes(example.nearestWalkMin))}，意思是最近的${example.label}「${example.nearest?.name ?? ''}」走${sp(formatMinutes(example.nearestWalkMin))}就到`
      : '',
    `红线是 15 分钟：柱子没过红线的，日常走着去没问题（本次 ${within.length} 类）`,
    over.length
      ? `过了红线的走着去费劲（${over.map((c) => `${c.label} ${formatMinutes(c.nearestWalkMin)}`).join('、')}）`
      : '',
    none.length
      ? `画斜纹的是周边 1.8 公里内一家都没有（${none.map((c) => c.label).join('、')}）`
      : '',
  ].filter(Boolean)
  return parts.join('；') + '。'
}

/** 11 清单：怎么读一行 */
export function explainPoiList(report: HealthReport): string {
  const inIso = report.pois.filter((p) => p.inIsochrone)
  const ex = inIso.slice().sort((a, b) => (a.walkSec ?? 1e9) - (b.walkSec ?? 1e9))[0]
  const exTxt = ex
    ? `例如「${ex.name} ${Math.round((ex.walkSec ?? 0) / 60)}′ ${bearingToChinese(bearingBetween(report.center, ex.location))}」意思是：走 ${Math.round((ex.walkSec ?? 0) / 60)} 分钟，在你的${bearingToChinese(bearingBetween(report.center, ex.location))}边。`
    : ''
  return `下面是 15 分钟内真能走到的店和场所，按类别分组、由近到远，每类最多列 8 家。每行末尾的数字是步行分钟，后面的字是方向。${exTxt}带 * 的是估算值（那一家没算出真实路线）。`
}

/** 12 方向：最远和最近的方向 */
export function explainReach(report: HealthReport): string {
  const reach = report.isochrone.reachRadiusByBearing
  if (reach.length === 0) return ''
  const max = reach.reduce((a, b) => (b.radiusM > a.radiusM ? b : a))
  const min = reach.reduce((a, b) => (b.radiusM < a.radiusM ? b : a))
  const ratio = max.radiusM > 0 ? Math.round((1 - min.radiusM / max.radiusM) * 100) : 0
  return `把 15 分钟的圈按 16 个方向量了一遍：往${bearingToChinese(max.bearingDeg)}走 15 分钟能到 ${Math.round(max.radiusM)} 米最远，往${bearingToChinese(min.bearingDeg)}只有 ${Math.round(min.radiusM)} 米，短了 ${ratio}%。数字小的方向通常是被河、铁路、封闭小区或没有人行道的大路挡住了，要绕路。条越长走得越远。`
}

/** 13 盲区分布：集中在哪个方向、缺什么 */
export function explainBlindByDirection(report: HealthReport): string {
  const cells = report.blindSpots
  if (cells.length === 0)
    return '周边 1.5 公里内没有盲区：不管站在哪个格子，1 公里内都能找到菜市场、药店和小学。'
  const byDir = new Map<string, number>()
  for (const c of cells) {
    const d = bearingToChinese(bearingBetween(report.center, c.center))
    byDir.set(d, (byDir.get(d) ?? 0) + 1)
  }
  const top = [...byDir.entries()].sort((a, b) => b[1] - a[1])[0]
  const missCount = new Map<string, number>()
  for (const c of cells) for (const m of c.missing) missCount.set(m, (missCount.get(m) ?? 0) + 1)
  const topMiss = [...missCount.entries()].sort((a, b) => b[1] - a[1])[0]
  const missLabel =
    report.categories.find((c) => c.category === topMiss?.[0])?.label ?? topMiss?.[0]
  const inIso = cells.filter((c) => c.inIsochrone).length
  const nearest = cells.reduce((a, b) =>
    haversineM(report.center, b.center) < haversineM(report.center, a.center) ? b : a
  )
  return `「盲区」是这样一块地方：站在那里，1 公里内找不到菜市场、药店或小学中的至少一种。我们把你周边 1.5 公里切成 200 米的小方格逐个检查，共 ${cells.length} 格是盲区，主要集中在你的${top[0]}边（${top[1]} 格），最缺的是${missLabel}（${topMiss?.[1]} 格缺）。离你最近的盲区在${bearingToChinese(bearingBetween(report.center, nearest.center))}边 ${formatMeters(haversineM(report.center, nearest.center))}处。${
    inIso > 0
      ? `其中 ${inIso} 格在你 15 分钟能走到的范围内，这些最该优先补。`
      : '这些格子都在你 15 分钟圈之外，对你本人影响小，主要影响那一片的邻居。'
  }下表按方向列出了数量、距离和缺什么。`
}
