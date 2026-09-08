/**
 * 街道级批量体检 · 大白话解释：把真实数字写进句子（风格照 lib/report/explain.ts）。全部纯函数。
 */
import type { BatchPointSummary, BatchReport } from '@/lib/types'
import { formatMinutes } from '@/lib/report/format'
import { GRADE_LABEL } from '@/lib/ui/theme'
import { areaName, rankPoints, shortPointAddress } from '@/components/batch/batchGeo'

const ESSENTIAL_LABEL = { market: '菜市场', pharmacy: '药店', primary_school: '小学' } as const
type EssKey = keyof typeof ESSENTIAL_LABEL
const ESS_KEYS = Object.keys(ESSENTIAL_LABEL) as EssKey[]

const pct = (r: number) => `${Math.round(r * 100)}%`
const addr = (p: BatchPointSummary) => shortPointAddress(p.address)

/** 某点缺哪几项硬指标（>15 分钟或没有） */
export function missingEssentials(p: BatchPointSummary): string[] {
  return ESS_KEYS.filter((k) => {
    const m = p.essentialWalkMin[k]
    return m == null || m > 15
  }).map((k) => ESSENTIAL_LABEL[k])
}

/** 首屏：范围、点数、平均分、最高最低 */
export function explainBatchOverview(r: BatchReport): string {
  const ranked = rankPoints(r.points)
  const top = ranked[0]
  const bottom = ranked[ranked.length - 1]
  if (!top || !bottom) return '本次没有体检成功的点位。'
  const diff = top.overallScore - bottom.overallScore
  const spread =
    diff >= 30
      ? '说明这条街内部差距很大，好的地方和差的地方不是一个水平'
      : diff >= 15
        ? '说明这条街各处水平有差别，但没有到两极分化'
        : '说明这条街各处水平比较均匀'
  return `这次把「${areaName(r.area)}」约 ${r.areaKm2.toFixed(2)} km² 的范围每隔 ${r.spacingM} 米布一个点，共 ${r.points.length} 个点逐个做了 15 分钟生活圈体检。平均 ${r.scoreAvg} 分（${GRADE_LABEL[gradeOf(r.scoreAvg)]}），最好的一处 ${top.overallScore} 分在${addr(top)}，最差的一处 ${bottom.overallScore} 分在${addr(bottom)}，相差 ${diff} 分，${spread}。`
}

/** 排名表怎么读 */
export function explainBatchRanking(r: BatchReport): string {
  const over = r.points.filter((p) => missingEssentials(p).length > 0)
  const blind = r.points.filter((p) => p.blindInIso > 0)
  return `表里每一行是一个体检点，按分数从高到低排。中间三个数字是从那个点出发，走到最近的菜市场、药店、小学各要几分钟，红字表示超过 15 分钟或者周边根本没有；最后一列是它 15 分钟圈里还缺硬指标的网格数，越多越要紧。${
    over.length === 0
      ? '所有点位三项硬指标都在 15 分钟内。'
      : `共 ${over.length} 个点至少有一项硬指标走不到，${blind.length} 个点圈内仍有盲区。`
  }点一行，地图会跳到那个点。`
}

/** 十类可达占比 */
export function explainBatchCoverage(r: BatchReport): string {
  const cov = r.coverageByCategory.slice().sort((a, b) => b.ratio - a.ratio)
  const best = cov[0]
  const worst = cov[cov.length - 1]
  if (!best || !worst) return ''
  const ess = r.coverageByCategory.filter((c) => c.essential)
  const essTxt = ess.map((c) => `${c.label} ${pct(c.ratio)}`).join('、')
  const essWeak = ess.filter((c) => c.ratio < 0.8)
  return `每条横条表示：全部 ${r.points.length} 个点里，有多大比例 15 分钟内能走到这类设施。${best.label}覆盖最好（${pct(best.ratio)}），${worst.label}最差（${pct(worst.ratio)}）。红字的三项硬指标分别是 ${essTxt}${
    essWeak.length
      ? `，其中${essWeak.map((c) => c.label).join('、')}不到八成，是这条街最该补的`
      : '，三项都在八成以上'
  }。`
}

/** 最差三点 */
export function explainBatchWorst(r: BatchReport): string {
  const worst = r.worst
    .map((i) => r.points.find((p) => p.index === i))
    .filter((p): p is BatchPointSummary => !!p)
  if (worst.length === 0) return ''
  const parts = worst.map((p) => {
    const miss = missingEssentials(p)
    return `${addr(p)} ${p.overallScore} 分${miss.length ? `（缺${miss.join('、')}）` : ''}`
  })
  return `这三处是分数垫底的：${parts.join('；')}。新增设施如果放在这几处附近，整条街的平均分提升最快；点卡片可以看那个点的完整报告。`
}

/** 建议 */
export function explainBatchSuggestions(r: BatchReport): string {
  const n = (k: 'high' | 'medium' | 'low') => r.suggestions.filter((s) => s.priority === k).length
  return `建议按优先级排：「优先」是不补就会让多个点位继续缺硬指标的项，「建议」能明显提分，「可选」是锦上添花。本次共 ${n('high')} 条优先、${n('medium')} 条建议、${n('low')} 条可选，都是从 ${r.points.length} 个点的短板里归纳出来的，具体选址还要结合用地条件。`
}

/** 结论 */
export function explainBatchConclusion(r: BatchReport): string {
  const grades = { A: 0, B: 0, C: 0, D: 0 }
  for (const p of r.points) grades[p.overallGrade]++
  return `${r.points.length} 个点里 ${grades.A} 个优、${grades.B} 个良、${grades.C} 个中、${grades.D} 个差。上面几条是系统按分数和短板自动归纳的结论，读完这几句就知道这条街的生活圈大致什么水平。`
}

/** 打印：地图图注 */
export function explainBatchMap(r: BatchReport): string {
  return `墨色虚线是本次体检范围，每个圆点是一个体检点，颜色表示综合评级（青 = 优，苔绿 = 良，赭 = 中，朱砂 = 差）。点距 ${r.spacingM} 米，共 ${r.points.length} 个点。`
}

/** 打印：方法说明 */
export function explainBatchMethod(r: BatchReport): string {
  const fast = r.reports[0]?.isochrone.reachRadiusByBearing.length ?? 8
  return `范围内按 ${r.spacingM} 米间距布设网格点，每个点独立做一次 15 分钟生活圈体检：向 ${fast} 个方向批量步行算路拟合等时圈，检索十类民生设施并计算步行时间，按「硬指标 60% + 加分项 40%」评分，再扫描 200 米网格盲区。街道级分数是各点简单平均；「可达占比」是 15 分钟内能走到该类设施的点位数 ÷ 总点数。本次共调用地点检索 ${r.apiStats.placeSearch} 次、批量算路 ${r.apiStats.routeMatrix} 次（${r.apiStats.routeMatrixPairs} 对起终点），耗时 ${(r.apiStats.elapsedMs / 1000).toFixed(0)} 秒${r.apiStats.degraded ? `，${r.apiStats.degraded} 处改用直线估算` : ''}。数据来源：百度地图${r.dataSource === 'sample' ? '（内置样例）' : r.dataSource === 'mixed' ? '（部分估算）' : ''}。`
}

/** 单点一行硬指标 */
export function essentialLine(p: BatchPointSummary): string {
  return ESS_KEYS.map((k) => `${ESSENTIAL_LABEL[k]} ${formatMinutes(p.essentialWalkMin[k])}`).join(
    ' · '
  )
}

export function gradeOf(score: number): 'A' | 'B' | 'C' | 'D' {
  return score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D'
}
