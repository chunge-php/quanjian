/**
 * 用真实百度 API 跑一次分析，把完整事件流录制到 data/samples/<slug>.json。
 *
 * 用法：
 *   pnpm tsx scripts/build-sample.ts --slug bishan-biquan --name "重庆璧山·璧城街道" \
 *     --lng 106.2277 --lat 29.5921 [--address "重庆市璧山区璧城街道"] [--description "..."] [--bearings 16]
 *
 * 自动读取 .env.local / .env 里的 BAIDU_SERVER_AK。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { AnalyzeEvent } from '@/lib/types'
import { runAnalysis } from '@/lib/pipeline/analyze'
import { defaultDeps } from '@/lib/pipeline/deps'
import type { SampleFile } from '@/lib/pipeline/sample'

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

async function main() {
  loadEnv()
  const o = args()
  const slug = o.slug
  if (!slug || !/^[a-z0-9-]+$/.test(slug))
    throw new Error('--slug 必填，仅允许小写字母/数字/连字符')
  if (!o.lng || !o.lat) throw new Error('--lng --lat 必填（BD-09）')
  if (!process.env.BAIDU_SERVER_AK) throw new Error('未配置 BAIDU_SERVER_AK')

  const deps = await defaultDeps({ noCache: o.noCache === 'true' })
  deps.allowSampleFallback = false // 录样例必须走真实 API
  const events: AnalyzeEvent[] = []
  const t0 = Date.now()
  const report = await runAnalysis(
    {
      center: { lng: Number(o.lng), lat: Number(o.lat) },
      address: o.address,
      bearings: o.bearings ? Number(o.bearings) : undefined,
    },
    (e) => {
      events.push(e)
      if (e.type === 'stage')
        console.log(`[${String(e.progress).padStart(3)}%] ${e.stage}: ${e.message}`)
      if (e.type === 'error') console.warn(`[${e.recoverable ? '降级' : '致命'}] ${e.message}`)
    },
    deps
  )
  if (report.dataSource === 'sample') throw new Error('本次结果来自样例回放，不能录制')

  const file: SampleFile = {
    slug,
    name: o.name ?? report.address.formatted ?? slug,
    description: o.description ?? `${report.address.formatted || slug} 周边 15 分钟生活圈体检样例`,
    center: report.center,
    createdAt: new Date().toISOString(),
    events,
  }
  const dir = path.join(process.cwd(), 'data', 'samples')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${slug}.json`)
  fs.writeFileSync(out, JSON.stringify(file, null, 0))
  const s = report.apiStats
  console.log(
    `\n已写入 ${out}（${(fs.statSync(out).size / 1024).toFixed(1)} KB）\n` +
      `POI ${report.pois.length} 个，综合 ${report.overallScore} 分 ${report.overallGrade}，dataSource=${report.dataSource}，耗时 ${Date.now() - t0} ms\n` +
      `API：geocode=${s.geocode} placeSearch=${s.placeSearch} routeMatrix=${s.routeMatrix}(${s.routeMatrixPairs} 对) cache=${s.cacheHits} rateLimited=${s.rateLimited} degraded=${s.degraded}\n` +
      (report.warnings.length ? `warnings：\n - ${report.warnings.join('\n - ')}` : '')
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
