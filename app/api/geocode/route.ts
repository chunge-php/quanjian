/**
 * GET /api/geocode?address=  → { ok, location, address }  供搜索框回车直搜用（地理编码 → 联想兜底）
 */
import { NextResponse } from 'next/server'
import { defaultDeps, hasServerAk } from '@/lib/pipeline/deps'
import { errMsg } from '@/lib/pipeline/util'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get('address')?.trim() ?? ''
  if (!address) return NextResponse.json({ ok: false, error: '缺少 address 参数' }, { status: 400 })
  if (address.length > 120)
    return NextResponse.json({ ok: false, error: '地址过长' }, { status: 400 })
  if (!hasServerAk())
    return NextResponse.json(
      { ok: false, error: '服务端未配置百度 AK，无法地理编码' },
      { status: 503 }
    )
  try {
    const deps = await defaultDeps()
    let r = await deps.geocode(address)
    // 地理编码只认"地址"；小区名 / 单位名 / 商圈名走地点联想兜底，取第一个带坐标的候选
    if (!r && deps.suggest) {
      const items = await deps.suggest(address).catch(() => [])
      if (items[0]) r = { location: items[0].location }
    }
    if (!r)
      return NextResponse.json({ ok: false, error: `无法识别地址「${address}」` }, { status: 404 })
    let formatted = address
    try {
      const a = await deps.reverseGeocode(r.location)
      if (a.formatted) formatted = a.formatted
    } catch {
      /* 逆地理编码失败不影响结果 */
    }
    return NextResponse.json({ ok: true, location: r.location, address: formatted })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `地理编码失败：${errMsg(e)}` }, { status: 502 })
  }
}
