/**
 * GET /api/walk?from=lng,lat&to=lng,lat → { ok, walkSec, walkM, straightM, source }
 *
 * 「拟建设施」模拟专用：只算一对点的步行距离 / 时长。
 * 无 AK、算路失败、坐标非法以外的任何错误都退回直线估算（source='estimate'），永不 5xx，
 * 保证浏览器端的模拟不因网络而卡住。
 */
import { NextResponse } from 'next/server'
import type { LngLat } from '@/lib/types'
import { createBaiduClient, estimateWalk, haversineM } from '@/lib/baidu'
import { hasServerAk } from '@/lib/pipeline/deps'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 解析 "lng,lat"；非法返回 null */
function parseLngLat(raw: string | null): LngLat | null {
  if (!raw) return null
  const [a, b] = raw.split(',').map((s) => Number(s.trim()))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) > 180 || Math.abs(b) > 90) return null
  return { lng: a, lat: b }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const from = parseLngLat(url.searchParams.get('from'))
  const to = parseLngLat(url.searchParams.get('to'))
  if (!from || !to)
    return NextResponse.json(
      { ok: false, error: '参数格式应为 from=lng,lat&to=lng,lat' },
      { status: 400 }
    )
  const straightM = Math.round(haversineM(from, to))
  const fallback = () => {
    const w = estimateWalk(straightM)
    return NextResponse.json({
      ok: true,
      walkSec: w.walkSec,
      walkM: w.walkM,
      straightM,
      source: 'estimate' as const,
    })
  }
  if (!hasServerAk()) return fallback()
  try {
    const client = createBaiduClient()
    const matrix = await client.routeMatrixWalking([from], [to])
    const cell = matrix[0]?.[0]
    if (!cell || cell.distanceM < 0 || cell.durationSec < 0) return fallback()
    return NextResponse.json({
      ok: true,
      walkSec: cell.durationSec,
      walkM: cell.distanceM,
      straightM,
      source: 'api' as const,
    })
  } catch {
    return fallback()
  }
}
