/**
 * POST /api/analyze  body = AnalyzeRequest → SSE 事件流
 * GET  /api/analyze?lng=&lat=[&address=&bearings=]  同样返回 SSE（便于 curl 调试）
 */
import { NextResponse } from 'next/server'
import { analyzeRequestSchema, parseAnalyzeQuery, zodMessage } from '@/lib/pipeline/schema'
import { analyzeToSse } from '@/lib/pipeline/sse'
import type { AnalyzeRequest } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function bad(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return bad('请求体不是合法 JSON')
  }
  const parsed = analyzeRequestSchema.safeParse(body)
  if (!parsed.success) return bad(zodMessage(parsed.error))
  return analyzeToSse(parsed.data as AnalyzeRequest)
}

export async function GET(request: Request) {
  const parsed = parseAnalyzeQuery(new URL(request.url).searchParams)
  if (!parsed.success) return bad(zodMessage(parsed.error))
  return analyzeToSse(parsed.data)
}
