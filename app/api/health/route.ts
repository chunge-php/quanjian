/**
 * GET /api/health → { ok, hasServerAk, sampleCount }（不泄露 AK 值）
 */
import { NextResponse } from 'next/server'
import { hasServerAk } from '@/lib/pipeline/deps'
import { listSamples } from '@/lib/pipeline/sample'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  let sampleCount = 0
  let sampleError: string | undefined
  try {
    sampleCount = listSamples().length
  } catch (e) {
    // 样例目录缺失或 JSON 损坏不应让健康检查失败
    sampleError = e instanceof Error ? e.message : String(e)
  }
  return NextResponse.json({
    ok: true,
    hasServerAk: hasServerAk(),
    sampleCount,
    ...(sampleError ? { sampleError } : {}),
    allowSampleFallback: /^(1|true|yes|on)$/i.test(process.env.ALLOW_SAMPLE_FALLBACK ?? ''),
  })
}
