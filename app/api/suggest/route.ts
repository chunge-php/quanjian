/**
 * GET /api/suggest?q=&region=  → { ok, items: SuggestItem[] }
 * 搜索框实时联想：调百度「地点输入提示」，只返回带坐标的候选，最多 8 条。
 */
import { NextResponse } from 'next/server'
import { defaultDeps, hasServerAk } from '@/lib/pipeline/deps'
import { errMsg } from '@/lib/pipeline/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const q = sp.get('q')?.trim() ?? ''
  const region = sp.get('region')?.trim() || '全国'
  if (q.length < 1) return NextResponse.json({ ok: true, items: [] })
  if (q.length > 60) return NextResponse.json({ ok: false, error: '关键词过长' }, { status: 400 })
  if (!hasServerAk())
    return NextResponse.json({ ok: false, error: '服务端未配置百度 AK' }, { status: 503 })
  try {
    const deps = await defaultDeps()
    const items = deps.suggest ? await deps.suggest(q, region) : []
    return NextResponse.json({ ok: true, items: items.slice(0, 8) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `联想失败：${errMsg(e)}` }, { status: 502 })
  }
}
