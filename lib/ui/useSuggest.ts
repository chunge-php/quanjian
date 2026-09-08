'use client'
import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '@/lib/types'

export interface SuggestItem {
  uid: string
  name: string
  address: string
  location: LngLat
  province?: string
  city?: string
  district?: string
  town?: string
  tag?: string
}

/**
 * 搜索框实时联想：输入 ≥1 字后防抖 120ms 调 /api/suggest（中文输入法组合中不发），
 * 自动取消过期请求；enabled=false（mock 模式）时不发请求。region=当前城市时同城候选优先。
 */
export function useSuggest(q: string, enabled: boolean, region?: string) {
  const [items, setItems] = useState<SuggestItem[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const query = q.trim()
    if (!enabled || query.length < 1) {
      setItems([])
      setLoading(false)
      return
    }
    const id = ++seq.current
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const rg = region ? `&region=${encodeURIComponent(region)}` : ''
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(query)}${rg}`, {
          signal: ctrl.signal,
        })
        const data = (await r.json().catch(() => null)) as { items?: SuggestItem[] } | null
        if (id === seq.current) setItems(Array.isArray(data?.items) ? data!.items! : [])
      } catch {
        if (id === seq.current) setItems([])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 120)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, enabled, region])

  return { items, loading, clear: () => setItems([]) }
}

/** 候选的次级说明：区县 · 街道 · 地址 */
export function suggestSubtitle(it: SuggestItem): string {
  const parts = [it.city && it.city !== it.province ? it.city : it.province, it.district, it.town]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
  const addr = it.address.replace(/-/g, '')
  return [parts.join(' · '), addr].filter(Boolean).join('　')
}
