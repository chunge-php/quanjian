/**
 * GET /api/health → { ok, hasServerAk, sampleCount }（不泄露 AK 值）
 */
import { NextResponse } from 'next/server'
import { hasServerAk } from '@/lib/pipeline/deps'
import { listSamples } from '@/lib/pipeline/sample'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request?: Request) {
  const deep = request ? new URL(request.url).searchParams.get('deep') === '1' : false
  let sampleCount = 0
  let sampleError: string | undefined
  try {
    sampleCount = listSamples().length
  } catch (e) {
    // 样例目录缺失或 JSON 损坏不应让健康检查失败
    sampleError = e instanceof Error ? e.message : String(e)
  }
  // ?deep=1：真调一次地点检索，把 AK 前缀与百度原话返回，用于排查"配额/服务禁用/白名单"
  let probe: Record<string, unknown> | undefined
  if (deep) {
    const ak = process.env.BAIDU_SERVER_AK ?? ''
    probe = { akPrefix: ak ? `${ak.slice(0, 6)}…（${ak.length} 位）` : '未配置' }
    if (ak) {
      try {
        const { createBaiduClient } = await import('@/lib/baidu')
        const client = createBaiduClient({ noCache: true })
        const t0 = Date.now()
        const res = await client.placeSearchNearby({
          query: '药店',
          location: { lng: 116.404, lat: 39.915 },
          radius: 500,
          maxPages: 1,
        })
        probe.placeSearch = { ok: true, results: res.length, ms: Date.now() - t0 }
      } catch (e) {
        probe.placeSearch = { ok: false, message: e instanceof Error ? e.message : String(e) }
      }
    }
  }
  return NextResponse.json({
    ok: true,
    hasServerAk: hasServerAk(),
    sampleCount,
    ...(probe ? { probe } : {}),
    ...(sampleError ? { sampleError } : {}),
    allowSampleFallback: /^(1|true|yes|on)$/i.test(process.env.ALLOW_SAMPLE_FALLBACK ?? ''),
  })
}
