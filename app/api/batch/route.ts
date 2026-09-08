/**
 * POST /api/batch  body = BatchRequest → SSE 批量体检事件流（plan → progress/point… → done）
 * GET  /api/batch?lng=&lat=&radius=[&max=&spacing=&fast=]  圆形区域，便于 curl 调试
 *
 * 无 AK 或 API 不可用时自动回放 data/samples/batch-*.json 里离区域中心最近（<3 km）的样例。
 */
import { NextResponse } from 'next/server'
import { batchRequestSchema, parseBatchQuery } from '@/lib/batch/schema'
import { batchToSse } from '@/lib/batch/sse'
import { zodMessage } from '@/lib/pipeline/schema'
import type { BatchRequest } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** 25 个点串行、每点十余次 API，预留 5 分钟 */
export const maxDuration = 300

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
  const parsed = batchRequestSchema.safeParse(body)
  if (!parsed.success) return bad(zodMessage(parsed.error))
  return batchToSse(parsed.data as BatchRequest)
}

export async function GET(request: Request) {
  const parsed = parseBatchQuery(new URL(request.url).searchParams)
  if (!parsed.success) return bad(zodMessage(parsed.error))
  return batchToSse(parsed.data)
}
