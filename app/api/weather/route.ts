/**
 * GET /api/weather?lng=&lat=  → { ok, weather }  中心点实时天气（供报告页刷新用）
 *
 * 天气是旁路数据：失败只返回 ok=false，不影响分析主流程；不计入 apiStats。
 */
import { NextResponse } from 'next/server'
import { defaultDeps, hasServerAk } from '@/lib/pipeline/deps'
import { errMsg } from '@/lib/pipeline/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams
  const lng = Number(sp.get('lng'))
  const lat = Number(sp.get('lat'))
  if (!Number.isFinite(lng) || !Number.isFinite(lat))
    return NextResponse.json({ ok: false, error: '缺少或非法的 lng / lat 参数' }, { status: 400 })
  if (lng < 70 || lng > 140 || lat < 0 || lat > 60)
    return NextResponse.json({ ok: false, error: '坐标超出国内天气服务范围' }, { status: 400 })
  if (!hasServerAk())
    return NextResponse.json(
      { ok: false, error: '服务端未配置百度 AK，无法查询天气' },
      { status: 503 }
    )
  try {
    const deps = await defaultDeps()
    const weather = deps.weather ? await deps.weather({ lng, lat }) : null
    if (!weather)
      return NextResponse.json({ ok: false, error: '该位置暂无天气数据' }, { status: 404 })
    return NextResponse.json({ ok: true, weather })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `天气查询失败：${errMsg(e)}` }, { status: 502 })
  }
}
