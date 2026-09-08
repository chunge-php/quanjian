/**
 * GET /api/samples → { ok, samples: [{ slug, name, description, center, createdAt }] }
 */
import { NextResponse } from 'next/server'
import { listSamples } from '@/lib/pipeline/sample'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, samples: listSamples() })
}
