/**
 * GET /api/staticmap → image/png
 *
 * 百度静态图 v2 的服务端代理：AK 只在服务端拼接，浏览器拿到的是图片本身。
 * 参数：
 *  - center=lng,lat（必填）
 *  - rings=lng,lat;lng,lat;...|...   多条闭合路径，外环 → 内环（15′ / 10′ / 5′）
 *  - pois=lng,lat;lng,lat;...        硬指标设施标记，最多 30 个
 *  - w / h                            默认 800×560，上限 1024
 *  - zoom                             14~17；缺省按第一条路径的包围盒自动算
 *  - label                            中心点大标记上的字母（A-Z / 0-9），可缺省
 *
 * 实测约束（2026-09-08）：pathStyles 只支持「颜色,粗细,透明度」三段（带填充色返回 154 字节空图）；
 * 宽高任一超过 1024 或加 dpiType 会返回 {"message":"width : 超出范围"}。
 * 响应按 sha1(去 AK 的上游 URL) 落盘到 data/cache/staticmap-<sha1>.png，命中直接回。
 * 无 AK / 上游失败 / 返回空图 → 503 JSON，前端隐藏图片区。
 */
import { NextResponse } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LngLat } from '@/lib/types'
import { cacheKey } from '@/lib/baidu/cache'
import { hasServerAk } from '@/lib/pipeline/deps'
import { autoZoom } from '@/lib/baidu/staticmap'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPSTREAM = 'https://api.map.baidu.com/staticimage/v2'
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache')
const MAX_SIDE = 1024
const MAX_POIS = 30
/** 三环描边样式：15′ 墨 粗 3，10′ / 5′ 青 粗 2（顺序与 rings 外→内一致） */
const RING_STYLES = ['0x23261f,3,1', '0x1f6e6a,2,1', '0x1f6e6a,2,1']
/** 有效返回的最小字节数（百度出错时会回 154 字节的空 PNG） */
const MIN_PNG_BYTES = 1000

function parsePoint(raw: string): LngLat | null {
  const [a, b] = raw.split(',').map((s) => Number(s.trim()))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) > 180 || Math.abs(b) > 90) return null
  return { lng: a, lat: b }
}

function parsePath(raw: string): LngLat[] | null {
  const pts = raw
    .split(';')
    .filter(Boolean)
    .map((s) => parsePoint(s))
  if (pts.length < 3 || pts.some((p) => p == null)) return null
  return pts as LngLat[]
}

function fmt(p: LngLat): string {
  return `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const v = Number(raw)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function fail(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams
  const center = q.get('center') ? parsePoint(q.get('center') as string) : null
  if (!center) return fail(400, '参数格式应为 center=lng,lat')
  const w = clampInt(q.get('w'), 800, 200, MAX_SIDE)
  const h = clampInt(q.get('h'), 560, 200, MAX_SIDE)
  const rings = (q.get('rings') ?? '')
    .split('|')
    .filter(Boolean)
    .map((r) => parsePath(r))
  if (rings.some((r) => r == null)) return fail(400, 'rings 格式应为 lng,lat;lng,lat;...|...')
  const paths = (rings as LngLat[][]).slice(0, RING_STYLES.length)
  const pois = (q.get('pois') ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) => parsePoint(s))
    .filter((p): p is LngLat => p != null)
    .slice(0, MAX_POIS)
  const label = (q.get('label') ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 1)
  const zoomRaw = q.get('zoom')
  const zoom = zoomRaw ? clampInt(zoomRaw, 16, 14, 17) : paths[0] ? autoZoom(paths[0], w, h) : 16

  if (!hasServerAk()) return fail(503, '服务端未配置百度 AK，静态地图不可用')

  // 上游参数：paths 只放坐标，样式在 pathStyles 按 | 一一对应；多边形首尾闭合
  const params: [string, string][] = [
    ['center', fmt(center)],
    ['width', String(w)],
    ['height', String(h)],
    ['zoom', String(zoom)],
  ]
  if (paths.length) {
    const closed = paths.map((ring) => {
      const first = ring[0]
      const last = ring[ring.length - 1]
      const pts = first.lng === last.lng && first.lat === last.lat ? ring : [...ring, first]
      return pts.map(fmt).join(';')
    })
    params.push(['paths', closed.join('|')])
    params.push(['pathStyles', RING_STYLES.slice(0, paths.length).join('|')])
  }
  const markers = [fmt(center), ...pois.map(fmt)]
  const markerStyles = [`l,${label},0xc0391d`, ...pois.map(() => 's,,0x1f6e6a')]
  params.push(['markers', markers.join('|')])
  params.push(['markerStyles', markerStyles.join('|')])
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const upstreamNoAk = `${UPSTREAM}?${query}`
  const key = cacheKey(upstreamNoAk)
  const file = path.join(CACHE_DIR, `staticmap-${key}.png`)

  const headers = {
    'Content-Type': 'image/png',
    'Cache-Control': 'private, max-age=86400',
    'X-Static-Map-Zoom': String(zoom),
  }
  try {
    const hit = await readFile(file)
    if (hit.byteLength >= MIN_PNG_BYTES)
      return new Response(new Uint8Array(hit), { headers: { ...headers, 'X-Cache': 'hit' } })
  } catch {
    /* 未命中 */
  }

  const ak = (process.env.BAIDU_SERVER_AK ?? '').trim()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`${upstreamNoAk}&ak=${encodeURIComponent(ak)}`, {
      signal: ctrl.signal,
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.startsWith('image/')) return fail(503, '百度静态图返回异常')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength < MIN_PNG_BYTES) return fail(503, '百度静态图返回空图')
    mkdir(CACHE_DIR, { recursive: true })
      .then(() => writeFile(file, buf))
      .catch(() => undefined)
    return new Response(new Uint8Array(buf), { headers: { ...headers, 'X-Cache': 'miss' } })
  } catch {
    return fail(503, '百度静态图请求失败')
  } finally {
    clearTimeout(timer)
  }
}
