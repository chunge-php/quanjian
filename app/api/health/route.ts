/**
 * GET /api/health → { ok, hasServerAk, sampleCount }（不泄露 AK 值）
 */
import { NextResponse } from 'next/server'
import { hasServerAk } from '@/lib/pipeline/deps'
import { listSamples } from '@/lib/pipeline/sample'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    hasServerAk: hasServerAk(),
    sampleCount: listSamples().length,
    allowSampleFallback: /^(1|true|yes|on)$/i.test(process.env.ALLOW_SAMPLE_FALLBACK ?? ''),
  })
}
