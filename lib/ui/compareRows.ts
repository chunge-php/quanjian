/**
 * 对比报告（打印版）用到的派生数据：最强/最弱类别、16 方向可达距离并排、盲区汇总与按方位并排。
 * 全部纯函数，不含 JSX。
 */
import type { CategoryScore, FacilityCategory, HealthReport } from '@/lib/types'
import { FACILITY_CATEGORIES } from '@/lib/categories'
import { bearingToChinese } from '@/lib/report/format'
import { bearingBetween, haversineM } from '@/lib/isochrone/geo'
import type { CategoryRow, Comparison, Slot, Winner } from '@/lib/ui/compare'

export const DIR_ORDER = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const

export function ringOf(r: HealthReport, minutes: 5 | 10 | 15) {
  return r.isochrone.rings.find((x) => x.minutes === minutes) ?? null
}

/** 最强三类 / 最弱三类（按得分） */
export function strongWeak(report: HealthReport): {
  strong: CategoryScore[]
  weak: CategoryScore[]
} {
  const sorted = report.categories.slice().sort((a, b) => b.score - a.score)
  return { strong: sorted.slice(0, 3), weak: sorted.slice(-3).reverse() }
}

export interface ReachRow {
  bearingDeg: number
  dir: string
  a: number
  b: number
  /** B − A（米） */
  diff: number
}

/** 16 方向可达距离并排：按 A 的方位角对齐，B 取最接近的方位 */
export function reachRows(c: Comparison): ReachRow[] {
  const rb = c.b.isochrone.reachRadiusByBearing
  return c.a.isochrone.reachRadiusByBearing.map((ra) => {
    const match = rb.reduce<{ radiusM: number; bearingDeg: number } | null>((best, x) => {
      const d = Math.abs(((x.bearingDeg - ra.bearingDeg + 540) % 360) - 180)
      const bd = best ? Math.abs(((best.bearingDeg - ra.bearingDeg + 540) % 360) - 180) : 999
      return d < bd ? x : best
    }, null)
    const a = Math.round(ra.radiusM)
    const b = Math.round(match?.radiusM ?? 0)
    return { bearingDeg: ra.bearingDeg, dir: bearingToChinese(ra.bearingDeg), a, b, diff: b - a }
  })
}

export interface BlindSummary {
  inner: number
  total: number
  /** 盲区总面积（km²）= 格数 × 格边长² */
  areaKm2: number
  /** 三项全缺的格数 */
  severe: number
  /** 最缺的类别中文名；无盲区为 null */
  topMissing: string | null
  topMissingCount: number
}

export function blindSummary(report: HealthReport): BlindSummary {
  const cells = report.blindSpots
  const sizeM = cells[0]?.sizeM ?? 200
  const miss = new Map<FacilityCategory, number>()
  for (const cell of cells) for (const m of cell.missing) miss.set(m, (miss.get(m) ?? 0) + 1)
  const top = [...miss.entries()].sort((x, y) => y[1] - x[1])[0]
  return {
    inner: cells.filter((x) => x.inIsochrone).length,
    total: cells.length,
    areaKm2: cells.length * (sizeM / 1000) ** 2,
    severe: cells.filter((x) => x.severity >= 0.99).length,
    topMissing: top ? labelOf(top[0]) : null,
    topMissingCount: top?.[1] ?? 0,
  }
}

export interface DirStat {
  count: number
  inIso: number
  minM: number
  maxM: number
  missing: string
}

export interface BlindDirRow {
  dir: string
  a: DirStat | null
  b: DirStat | null
}

function labelOf(k: FacilityCategory): string {
  return FACILITY_CATEGORIES.find((c) => c.key === k)?.label ?? k
}

function groupByDir(report: HealthReport): Map<string, DirStat> {
  const acc = new Map<string, DirStat & { miss: Record<string, number> }>()
  for (const cell of report.blindSpots) {
    const dir = bearingToChinese(bearingBetween(report.center, cell.center))
    const d = haversineM(report.center, cell.center)
    const g = acc.get(dir) ?? { count: 0, inIso: 0, minM: Infinity, maxM: 0, missing: '', miss: {} }
    g.count += 1
    if (cell.inIsochrone) g.inIso += 1
    g.minM = Math.min(g.minM, d)
    g.maxM = Math.max(g.maxM, d)
    for (const m of cell.missing) g.miss[m] = (g.miss[m] ?? 0) + 1
    acc.set(dir, g)
  }
  const out = new Map<string, DirStat>()
  for (const [dir, g] of acc) {
    const missing = Object.entries(g.miss)
      .sort((x, y) => y[1] - x[1])
      .map(([k, n]) => `${labelOf(k as FacilityCategory)} ${n}`)
      .join('、')
    out.set(dir, { count: g.count, inIso: g.inIso, minM: g.minM, maxM: g.maxM, missing })
  }
  return out
}

/** 盲区按方位 A / B 并排（八方位固定顺序，两边都没有的方位不列） */
export function blindDirRows(c: Comparison): BlindDirRow[] {
  const ga = groupByDir(c.a)
  const gb = groupByDir(c.b)
  return DIR_ORDER.filter((d) => ga.has(d) || gb.has(d)).map((dir) => ({
    dir,
    a: ga.get(dir) ?? null,
    b: gb.get(dir) ?? null,
  }))
}

/** 15 分钟内能走到的类别数 */
export function within15(report: HealthReport): number {
  return report.categories.filter((x) => x.nearestWalkMin != null && x.nearestWalkMin <= 15).length
}

/** 某一方步行更近的类别数 */
export function closerCount(c: Comparison, slot: Slot): number {
  return c.rows.filter((r) => r.winner === slot).length
}

/** 「谁更适合步行生活」：赢家 + 差距最大的三类（按步行分钟差；无差值再按得分差） */
export function walkerVerdict(c: Comparison): { winner: Winner; top: CategoryRow[] } {
  const wa = within15(c.a)
  const wb = within15(c.b)
  let winner: Winner
  if (wa !== wb) winner = wa > wb ? 'A' : 'B'
  else if (c.scoreWinner !== 'tie') winner = c.scoreWinner
  else {
    const ca = closerCount(c, 'A')
    const cb = closerCount(c, 'B')
    winner = ca === cb ? 'tie' : ca > cb ? 'A' : 'B'
  }
  const pool = winner === 'tie' ? c.rows : c.rows.filter((r) => r.winner === winner)
  const top = pool
    .slice()
    .sort(
      (x, y) =>
        Math.abs(y.walkDiffMin ?? 0) - Math.abs(x.walkDiffMin ?? 0) ||
        Math.abs(y.scoreDiff) - Math.abs(x.scoreDiff)
    )
    .slice(0, 3)
  return { winner, top }
}

/** 硬指标缺口（1 公里内没有的类别名） */
export function missingEssentials(report: HealthReport): string[] {
  return report.categories.filter((x) => x.essential && x.countWithin1km === 0).map((x) => x.label)
}
