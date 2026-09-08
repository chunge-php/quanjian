/**
 * 用真实百度 API 跑一次街道级批量体检，把事件流 + 汇总报告录制到 data/samples/batch-<slug>.json。
 *
 * 用法：
 *   pnpm tsx scripts/build-batch-sample.ts [--slug bishan] [--name "重庆璧山·东林大道周边"] \
 *     [--lng 106.2277 --lat 29.5921] [--radius 1500] [--max 16] [--spacing 500] [--full] [--noCache]
 *
 * 自动读取 .env.local / .env 里的 BAIDU_SERVER_AK（不写入文件）。
 * 文件超过 3 MB 时清空各报告的 isochrone.samples 瘦身（samplesStripped=true）。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { BatchEvent, BatchReport } from '@/lib/types'
import { runBatch } from '@/lib/batch/run'
import type { BatchSampleFile } from '@/lib/batch/sample'
import { defaultDeps } from '@/lib/pipeline/deps'

const MAX_BYTES = 3 * 1024 * 1024

/** 极简 .env 加载（不引入 dotenv） */
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
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--'))
      out[a[i].slice(2)] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : 'true'
  }
  return out
}

/** 清空各报告的等时圈采样点（体积最大的部分） */
function stripSamples(report: BatchReport) {
  for (const r of report.reports) r.isochrone.samples = []
}

async function main() {
  loadEnv()
  const o = args()
  const slug = o.slug ?? 'bishan'
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('--slug 仅允许小写字母/数字/连字符')
  if (!process.env.BAIDU_SERVER_AK) throw new Error('未配置 BAIDU_SERVER_AK')

  const center = { lng: Number(o.lng ?? 106.2277), lat: Number(o.lat ?? 29.5921) }
  const name = o.name ?? '重庆璧山·东林大道周边'
  const deps = await defaultDeps({ noCache: o.noCache === 'true' })
  deps.allowSampleFallback = false // 录样例必须走真实 API

  const events: BatchEvent[] = []
  const t0 = Date.now()
  const report = await runBatch(
    {
      area: { kind: 'circle', center, radiusM: Number(o.radius ?? 1500), name },
      maxPoints: Number(o.max ?? 16),
      spacingM: o.spacing ? Number(o.spacing) : undefined,
      fast: o.full !== 'true',
    },
    (e) => {
      if (e.type !== 'done') events.push(e)
      if (e.type === 'plan')
        console.log(
          `[plan] ${e.points.length} 点，间距 ${e.spacingM} m，面积 ${e.areaKm2.toFixed(2)} km²`
        )
      if (e.type === 'progress')
        console.log(`  [${e.index + 1}/${e.total}] ${e.stage}: ${e.message}`)
      if (e.type === 'point')
        console.log(
          `[point ${e.index + 1}/${e.total}] ${e.summary.overallScore} 分 ${e.summary.overallGrade} · ${e.summary.address}`
        )
      if (e.type === 'error') console.warn(`[${e.recoverable ? '降级' : '致命'}] ${e.message}`)
    },
    deps
  )
  if (report.dataSource === 'sample') throw new Error('本次结果来自样例回放，不能录制')

  const file: BatchSampleFile = {
    slug: `batch-${slug}`,
    name,
    description:
      o.description ??
      `${name} 半径 ${o.radius ?? 1500} 米内 ${report.points.length} 个网格点的街道级体检样例`,
    center,
    area: report.area,
    createdAt: new Date().toISOString(),
    batchEvents: events,
    report,
  }
  let json = JSON.stringify(file)
  if (Buffer.byteLength(json) > MAX_BYTES) {
    stripSamples(file.report)
    file.samplesStripped = true
    json = JSON.stringify(file)
    console.log('文件超过 3 MB，已清空各报告的 isochrone.samples 瘦身')
  }
  const dir = path.join(process.cwd(), 'data', 'samples')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `batch-${slug}.json`)
  fs.writeFileSync(out, json)

  const s = report.apiStats
  const worst = report.points.find((p) => p.index === report.worst[0])
  console.log(
    `\n已写入 ${out}（${(fs.statSync(out).size / 1024).toFixed(1)} KB）\n` +
      `点位 ${report.points.length}/${events.filter((e) => e.type === 'plan').length ? (events.find((e) => e.type === 'plan') as { points: unknown[] }).points.length : '?'}，平均 ${report.scoreAvg} 分（最高 ${report.scoreMax} / 最低 ${report.scoreMin}），最差点 #${(worst?.index ?? 0) + 1} ${worst?.address ?? ''}，dataSource=${report.dataSource}，耗时 ${Date.now() - t0} ms\n` +
      `API：geocode=${s.geocode} placeSearch=${s.placeSearch} routeMatrix=${s.routeMatrix}(${s.routeMatrixPairs} 对) cache=${s.cacheHits} rateLimited=${s.rateLimited} degraded=${s.degraded}\n` +
      `结论：\n - ${report.headline.join('\n - ')}\n` +
      (report.suggestions.length
        ? `建议：\n - ${report.suggestions.map((x) => `[${x.priority}] ${x.text}`).join('\n - ')}\n`
        : '') +
      (report.warnings.length
        ? `warnings（${report.warnings.length}）：\n - ${report.warnings.slice(0, 5).join('\n - ')}`
        : '')
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
