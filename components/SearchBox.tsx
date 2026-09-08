'use client'
import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { toast } from '@/lib/ui/toast'
import { MOCK_CENTER } from '@/lib/ui/mockReport'

export interface SampleItem {
  slug: string
  name: string
  center: LngLat
  description?: string
}

const MOCK_SAMPLES: SampleItem[] = [
  {
    slug: 'bishan',
    name: '重庆 · 璧山区政府',
    center: MOCK_CENTER,
    description: '本地样例（后端未接入时使用）',
  },
]

interface Props {
  busy: boolean
  mock: boolean
  onPick: (center: LngLat, label: string) => void
}

/** 左上搜索：地址 → /api/geocode；或从内置样例挑一个；或直接点地图 */
export default function SearchBox({ busy, mock, onPick }: Props) {
  const [q, setQ] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [samples, setSamples] = useState<SampleItem[]>(mock ? MOCK_SAMPLES : [])
  const [samplesOpen, setSamplesOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mock) {
      setSamples(MOCK_SAMPLES)
      return
    }
    const ctrl = new AbortController()
    fetch('/api/samples', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: unknown) => {
        if (Array.isArray(list) && list.length) setSamples(list as SampleItem[])
        else setSamples(MOCK_SAMPLES)
      })
      .catch(() => setSamples(MOCK_SAMPLES))
    return () => ctrl.abort()
  }, [mock])

  useEffect(() => {
    if (!samplesOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSamplesOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSamplesOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [samplesOpen])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = q.trim()
    if (!address) return
    if (mock) {
      onPick(MOCK_CENTER, address)
      toast('样例模式：地址不做真实地理编码，已使用璧山样例坐标', 'info')
      return
    }
    setGeocoding(true)
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`)
      const data = (await r.json().catch(() => null)) as {
        location?: LngLat
        address?: string
        error?: string
      } | null
      if (!r.ok || !data?.location)
        throw new Error(data?.error || `未找到「${address}」，试试加上城市名`)
      onPick(data.location, data.address || address)
    } catch (err) {
      toast(err instanceof Error ? err.message : '地址解析失败', 'error')
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div
      ref={wrapRef}
      className="map-ui no-print absolute left-3 right-3 top-3 z-[var(--z-map-ui)] md:left-4 md:right-auto md:w-[26rem]"
    >
      <form
        onSubmit={submit}
        className="flex border border-[var(--ink)] bg-[var(--paper)]"
        role="search"
      >
        <label htmlFor="addr" className="sr-only">
          输入地址或小区名
        </label>
        <input
          id="addr"
          className="input !border-0 !shadow-none"
          placeholder="输入地址 / 小区名，或直接在地图上点一下"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="search"
        />
        <button
          type="submit"
          className="btn btn-primary !border-0 shrink-0"
          disabled={geocoding || busy || !q.trim()}
          aria-label="搜索并分析"
        >
          <Icon name="search" size={16} />
          <span className="hidden sm:inline">{geocoding ? '定位中…' : '体检'}</span>
        </button>
        <button
          type="button"
          className="btn !border-0 !border-l !border-l-[var(--line-strong)] shrink-0 !px-2.5 text-xs"
          onClick={() => setSamplesOpen((v) => !v)}
          aria-expanded={samplesOpen}
          aria-haspopup="listbox"
        >
          样例
          <Icon
            name="chevronDown"
            size={12}
            className={`transition-transform duration-200 ${samplesOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </form>
      {samplesOpen && (
        <ul
          className="rise-in mt-1 max-h-72 overflow-auto border border-[var(--ink)] bg-[var(--paper)] py-1 scroll-thin"
          role="listbox"
          aria-label="内置样例"
        >
          {samples.map((s) => (
            <li key={s.slug} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--paper-2)] focus-visible:bg-[var(--paper-2)]"
                onClick={() => {
                  setSamplesOpen(false)
                  setQ(s.name)
                  onPick(s.center, s.name)
                }}
              >
                <span className="block text-sm font-medium">{s.name}</span>
                {s.description && (
                  <span className="block truncate text-xs text-[var(--ink-3)]">
                    {s.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
