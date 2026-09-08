import type { CategoryScore, FacilityCategory, HealthReport } from '@/lib/types'
import { fmtKm2, shortAddress } from '@/lib/ui/format'

/** 对比槽位：A = 当前报告，B = 对比报告 */
export type Slot = 'A' | 'B'

/** 槽位配色（与 globals.css 令牌一致，地图叠加层用 MAP_OVERLAY 里的预加饱和版本） */
export const SLOT_COLOR: Record<Slot, string> = { A: 'var(--teal)', B: 'var(--ochre)' }
export const SLOT_HEX: Record<Slot, string> = { A: '#1f6e6a', B: '#b0801f' }
export const SLOT_SOFT: Record<Slot, string> = {
  A: 'rgba(31,110,106,0.22)',
  B: 'rgba(176,128,31,0.22)',
}

export type Winner = Slot | 'tie'

export interface CategoryRow {
  category: FacilityCategory
  label: string
  essential: boolean
  a: CategoryScore
  b: CategoryScore
  /** B 步行分钟 − A 步行分钟；任一侧不可达时为 null */
  walkDiffMin: number | null
  /** B 得分 − A 得分 */
  scoreDiff: number
  /** 步行更近（或得分更高）的一方 */
  winner: Winner
}

export interface MetricRow {
  label: string
  a: string
  b: string
  /** 哪一方更优；null = 不比高低 */
  winner: Winner | null
  note?: string
}

export interface Comparison {
  a: HealthReport
  b: HealthReport
  nameA: string
  nameB: string
  scoreDiff: number
  scoreWinner: Winner
  rows: CategoryRow[]
  isoRows: MetricRow[]
  blindRows: MetricRow[]
  conclusion: string[]
}

export function slotName(report: HealthReport | null | undefined, max = 18): string {
  const s = report?.address.formatted?.trim()
  return s ? shortAddress(s, max) : '未命名地点'
}

/** 两个类别得分谁更好：分数高者赢；同分看步行分钟；都不可达算平 */
function categoryWinner(a: CategoryScore, b: CategoryScore): Winner {
  if (a.score !== b.score) return a.score > b.score ? 'A' : 'B'
  const wa = a.nearestWalkMin
  const wb = b.nearestWalkMin
  if (wa == null && wb == null) return 'tie'
  if (wa == null) return 'B'
  if (wb == null) return 'A'
  if (Math.abs(wa - wb) < 0.5) return 'tie'
  return wa < wb ? 'A' : 'B'
}

function ring15(r: HealthReport) {
  return r.isochrone.rings.find((x) => x.minutes === 15) ?? r.isochrone.rings[0]
}

function cmp(a: number, b: number, higherIsBetter: boolean, eps = 0): Winner {
  if (Math.abs(a - b) <= eps) return 'tie'
  const aWins = higherIsBetter ? a > b : a < b
  return aWins ? 'A' : 'B'
}

export function buildComparison(a: HealthReport, b: HealthReport): Comparison {
  const byKeyB = new Map(b.categories.map((c) => [c.category, c]))
  const rows: CategoryRow[] = a.categories
    .map((ca) => {
      const cb = byKeyB.get(ca.category)
      if (!cb) return null
      const walkDiffMin =
        ca.nearestWalkMin != null && cb.nearestWalkMin != null
          ? Math.round(cb.nearestWalkMin - ca.nearestWalkMin)
          : null
      return {
        category: ca.category,
        label: ca.label,
        essential: ca.essential,
        a: ca,
        b: cb,
        walkDiffMin,
        scoreDiff: cb.score - ca.score,
        winner: categoryWinner(ca, cb),
      }
    })
    .filter((r): r is CategoryRow => r != null)

  const r15a = ring15(a)
  const r15b = ring15(b)
  const isoRows: MetricRow[] = [
    {
      label: '15 分钟圈面积',
      a: `${fmtKm2(r15a?.areaKm2 ?? NaN)} km²`,
      b: `${fmtKm2(r15b?.areaKm2 ?? NaN)} km²`,
      winner: cmp(r15a?.areaKm2 ?? 0, r15b?.areaKm2 ?? 0, true, 0.02),
      note: '越大说明 15 分钟能走到的范围越广',
    },
    {
      label: '等效半径',
      a: `${Math.round(a.isochrone.equivalentRadiusM)} m`,
      b: `${Math.round(b.isochrone.equivalentRadiusM)} m`,
      winner: cmp(a.isochrone.equivalentRadiusM, b.isochrone.equivalentRadiusM, true, 15),
    },
    {
      label: '圆度',
      a: a.isochrone.circularity.toFixed(2),
      b: b.isochrone.circularity.toFixed(2),
      winner: cmp(a.isochrone.circularity, b.isochrone.circularity, true, 0.03),
      note: '越接近 1 各方向越走得开',
    },
  ]

  const inner = (r: HealthReport) => r.blindSpots.filter((c) => c.inIsochrone).length
  const severe = (r: HealthReport) => r.blindSpots.filter((c) => c.severity >= 0.99).length
  const blindRows: MetricRow[] = [
    {
      label: '圈内盲区格',
      a: String(inner(a)),
      b: String(inner(b)),
      winner: cmp(inner(a), inner(b), false),
      note: '15 分钟能走到却缺硬指标的 200 m 网格',
    },
    {
      label: '盲区格总数',
      a: String(a.blindSpots.length),
      b: String(b.blindSpots.length),
      winner: cmp(a.blindSpots.length, b.blindSpots.length, false),
    },
    {
      label: '三项全缺',
      a: String(severe(a)),
      b: String(severe(b)),
      winner: cmp(severe(a), severe(b), false),
    },
  ]

  const scoreDiff = b.overallScore - a.overallScore
  const scoreWinner: Winner = scoreDiff === 0 ? 'tie' : scoreDiff > 0 ? 'B' : 'A'
  const nameA = slotName(a)
  const nameB = slotName(b)

  return {
    a,
    b,
    nameA,
    nameB,
    scoreDiff,
    scoreWinner,
    rows,
    isoRows,
    blindRows,
    conclusion: buildConclusion({ a, b, nameA, nameB, scoreDiff, scoreWinner, rows, isoRows }),
  }
}

/** 直白结论：综合分差 → 赢在哪几类 → 输家哪类更近 → 硬指标缺口 → 等时圈大小 */
function buildConclusion(c: {
  a: HealthReport
  b: HealthReport
  nameA: string
  nameB: string
  scoreDiff: number
  scoreWinner: Winner
  rows: CategoryRow[]
  isoRows: MetricRow[]
}): string[] {
  const out: string[] = []
  const who = (s: Slot) => `${s}（${s === 'A' ? c.nameA : c.nameB}）`
  const d = Math.abs(c.scoreDiff)

  if (c.scoreWinner === 'tie') {
    out.push(`两地综合得分相同，都是 ${c.a.overallScore} 分。`)
  } else {
    const w = c.scoreWinner
    const l: Slot = w === 'A' ? 'B' : 'A'
    // 赢家领先最多的类别（按分差排序，取前三）
    const winsOf = c.rows
      .filter((r) => r.winner === w)
      .sort((x, y) => Math.abs(y.scoreDiff) - Math.abs(x.scoreDiff))
      .slice(0, 3)
    // 输家步行更近的类别（取前两条）
    const closerOf = c.rows
      .filter((r) => r.winner === l && r.walkDiffMin != null && r.walkDiffMin !== 0)
      .sort((x, y) => Math.abs(y.walkDiffMin!) - Math.abs(x.walkDiffMin!))
      .slice(0, 2)
    let s = `${who(w)}综合${d < 3 ? '略高' : '高'} ${d} 分`
    if (winsOf.length) s += `，主要赢在${winsOf.map((r) => r.label).join('、')}`
    s += '。'
    if (closerOf.length) {
      const parts = closerOf.map((r) => {
        const la = r.a.nearestWalkMin
        const lb = r.b.nearestWalkMin
        const mine = Math.round((l === 'A' ? la : lb) ?? 0)
        const other = Math.round((l === 'A' ? lb : la) ?? 0)
        return `${r.label}更近（${mine} 分钟 vs ${other} 分钟）`
      })
      s += `${l} 的${parts.join('，')}。`
    } else {
      s += `${l} 没有明显领先的类别。`
    }
    out.push(s)
  }

  // 硬指标缺口
  const missing = (r: HealthReport) =>
    r.categories.filter((x) => x.essential && x.countWithin1km === 0).map((x) => x.label)
  const ma = missing(c.a)
  const mb = missing(c.b)
  if (ma.length || mb.length) {
    const seg: string[] = []
    if (ma.length) seg.push(`A 1 公里内缺${ma.join('、')}`)
    else seg.push('A 三项硬指标齐全')
    if (mb.length) seg.push(`B 1 公里内缺${mb.join('、')}`)
    else seg.push('B 三项硬指标齐全')
    out.push(`${seg.join('，')}。硬指标缺一项就是国家标准里的短板，比加分项更要紧。`)
  } else {
    out.push('两地 1 公里内菜市场、药店、小学都有，硬指标都齐全，差距来自加分项。')
  }

  // 等时圈
  const ra = ring15(c.a)?.areaKm2 ?? 0
  const rb = ring15(c.b)?.areaKm2 ?? 0
  if (Math.abs(ra - rb) > 0.05) {
    const w: Slot = ra > rb ? 'A' : 'B'
    const big = Math.max(ra, rb)
    const small = Math.min(ra, rb)
    const pct = small > 0 ? Math.round((big / small - 1) * 100) : 0
    out.push(
      `${w} 的 15 分钟圈更大（${fmtKm2(big)} vs ${fmtKm2(small)} km²${pct ? `，大 ${pct}%` : ''}），路网更通达，同样 15 分钟能走到更多地方。`
    )
  } else {
    out.push(`两地 15 分钟圈大小接近（约 ${fmtKm2(ra)} km²），路网通达程度相当。`)
  }
  return out
}
