/**
 * 对比报告每一节的"大白话"说明：把两地的真实数字写进句子。
 * 写法与 lib/report/explain.ts 一致，全部纯函数。
 */
import type { Comparison, Slot } from '@/lib/ui/compare'
import { fmtKm2 } from '@/lib/ui/format'
import {
  blindSummary,
  closerCount,
  missingEssentials,
  ringOf,
  strongWeak,
  walkerVerdict,
  within15,
} from '@/lib/ui/compareRows'

const who = (c: Comparison, s: Slot) => `${s}（${s === 'A' ? c.nameA : c.nameB}）`
const names = (xs: { label: string }[]) => xs.map((x) => x.label).join('、')

/** 01 地图 */
export function explainCompareMap(c: Comparison): string {
  const ra = ringOf(c.a, 15)?.areaKm2 ?? 0
  const rb = ringOf(c.b, 15)?.areaKm2 ?? 0
  const bigger = ra === rb ? null : ra > rb ? 'A' : 'B'
  const size =
    bigger == null
      ? `两地 15 分钟圈都是 ${fmtKm2(ra)} km²`
      : `${bigger} 的圈更大（${fmtKm2(Math.max(ra, rb))} vs ${fmtKm2(Math.min(ra, rb))} km²）`
  return `左右两张图各以红点为中心，由外到内三条实线是 15、10、5 分钟真实步行能走到的边界，青点是圈内的菜市场、药店、小学。圈往哪边伸得远，说明那边路顺；缩回来的方向是被河、铁路或大路挡住了。${size}。`
}

/** 02 综合评分 */
export function explainCompareScores(c: Comparison): string {
  const d = Math.abs(c.scoreDiff)
  if (c.scoreWinner === 'tie')
    return `两地综合都是 ${c.a.overallScore} 分。分数 = 硬指标（菜市场、药店、小学）占 60% + 其余七类加分项占 40%。`
  const w = c.scoreWinner
  const wins = c.rows
    .filter((r) => r.winner === w)
    .sort((x, y) => Math.abs(y.scoreDiff) - Math.abs(x.scoreDiff))
    .slice(0, 3)
  return `${who(c, w)}综合 ${w === 'A' ? c.a.overallScore : c.b.overallScore} 分，比另一边高 ${d} 分${
    wins.length ? `，差距主要来自${names(wins)}` : ''
  }。分数 = 硬指标（菜市场、药店、小学）占 60% + 其余七类加分项占 40%，满分 100。`
}

/** 03 雷达 */
export function explainCompareRadar(c: Comparison): string {
  const a = strongWeak(c.a)
  const b = strongWeak(c.b)
  const weakTxt = (w: typeof a.weak) => {
    const real = w.filter((x) => x.score < 70)
    return real.length ? `最弱的是${names(real)}` : '十类都在 70 分以上'
  }
  return `十个角一角一类设施，离外圈越近分数越高。A 实线青色、B 虚线赭色，谁的图形更饱满谁的设施更齐。A 最靠外的是${names(a.strong)}，${weakTxt(a.weak)}；B 最靠外的是${names(b.strong)}，${weakTxt(b.weak)}。红字三项是国家规定必须有的硬指标。`
}

/** 04 分组柱 */
export function explainCompareWalk(c: Comparison): string {
  const wa = within15(c.a)
  const wb = within15(c.b)
  const ca = closerCount(c, 'A')
  const cb = closerCount(c, 'B')
  const top = c.rows
    .filter((r) => r.walkDiffMin != null && r.walkDiffMin !== 0)
    .sort((x, y) => Math.abs(y.walkDiffMin!) - Math.abs(x.walkDiffMin!))[0]
  const ex = top
    ? `差最多的是${top.label}：A ${Math.round(top.a.nearestWalkMin ?? 0)} 分钟、B ${Math.round(top.b.nearestWalkMin ?? 0)} 分钟。`
    : ''
  return `每类两根柱，青色是 A、赭色是 B，长度是离最近一家走过去要几分钟，越短越好；红线是 15 分钟。A 有 ${wa} 类在 15 分钟内，B 有 ${wb} 类；A 更近的 ${ca} 类，B 更近的 ${cb} 类。${ex}画斜纹的表示周边 1.8 公里内一家也没有。`
}

/** 05 对照表 */
export function explainCompareTable(c: Comparison): string {
  const tie = c.rows.filter((r) => r.winner === 'tie').length
  const ca = closerCount(c, 'A')
  const cb = closerCount(c, 'B')
  return `逐类把两地最近一家的步行分钟放在一起看：差值 = B − A，负数表示 B 更近；「谁更好」先比得分再比分钟，${c.rows.length} 类里 A 更好 ${ca} 类、B 更好 ${cb} 类${tie ? `、持平 ${tie} 类` : ''}。硬指标三项红字，比加分项更要紧。`
}

/** 06 硬指标 */
export function explainCompareEssentials(c: Comparison): string {
  const ma = missingEssentials(c.a)
  const mb = missingEssentials(c.b)
  const seg = (s: Slot, m: string[]) =>
    m.length ? `${s} 1 公里内缺${m.join('、')}` : `${s} 三项齐全`
  const ess = c.rows.filter((r) => r.essential)
  const fm = (m: number | null) => (m == null ? '无' : `${Math.round(m)} 分钟`)
  const nearer = ess
    .filter((r) => r.winner !== 'tie')
    .map(
      (r) =>
        `${r.label} ${r.winner} 更近（A ${fm(r.a.nearestWalkMin)} vs B ${fm(r.b.nearestWalkMin)}）`
    )
    .join('、')
  return `菜市场、药店、小学是国家标准里必须有的三项，看的是「最近一处走几分钟」，不看数量。${seg('A', ma)}，${seg('B', mb)}${nearer ? `；${nearer}` : ''}。缺一项就是最要紧的短板。`
}

/** 07 等时圈 */
export function explainCompareIso(c: Comparison): string {
  const ra = ringOf(c.a, 15)?.areaKm2 ?? 0
  const rb = ringOf(c.b, 15)?.areaKm2 ?? 0
  const ca = c.a.isochrone.circularity
  const cb = c.b.isochrone.circularity
  const rounder = Math.abs(ca - cb) < 0.03 ? null : ca > cb ? 'A' : 'B'
  return `15 分钟圈 A ${fmtKm2(ra)} km²、B ${fmtKm2(rb)} km²，等效半径 A ${Math.round(c.a.isochrone.equivalentRadiusM)} 米、B ${Math.round(c.b.isochrone.equivalentRadiusM)} 米。「圆度」越接近 1 各方向越走得开，A ${ca.toFixed(2)}、B ${cb.toFixed(2)}${rounder ? `，${rounder} 的路网更通达` : '，两地相当'}。下表是 16 个方向各自 15 分钟能走多远，差 = B − A。`
}

/** 08 盲区 */
export function explainCompareBlind(c: Comparison): string {
  const sa = blindSummary(c.a)
  const sb = blindSummary(c.b)
  const one = (s: Slot, x: typeof sa) =>
    x.total === 0
      ? `${s} 周边 1.5 公里没有盲区`
      : `${s} 有 ${x.total} 格盲区（圈内 ${x.inner} 格，约 ${fmtKm2(x.areaKm2)} km²${x.topMissing ? `，最缺${x.topMissing}` : ''}）`
  const fewer = sa.total === sb.total ? null : sa.total < sb.total ? 'A' : 'B'
  return `「盲区」是站在那里 1 公里内找不到菜市场、药店或小学中至少一种的 200 米方格。${one('A', sa)}；${one('B', sb)}。${
    fewer ? `${fewer} 的盲区更少。` : '两地盲区数量相同。'
  }圈内盲区是 15 分钟能走到却仍缺设施的地方，最该优先补。`
}

/** 09 规划建议 */
export function explainCompareSuggestions(c: Comparison): string {
  const one = (s: Slot, r: Comparison['a']) => {
    const high = r.suggestions.filter((x) => x.priority === 'high').length
    return `${s} ${r.suggestions.length} 条${high ? `（${high} 条优先）` : ''}`
  }
  return `建议按优先级排序：红色「优先」是补硬指标缺口，赭色「建议」是拉近偏远类别，青色「可选」是锦上添花。${one('A', c.a)}，${one('B', c.b)}。`
}

/** 10 给普通读者的一句话 */
export function readerSummary(c: Comparison): string {
  const v = walkerVerdict(c)
  if (v.winner === 'tie')
    return `两地都差不多适合「步行生活」：15 分钟内能走到的设施类别一样多，综合分也相同。`
  const w = v.winner
  const l: Slot = w === 'A' ? 'B' : 'A'
  const parts = v.top.map((r) => {
    const mine = r.winner === w ? r : r
    const wm = w === 'A' ? mine.a.nearestWalkMin : mine.b.nearestWalkMin
    const lm = w === 'A' ? mine.b.nearestWalkMin : mine.a.nearestWalkMin
    const fm = (m: number | null) => (m == null ? '没有' : `${Math.round(m)} 分钟`)
    return `${r.label}（${w} ${fm(wm)}，${l} ${fm(lm)}）`
  })
  return `${who(c, w)}更适合「步行生活」：15 分钟内能走到 ${within15(w === 'A' ? c.a : c.b)} 类设施，${l} 只有 ${within15(l === 'A' ? c.a : c.b)} 类；差距主要在${parts.join('、')}。`
}
