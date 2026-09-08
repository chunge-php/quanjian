/**
 * 《docs/测试报告.md》数字复现脚本 —— 评委可自行运行，所有表格直接打印为 Markdown。
 *
 * 用法：
 *   pnpm tsx scripts/verify-report.ts             # 离线部分 + 在线核验（需 .env.local 的 BAIDU_SERVER_AK）
 *   pnpm tsx scripts/verify-report.ts --offline   # 只跑离线部分（仅读 data/samples/bishan-biquan.json）
 *   pnpm tsx scripts/verify-report.ts --sample <slug>
 *
 * 在线部分依次执行：冷/热两次完整分析（分阶段耗时 + 缓存效果）→ 清洗统计 → 5 条单条步行规划核验
 * → 4 个等时圈边界点核验 → 3 个盲区网格地点检索核验 → 并发 6 限流实测 → 假 AK 降级实测。
 * 脚本不会向任何文件写入 AK；日志中的 URL 一律经 stripSecrets 处理。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ESSENTIAL_CATEGORIES, FACILITY_CATEGORIES } from '@/lib/categories'
import {
  BAIDU_API_BASE,
  CLEAN_RULES,
  createBaiduClient,
  fromBaiduLocation,
  matchesCategory,
  poiTag,
  stripSecrets,
  type BaiduPlaceResult,
} from '@/lib/baidu'
import { bearingBetween, haversineM, polygonPerimeterM } from '@/lib/isochrone'
import { runAnalysis } from '@/lib/pipeline/analyze'
import { defaultDeps } from '@/lib/pipeline/deps'
import { buildGridCenters } from '@/lib/report'
import type {
  AnalyzeStage,
  BlindSpotCell,
  FacilityCategory,
  HealthReport,
  LngLat,
  Poi,
} from '@/lib/types'

/* ------------------------------------------------------------------ 工具 */

const WALK_SPEED = 1.2
const R15_STRAIGHT = 900 * WALK_SPEED // 1080 m
const CIRCLE_1080_KM2 = Math.PI * 1.08 ** 2
const CIRCLE_1000_KM2 = Math.PI * 1 ** 2

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

function args(): Record<string, string> {
  const out: Record<string, string> = {}
  const a = process.argv.slice(2)
  for (let i = 0; i < a.length; i++)
    if (a[i].startsWith('--'))
      out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'true'
  return out
}

const f1 = (n: number) => n.toFixed(1)
const f2 = (n: number) => n.toFixed(2)
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const min = (sec: number | null | undefined) => (sec == null ? '—' : f1(sec / 60))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function h(title: string) {
  console.log(`\n## ${title}\n`)
}
function table(headers: string[], rows: (string | number)[][]) {
  console.log(`| ${headers.join(' | ')} |`)
  console.log(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
  console.log()
}

function ring15(report: HealthReport): LngLat[] {
  const r = report.isochrone.rings.find((x) => x.minutes === 15)!
  return r.polygon.coordinates[0].map(([lng, lat]) => ({ lng, lat }))
}

function label(key: FacilityCategory) {
  return FACILITY_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function angDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/* ------------------------------------------------------------------ 离线：样例数字 */

function loadSample(slug: string): { report: HealthReport; createdAt: string } {
  const file = path.join(process.cwd(), 'data', 'samples', `${slug}.json`)
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const done = json.events.find((e: { type: string }) => e.type === 'done')
  if (!done) throw new Error(`${file} 中没有 done 事件`)
  return { report: done.report as HealthReport, createdAt: json.createdAt }
}

function sectionRings(report: HealthReport) {
  h('1.1 三环概览（样例）')
  const c = report.center
  const rows = report.isochrone.rings.map((r) => {
    const pts = r.polygon.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lng, lat }))
    const area = r.areaKm2
    const perim = polygonPerimeterM(pts)
    const circ = (4 * Math.PI * area * 1e6) / (perim * perim)
    const radii = pts.map((p) => ({
      b: Math.round(bearingBetween(c, p) * 10) / 10,
      r: haversineM(c, p),
    }))
    const longest = radii.reduce((a, b) => (b.r > a.r ? b : a))
    const shortest = radii.reduce((a, b) => (b.r < a.r ? b : a))
    return [
      `${r.minutes} min`,
      r.areaKm2.toFixed(4),
      Math.round(Math.sqrt((area * 1e6) / Math.PI)),
      circ.toFixed(3),
      `${longest.b}° / ${Math.round(longest.r)} m`,
      `${shortest.b}° / ${Math.round(shortest.r)} m`,
    ]
  })
  table(['环', '面积 km²', '等效半径 m', '圆度', '最长方向', '最短方向'], rows)
  console.log(
    `report.isochrone.equivalentRadiusM=${report.isochrone.equivalentRadiusM}，circularity=${report.isochrone.circularity}，samples=${report.isochrone.samples.length}（api 来源 ${report.isochrone.samples.filter((s) => s.source === 'api').length}，不可达 ${report.isochrone.samples.filter((s) => s.walkSec == null).length}）`
  )
}

function sectionBaseline(report: HealthReport) {
  h('1.2 与直线圆基线对比（15 分钟）')
  const a15 = report.isochrone.rings.find((r) => r.minutes === 15)!.areaKm2
  const pois = report.pois
  const inIso = pois.filter((p) => p.inIsochrone)
  const in1080 = pois.filter((p) => p.straightM <= 1080)
  const in1000 = pois.filter((p) => p.straightM <= 1000)
  const onlyCircle1080 = in1080.filter((p) => !p.inIsochrone)
  const onlyCircle1000 = in1000.filter((p) => !p.inIsochrone)
  const over900in1080 = in1080.filter((p) => (p.walkSec ?? 0) > 900)
  const essIso = ESSENTIAL_CATEGORIES.filter((k) => inIso.some((p) => p.category === k)).length
  const ess1080 = ESSENTIAL_CATEGORIES.filter((k) => in1080.some((p) => p.category === k)).length
  table(
    ['指标', '等时圈', '直线圆 1080 m', '直线圆 1000 m'],
    [
      ['面积 km²', a15.toFixed(4), CIRCLE_1080_KM2.toFixed(4), CIRCLE_1000_KM2.toFixed(4)],
      ['等时圈 / 基线', '100%', pct(a15 / CIRCLE_1080_KM2), pct(a15 / CIRCLE_1000_KM2)],
      [
        '基线高估倍数（基线/等时圈 − 1）',
        '—',
        pct(CIRCLE_1080_KM2 / a15 - 1),
        pct(CIRCLE_1000_KM2 / a15 - 1),
      ],
      ['等效半径 m', report.isochrone.equivalentRadiusM, 1080, 1000],
      ['圈内 POI 数', inIso.length, in1080.length, in1000.length],
      ['圈内硬指标类别数（0–3）', essIso, ess1080, '—'],
      ['仅在直线圆内、不在等时圈内的 POI 数', '—', onlyCircle1080.length, onlyCircle1000.length],
      ['直线 ≤1080 m 但真实步行 >15 min 的 POI 数', '—', over900in1080.length, '—'],
    ]
  )
  const worst = [...over900in1080].sort((a, b) => (b.walkSec ?? 0) - (a.walkSec ?? 0)).slice(0, 5)
  if (worst.length) {
    console.log('直线圆内"看得见走不到"最严重 5 例：')
    table(
      ['名称', '类别', '直线 m', '步行 m', '步行 min', '绕行系数'],
      worst.map((p) => [
        p.name,
        label(p.category),
        p.straightM,
        p.walkM ?? '—',
        min(p.walkSec),
        f2((p.walkM ?? 0) / p.straightM),
      ])
    )
  }
}

function sectionBearings(report: HealthReport) {
  h('1.3 各方向 15 分钟可达半径（样例）')
  const samples = report.isochrone.samples
  const rows = report.isochrone.reachRadiusByBearing.map(({ bearingDeg, radiusM }) => {
    const s750 = samples.find((s) => s.bearingDeg === bearingDeg && s.radiusM === 750)
    const s1000 = samples.find((s) => s.bearingDeg === bearingDeg && s.radiusM === 1000)
    const ratio = (s?: { walkSec: number | null; radiusM: number }) =>
      s && s.walkSec != null ? f2(s.walkSec / (s.radiusM / WALK_SPEED)) : '不可达'
    return [
      bearingDeg,
      radiusM,
      pct(1 - radiusM / R15_STRAIGHT),
      min(s750?.walkSec ?? null),
      ratio(s750),
      min(s1000?.walkSec ?? null),
      ratio(s1000),
    ]
  })
  table(
    [
      '方位角',
      '可达半径 m',
      '收缩率 vs 1080',
      '750 m 采样点步行 min',
      '750 m 绕行比',
      '1000 m 采样点步行 min',
      '1000 m 绕行比',
    ],
    rows
  )
  const r = report.isochrone.reachRadiusByBearing.map((x) => x.radiusM)
  console.log(
    `可达半径：最大 ${Math.max(...r)} m，最小 ${Math.min(...r)} m，平均 ${Math.round(r.reduce((a, b) => a + b, 0) / r.length)} m，平均收缩率 ${pct(1 - r.reduce((a, b) => a + b, 0) / r.length / R15_STRAIGHT)}`
  )
  console.log('（绕行比 = 采样点真实步行时长 ÷ 直线距离/1.2 m/s；>1.3 表示明显绕行）')
}

function sectionCategories(report: HealthReport) {
  h('2. 设施体检结果（样例）')
  const byCat = (k: FacilityCategory) => report.pois.filter((p) => p.category === k)
  table(
    [
      '类别',
      '硬指标',
      '检索到',
      '圈内',
      '1 km 内',
      '最近设施',
      '直线 m',
      '步行 m',
      '步行 min',
      '来源',
      '得分',
      '评级',
    ],
    report.categories.map((c) => [
      c.label,
      c.essential ? '是' : '',
      byCat(c.category).length,
      c.countInIsochrone,
      c.countWithin1km,
      c.nearest?.name ?? '—',
      c.nearest?.straightM ?? '—',
      c.nearest?.walkM ?? '—',
      c.nearestWalkMin ?? '—',
      c.nearest?.walkSource ?? '—',
      c.score,
      c.grade,
    ])
  )
  console.log(
    `综合评分 ${report.overallScore} / ${report.overallGrade}，POI 总数 ${report.pois.length}，圈内 ${report.pois.filter((p) => p.inIsochrone).length}，估算来源 ${report.pois.filter((p) => p.walkSource !== 'api').length}`
  )
  console.log(`headline：\n${report.headline.map((x, i) => `${i + 1}. ${x}`).join('\n')}`)
  console.log(
    `suggestions：${report.suggestions.length ? JSON.stringify(report.suggestions, null, 0) : '（空，无 C/D 类别）'}`
  )
  console.log(`warnings：${report.warnings.length ? report.warnings.join('；') : '（空）'}`)
}

/** 4-连通盲区簇 */
function clusters(cells: BlindSpotCell[], center: LngLat): number[] {
  const DEG = Math.PI / 180
  const R = 6371008.8
  const key = (c: BlindSpotCell) => {
    const dx = (c.center.lng - center.lng) * DEG * R * Math.cos(center.lat * DEG)
    const dy = (c.center.lat - center.lat) * DEG * R
    return [Math.round(dx / c.sizeM), Math.round(dy / c.sizeM)] as const
  }
  const set = new Map<string, readonly [number, number]>()
  for (const c of cells) {
    const k = key(c)
    set.set(`${k[0]},${k[1]}`, k)
  }
  const seen = new Set<string>()
  const sizes: number[] = []
  for (const [id, [x, y]] of set) {
    if (seen.has(id)) continue
    let n = 0
    const stack = [[x, y]]
    seen.add(id)
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      n++
      for (const [nx, ny] of [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1],
      ]) {
        const nid = `${nx},${ny}`
        if (set.has(nid) && !seen.has(nid)) {
          seen.add(nid)
          stack.push([nx, ny])
        }
      }
    }
    sizes.push(n)
  }
  return sizes.sort((a, b) => b - a)
}

function sectionBlind(report: HealthReport) {
  h('3. 盲区识别（样例）')
  const cells = report.blindSpots
  const grid = buildGridCenters(report.center).length
  const sev = (v: number) => cells.filter((c) => Math.abs(c.severity - v) < 1e-6).length
  const byCat = ESSENTIAL_CATEGORIES.map(
    (k) => `${label(k)} ${cells.filter((c) => c.missing.includes(k)).length}`
  ).join(' · ')
  const cl = clusters(cells, report.center)
  const cellKm2 = (cells[0]?.sizeM ?? 200) ** 2 / 1e6
  const c = report.center
  const bearings = cells.map((x) => bearingBetween(c, x.center))
  const dists = cells.map((x) => haversineM(c, x.center))
  const meanB =
    Math.round(
      (Math.atan2(
        bearings.reduce((s, b) => s + Math.sin((b * Math.PI) / 180), 0),
        bearings.reduce((s, b) => s + Math.cos((b * Math.PI) / 180), 0)
      ) *
        180) /
        Math.PI +
        360
    ) % 360
  table(
    ['项目', '值'],
    [
      ['网格总数（1500 m 圆内 200 m 格）', grid],
      ['盲区网格数', cells.length],
      ['圈内盲区网格数', cells.filter((x) => x.inIsochrone).length],
      ['severity = 1/3 · 2/3 · 1 的格数', `${sev(1 / 3)} · ${sev(2 / 3)} · ${sev(1)}`],
      ['各硬指标缺失格数', byCat],
      ['盲区簇数（4-连通）', cl.length],
      ['最大簇格数 / 面积 km²', `${cl[0] ?? 0} / ${((cl[0] ?? 0) * cellKm2).toFixed(2)}`],
      ['盲区总面积 km²', (cells.length * cellKm2).toFixed(2)],
      [
        '盲区格距中心 min–max m / 平均方位角',
        `${Math.round(Math.min(...dists))}–${Math.round(Math.max(...dists))} / ${meanB}°`,
      ],
    ]
  )
}

/* ------------------------------------------------------------------ 在线：单条步行规划 */

async function walkRoute(
  ak: string,
  o: LngLat,
  d: LngLat
): Promise<{ distanceM: number; durationSec: number }> {
  const u = new URL('/directionlite/v1/walking', BAIDU_API_BASE)
  u.searchParams.set('origin', `${o.lat},${o.lng}`)
  u.searchParams.set('destination', `${d.lat},${d.lng}`)
  u.searchParams.set('ak', ak)
  const res = await fetch(u)
  const j = (await res.json()) as {
    status: number
    message?: string
    result?: { routes?: { distance: number; duration: number }[] }
  }
  if (j.status !== 0)
    throw new Error(
      `directionlite ${stripSecrets(u.toString())} status=${j.status} ${j.message ?? ''}`
    )
  const r = j.result?.routes?.[0]
  if (!r) throw new Error('directionlite 无路线')
  return { distanceM: r.distance, durationSec: r.duration }
}

function pickManualPois(report: HealthReport): Poi[] {
  const c = report.center
  const api = report.pois.filter((p) => p.walkSource === 'api' && p.walkSec != null)
  const chosen: Poi[] = []
  const first = (k: FacilityCategory) => api.find((p) => p.category === k)
  for (const k of ['market', 'primary_school'] as FacilityCategory[]) {
    const p = first(k)
    if (p) chosen.push(p)
  }
  const ph = api.filter((p) => p.category === 'pharmacy' && p.inIsochrone)
  if (ph.length) chosen.push(ph[ph.length - 1])
  for (const k of ['park', 'bus_stop'] as FacilityCategory[]) {
    const cands = api.filter((p) => p.category === k && !p.inIsochrone && (p.walkSec ?? 0) <= 1500)
    if (!cands.length) continue
    const used = chosen.map((p) => bearingBetween(c, p.location))
    cands.sort((a, b) => {
      const da = Math.min(...used.map((u) => angDiff(u, bearingBetween(c, a.location))))
      const db = Math.min(...used.map((u) => angDiff(u, bearingBetween(c, b.location))))
      return db - da
    })
    chosen.push(cands[0])
  }
  return chosen
}

async function sectionManualRoutes(ak: string, report: HealthReport) {
  h('4. 人工核验：单条步行规划 vs 批量算路（5 条）')
  const c = report.center
  const rows: (string | number)[][] = []
  const errs: number[] = []
  for (const p of pickManualPois(report)) {
    const r = await walkRoute(ak, c, p.location)
    const dm = (r.distanceM - (p.walkM ?? 0)) / (p.walkM ?? 1)
    const dt = (r.durationSec - (p.walkSec ?? 0)) / (p.walkSec ?? 1)
    errs.push(Math.abs(dt))
    rows.push([
      p.name,
      label(p.category),
      `${Math.round(bearingBetween(c, p.location))}°`,
      p.inIsochrone ? '圈内' : '圈外',
      p.straightM,
      `${p.walkM} / ${min(p.walkSec)}`,
      `${r.distanceM} / ${min(r.durationSec)}`,
      pct(dm),
      pct(dt),
    ])
    await sleep(400)
  }
  table(
    [
      '名称',
      '类别',
      '方位',
      '圈内外',
      '直线 m',
      '批量算路 m / min',
      '单条规划 m / min',
      '距离差',
      '时长差',
    ],
    rows
  )
  console.log(
    `时长绝对差异：平均 ${pct(errs.reduce((a, b) => a + b, 0) / errs.length)}，最大 ${pct(Math.max(...errs))}`
  )
}

async function sectionBoundary(ak: string, report: HealthReport) {
  h('1.4 等时圈边界核验（15 分钟环东南西北 4 顶点）')
  const c = report.center
  const ring = ring15(report).slice(0, -1)
  const rows: (string | number)[][] = []
  let ok = 0
  for (const target of [0, 90, 180, 270]) {
    const v = ring.reduce((a, b) =>
      angDiff(bearingBetween(c, b), target) < angDiff(bearingBetween(c, a), target) ? b : a
    )
    const r = await walkRoute(ak, c, v)
    const inRange = r.durationSec >= 13 * 60 && r.durationSec <= 17 * 60
    if (inRange) ok++
    rows.push([
      `${target}°`,
      `${v.lng.toFixed(5)},${v.lat.toFixed(5)}`,
      Math.round(haversineM(c, v)),
      r.distanceM,
      min(r.durationSec),
      f2(r.distanceM / haversineM(c, v)),
      inRange ? '是' : '否',
    ])
    await sleep(400)
  }
  table(
    [
      '方位',
      '顶点坐标（BD-09）',
      '直线 m',
      '实际步行 m',
      '实际步行 min',
      '绕行系数',
      '13–17 min 内',
    ],
    rows
  )
  console.log(`落在 13–17 min 区间：${ok}/4`)
}

async function sectionBlindCheck(report: HealthReport) {
  h('3.1 盲区抽样核验（3 格，地点检索 radius=1000）')
  const client = createBaiduClient({ cacheDir: null, noCache: true })
  const cells = [...report.blindSpots].sort((a, b) => b.severity - a.severity)
  // 严重度并列时，取距最近硬指标设施最远的 3 格（最"确定"的盲区）
  const scored = cells.map((cell) => {
    const far = Math.max(
      ...cell.missing.map((k) =>
        Math.min(
          ...report.pois
            .filter((p) => p.category === k)
            .map((p) => haversineM(cell.center, p.location)),
          Infinity
        )
      )
    )
    return { cell, far }
  })
  scored.sort((a, b) => b.cell.severity - a.cell.severity || b.far - a.far)
  const rows: (string | number)[][] = []
  for (const { cell, far } of scored.slice(0, 3)) {
    for (const k of cell.missing) {
      const meta = FACILITY_CATEGORIES.find((m) => m.key === k)!
      const raw = await client.placeSearchNearby({
        query: meta.queries.join('$'),
        location: cell.center,
        radius: 1000,
      })
      const detail = raw.map((p: BaiduPlaceResult) => {
        const loc = fromBaiduLocation(p.location)
        const d = loc ? Math.round(haversineM(cell.center, loc)) : NaN
        const keep = matchesCategory(p, meta)
        const rule = CLEAN_RULES[k]
        const why = keep
          ? '保留'
          : rule.nameExclude?.test(p.name)
            ? '名称黑名单'
            : rule.tagExclude?.test(poiTag(p))
              ? 'tag 黑名单'
              : '不匹配类别（tag/名称均未命中）'
        return { name: p.name, tag: poiTag(p), d, keep, why }
      })
      const kept1km = detail.filter((x) => x.keep && x.d <= 1000)
      rows.push([
        `${cell.center.lng.toFixed(5)},${cell.center.lat.toFixed(5)}`,
        `${Math.round(bearingBetween(report.center, cell.center))}° / ${Math.round(haversineM(report.center, cell.center))} m`,
        label(k),
        Math.round(far),
        raw.length,
        kept1km.length,
        detail.map((x) => `${x.name}[${x.tag}] ${x.d} m → ${x.why}`).join('；') || '（无结果）',
      ])
      await sleep(400)
    }
  }
  table(
    [
      '网格中心',
      '相对体检中心方位 / 距离',
      '缺失类别',
      '报告内最近同类设施 m',
      '原始命中',
      '清洗后 1 km 内',
      '命中明细（名称[tag] 距离 → 处理）',
    ],
    rows
  )
}

/* ------------------------------------------------------------------ 在线：限流 / 降级 / 耗时 */

async function sectionRateLimit(center: LngLat) {
  h('5.2 限流压力实测（concurrency=6，20 次批量算路并发）')
  const client = createBaiduClient({ concurrency: 6, qps: 20, cacheDir: null, noCache: true })
  const DEG = Math.PI / 180
  const dests = (i: number): LngLat[] =>
    Array.from({ length: 10 }, (_, j) => {
      const r = 300 + j * 100 + i // 每次调用目的地都不同，避免命中任何缓存
      const b = (i * 18 + j * 36) * DEG
      return {
        lng: center.lng + (r * Math.sin(b)) / (111320 * Math.cos(center.lat * DEG)),
        lat: center.lat + (r * Math.cos(b)) / 110540,
      }
    })
  const t0 = Date.now()
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => client.routeMatrixWalking([center], dests(i)))
  )
  const elapsed = Date.now() - t0
  const okCalls = results.filter((m) => m[0].every((c) => c != null)).length
  const okCells = results.reduce((s, m) => s + m[0].filter((c) => c != null).length, 0)
  table(
    ['指标', '值'],
    [
      ['发起批量算路次数', 20],
      ['routeMatrix 计数 / 点对', `${client.stats.routeMatrix} / ${client.stats.routeMatrixPairs}`],
      ['rateLimited（触发退避重试次数）', client.stats.rateLimited],
      ['最终成功调用 / 成功点对', `${okCalls}/20 / ${okCells}/200`],
      ['成功率', pct(okCalls / 20)],
      ['总耗时 ms', elapsed],
    ]
  )
}

async function sectionFakeAk(center: LngLat) {
  h('5.3 假 AK 降级实测（runAnalysis + ALLOW_SAMPLE_FALLBACK=true）')
  const saved = { ak: process.env.BAIDU_SERVER_AK, fb: process.env.ALLOW_SAMPLE_FALLBACK }
  process.env.BAIDU_SERVER_AK = 'INVALID-AK-FOR-DEGRADATION-TEST'
  process.env.ALLOW_SAMPLE_FALLBACK = 'true'
  try {
    const deps = await defaultDeps({ noCache: true })
    const errors: string[] = []
    const stages: string[] = []
    const t0 = Date.now()
    const report = await runAnalysis(
      { center },
      (e) => {
        if (e.type === 'error') errors.push(`${e.recoverable ? '可恢复' : '致命'}：${e.message}`)
        if (e.type === 'stage') stages.push(e.stage)
      },
      deps
    )
    table(
      ['指标', '值'],
      [
        ['dataSource', report.dataSource],
        ['耗时 ms', Date.now() - t0],
        ['经过阶段', [...new Set(stages)].join(' → ')],
        ['error 事件', errors.join('；') || '（无）'],
        ['warnings', report.warnings.join('；') || '（无）'],
        ['回放样例综合分', `${report.overallScore} ${report.overallGrade}`],
      ]
    )
  } finally {
    process.env.BAIDU_SERVER_AK = saved.ak
    process.env.ALLOW_SAMPLE_FALLBACK = saved.fb
  }
}

interface TimedRun {
  report: HealthReport
  total: number
  firstPartial: number
  stage: Partial<Record<AnalyzeStage, number>>
}

async function timedRun(center: LngLat, noCache: boolean): Promise<TimedRun> {
  const deps = await defaultDeps({ noCache })
  deps.allowSampleFallback = false
  const t0 = Date.now()
  const marks: { stage: AnalyzeStage; t: number }[] = []
  let firstPartial = -1
  const report = await runAnalysis(
    { center },
    (e) => {
      if (e.type === 'stage') marks.push({ stage: e.stage, t: Date.now() - t0 })
      if (e.type === 'partial' && firstPartial < 0) firstPartial = Date.now() - t0
    },
    deps
  )
  const total = Date.now() - t0
  const starts: { stage: AnalyzeStage; t: number }[] = []
  for (const m of marks) if (!starts.some((s) => s.stage === m.stage)) starts.push(m)
  const stage: Partial<Record<AnalyzeStage, number>> = {}
  starts.forEach((s, i) => {
    stage[s.stage] = (i + 1 < starts.length ? starts[i + 1].t : total) - s.t
  })
  return { report, total, firstPartial, stage }
}

function sectionTiming(cold: TimedRun, hot: TimedRun, sample: HealthReport) {
  h('5. API 调用统计与耗时（冷 / 热各跑一次完整分析）')
  const keys = [
    'geocode',
    'placeSearch',
    'routeMatrix',
    'routeMatrixPairs',
    'cacheHits',
    'rateLimited',
    'degraded',
    'elapsedMs',
  ] as const
  table(
    ['指标', '样例录制时', '本次冷缓存', '本次热缓存'],
    keys.map((k) => [k, sample.apiStats[k], cold.report.apiStats[k], hot.report.apiStats[k]])
  )
  console.log(
    `dataSource：冷=${cold.report.dataSource} 热=${hot.report.dataSource}；总墙钟耗时：冷 ${cold.total} ms，热 ${hot.total} ms（热/冷 = ${pct(hot.total / cold.total)}）`
  )
  h('5.1 分阶段耗时（stage 事件到达时间差，ms）')
  const stages: AnalyzeStage[] = [
    'geocode',
    'sampling',
    'routing',
    'isochrone',
    'poi_search',
    'poi_routing',
    'scoring',
    'blindspot',
  ]
  table(
    ['阶段', '冷', '热'],
    [
      ...stages.map((s) => [s, cold.stage[s] ?? '—', hot.stage[s] ?? '—']),
      ['首个 partial（等时圈可见）', cold.firstPartial, hot.firstPartial],
      ['合计', cold.total, hot.total],
    ]
  )
  h('本次冷跑 vs 样例 一致性')
  const a = (r: HealthReport) => r.isochrone.rings.find((x) => x.minutes === 15)!.areaKm2
  table(
    ['指标', '样例', '本次冷跑', '本次热跑'],
    [
      ['15 min 面积 km²', a(sample), a(cold.report), a(hot.report)],
      [
        '等效半径 m',
        sample.isochrone.equivalentRadiusM,
        cold.report.isochrone.equivalentRadiusM,
        hot.report.isochrone.equivalentRadiusM,
      ],
      [
        'POI 总数 / 圈内',
        `${sample.pois.length} / ${sample.pois.filter((p) => p.inIsochrone).length}`,
        `${cold.report.pois.length} / ${cold.report.pois.filter((p) => p.inIsochrone).length}`,
        `${hot.report.pois.length} / ${hot.report.pois.filter((p) => p.inIsochrone).length}`,
      ],
      [
        '盲区格数',
        sample.blindSpots.length,
        cold.report.blindSpots.length,
        hot.report.blindSpots.length,
      ],
      [
        '综合分',
        `${sample.overallScore} ${sample.overallGrade}`,
        `${cold.report.overallScore} ${cold.report.overallGrade}`,
        `${hot.report.overallScore} ${hot.report.overallGrade}`,
      ],
    ]
  )
}

/* ------------------------------------------------------------------ 在线：清洗统计（热缓存，复现 searchFacilities 的每一步） */

async function sectionCleaning(center: LngLat, sample: HealthReport) {
  h('2.1 清洗统计（按 searchFacilities 步骤复现，radius=1800）')
  const client = createBaiduClient()
  let raw = 0
  let nameEx = 0
  let tagEx = 0
  let noMatch = 0
  const nameExamples: string[] = []
  const kept: { uid: string; straightM: number }[] = []
  const perCat: (string | number)[][] = []
  for (const meta of FACILITY_CATEGORIES) {
    const list = await client.placeSearchNearby({
      query: meta.queries.join('$'),
      location: center,
      radius: 1800,
    })
    const rule = CLEAN_RULES[meta.key]
    let k = 0
    for (const p of list) {
      raw++
      if (matchesCategory(p, meta)) {
        k++
        const loc = fromBaiduLocation(p.location)
        if (loc) kept.push({ uid: String(p.uid), straightM: haversineM(center, loc) })
      } else if (rule.nameExclude?.test(p.name)) {
        nameEx++
        if (nameExamples.length < 6) nameExamples.push(`${p.name}（${meta.label}）`)
      } else if (rule.tagExclude?.test(poiTag(p))) tagEx++
      else noMatch++
    }
    perCat.push([meta.label, list.length, k, list.length - k])
  }
  table(['类别', '原始命中', '清洗后', '剔除'], perCat)
  const uniq = new Set(kept.map((x) => x.uid)).size
  const far = [...new Map(kept.map((x) => [x.uid, x])).values()].filter(
    (x) => x.straightM > 1800 * 1.05
  ).length
  table(
    ['项目', '数量'],
    [
      ['原始检索命中（去重前）', raw],
      ['名称黑名单剔除', `${nameEx}（例：${nameExamples.slice(0, 3).join('、')}）`],
      ['tag 黑名单剔除', tagEx],
      ['tag / 名称均未命中类别剔除', noMatch],
      ['清洗后条目（含跨类别重复）', kept.length],
      ['uid 跨类别去重剔除', kept.length - uniq],
      ['直线预筛剔除（> 1890 m）', far],
      ['最终进入报告', uniq - far],
      ['样例报告 pois 数', sample.pois.length],
      [
        '本段 placeSearch 调用 / cacheHits',
        `${client.stats.placeSearch} / ${client.stats.cacheHits}`,
      ],
    ]
  )
}

/* ------------------------------------------------------------------ main */

async function main() {
  loadEnv()
  const o = args()
  const slug = o.sample ?? 'bishan-biquan'
  const { report, createdAt } = loadSample(slug)
  console.log(`# 圈见 · 测试报告数字复现（样例 ${slug}，录制于 ${createdAt}）`)
  console.log(
    `中心 lng ${report.center.lng} lat ${report.center.lat}；逆地理：${report.address.formatted}；report.id=${report.id}，dataSource=${report.dataSource}`
  )
  console.log(
    `运行参数：BAIDU_MAX_CONCURRENCY=${process.env.BAIDU_MAX_CONCURRENCY ?? '(默认)'} BAIDU_QPS=${process.env.BAIDU_QPS ?? '(默认)'} ALLOW_SAMPLE_FALLBACK=${process.env.ALLOW_SAMPLE_FALLBACK ?? '(未设)'}`
  )

  sectionRings(report)
  sectionBaseline(report)
  sectionBearings(report)
  sectionCategories(report)
  sectionBlind(report)

  if (o.offline === 'true') return
  const ak = (process.env.BAIDU_SERVER_AK ?? '').trim()
  if (!ak)
    throw new Error('未配置 BAIDU_SERVER_AK，在线核验无法进行（可加 --offline 只跑离线部分）')

  const cold = await timedRun(report.center, true)
  const hot = await timedRun(report.center, false)
  sectionTiming(cold, hot, report)
  await sectionCleaning(report.center, report)
  await sectionManualRoutes(ak, report)
  await sectionBoundary(ak, report)
  await sectionBlindCheck(report)
  await sectionRateLimit(report.center)
  await sectionFakeAk(report.center)
  console.log('\n完成。')
}

main().catch((e) => {
  console.error(e instanceof Error ? stripSecrets(e.message) : e)
  process.exit(1)
})
