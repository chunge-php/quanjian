'use client'
import { useEffect, useRef, useState } from 'react'
import type { LngLat } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { toast } from '@/lib/ui/toast'
import { MOCK_CENTER } from '@/lib/ui/mockReport'
import { useSuggest, type SuggestItem } from '@/lib/ui/useSuggest'
import SuggestList from '@/components/SuggestList'

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
  /** 联想偏向的城市（当前报告所在城市），同城候选排前 */
  region?: string
  /** 对比地点模式：选定的地点作为 B 跑第二次分析 */
  compareMode?: boolean
  onCancelCompare?: () => void
  /** 街道体检「选街道中心」模式：选定的地点只作为范围中心，不跑单点体检 */
  batchMode?: boolean
  onCancelBatch?: () => void
  onPick: (center: LngLat, label: string) => void
}

/** 左上搜索：地址 → /api/geocode；或从内置样例挑一个；或直接点地图。对比模式下同一个框选 B 地点 */
export default function SearchBox({
  busy,
  mock,
  region,
  compareMode = false,
  onCancelCompare,
  batchMode = false,
  onCancelBatch,
  onPick,
}: Props) {
  const [q, setQ] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [samples, setSamples] = useState<SampleItem[]>(mock ? MOCK_SAMPLES : [])
  const [samplesOpen, setSamplesOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const [picked, setPicked] = useState('') // 已点选候选后的文本，避免再次触发联想
  const [composing, setComposing] = useState(false) // 中文输入法组合中（拼音未上屏）
  const wrapRef = useRef<HTMLDivElement>(null)
  // 联想不受 mock 影响：后端真不可用时请求会失败、列表为空，不需要提前禁用
  const suggest = useSuggest(q === picked || composing ? '' : q, focused, region)
  const showSuggest = focused && (suggest.items.length > 0 || suggest.loading)

  const pickSuggest = (it: SuggestItem) => {
    const label =
      it.district && !it.name.includes(it.district) ? `${it.district} · ${it.name}` : it.name
    setQ(it.name)
    setPicked(it.name)
    setActive(-1)
    suggest.clear()
    setFocused(false)
    onPick(it.location, label)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 输入法组合中的回车是"上屏"，不是搜索
    if (composing || e.nativeEvent.isComposing || e.keyCode === 229) return
    if (!showSuggest) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggest.items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggest.items.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pickSuggest(suggest.items[active])
    } else if (e.key === 'Escape') {
      setFocused(false)
    }
  }

  // 进入 / 退出对比模式：清空输入并聚焦，让用户直接打字
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setQ('')
    setPicked('')
    setActive(-1)
    if (compareMode || batchMode) inputRef.current?.focus()
  }, [compareMode, batchMode])

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
    if (!samplesOpen && !focused) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setSamplesOpen(false)
        setFocused(false)
      }
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSamplesOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [samplesOpen, focused])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const address = q.trim()
    if (!address || composing) return
    if (showSuggest && active >= 0) {
      pickSuggest(suggest.items[active])
      return
    }
    setFocused(false)
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
        className={`panel flex border bg-[var(--paper)] ${
          compareMode
            ? 'border-[var(--ochre)] ring-2 ring-[var(--ochre)]/25'
            : batchMode
              ? 'border-[var(--teal)] ring-2 ring-[var(--teal)]/25'
              : 'border-[var(--ink)]'
        }`}
        role="search"
      >
        <label htmlFor="addr" className="sr-only">
          {compareMode
            ? '输入要对比的小区或地址'
            : batchMode
              ? '输入街道或小区名作为体检中心'
              : '输入地址或小区名'}
        </label>
        {batchMode && !compareMode && (
          <span
            className="flex shrink-0 items-center gap-1.5 border-r border-[var(--line-strong)] pl-2.5 pr-2 text-xs font-medium text-[var(--ink)]"
            title="街道体检中心：搜索，或直接在地图上点一下"
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-[var(--paper)]"
              style={{ background: 'var(--teal)' }}
              aria-hidden="true"
            >
              ⌖
            </span>
            街道中心
          </span>
        )}
        {compareMode && (
          <span
            className="flex shrink-0 items-center gap-1.5 border-r border-[var(--line-strong)] pl-2.5 pr-2 text-xs font-medium text-[var(--ink)]"
            title="对比地点 B：搜索，或直接在地图上点一下"
          >
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-[var(--paper)]"
              style={{ background: 'var(--ochre)' }}
              aria-hidden="true"
            >
              B
            </span>
            对比地点
          </span>
        )}
        <input
          id="addr"
          ref={inputRef}
          className="input !border-0 !shadow-none"
          placeholder={
            compareMode
              ? '输入要对比的小区 / 地址'
              : batchMode
                ? '输入街道 / 小区名'
                : '输入地址 / 小区名，或直接在地图上点一下'
          }
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(-1)
            setFocused(true)
          }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(e) => {
            setComposing(false)
            setQ((e.target as HTMLInputElement).value)
          }}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={showSuggest}
          aria-controls="addr-suggest"
          aria-autocomplete="list"
        />
        <button
          type="submit"
          className="btn btn-primary !border-0 shrink-0"
          disabled={geocoding || busy || !q.trim()}
          aria-label={
            compareMode
              ? '搜索并作为对比地点分析'
              : batchMode
                ? '搜索并设为街道体检中心'
                : '搜索并分析'
          }
        >
          <Icon name="search" size={16} />
          <span className="hidden sm:inline">
            {geocoding ? '定位中…' : compareMode ? '对比' : batchMode ? '定位' : '体检'}
          </span>
        </button>
        {compareMode || batchMode ? (
          <button
            type="button"
            className="btn !border-0 !border-l !border-l-[var(--line-strong)] shrink-0 !px-2.5 text-xs"
            onClick={compareMode ? onCancelCompare : onCancelBatch}
            title={compareMode ? '取消选对比地点' : '退出街道体检'}
          >
            <Icon name="x" size={14} />
            取消
          </button>
        ) : (
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
        )}
      </form>
      {showSuggest && !samplesOpen && (
        <SuggestList
          loading={suggest.loading}
          items={suggest.items}
          active={active}
          onHover={setActive}
          onPick={pickSuggest}
        />
      )}
      {samplesOpen && (
        <ul
          className="panel rise-in mt-1 max-h-72 overflow-auto border border-[var(--line-strong)] bg-[var(--paper)] py-1 scroll-thin"
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
