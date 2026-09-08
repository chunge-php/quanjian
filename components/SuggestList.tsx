'use client'
import type { SuggestItem } from '@/lib/ui/useSuggest'
import { suggestSubtitle } from '@/lib/ui/useSuggest'

interface Props {
  items: SuggestItem[]
  active: number
  onHover: (i: number) => void
  onPick: (it: SuggestItem) => void
}

/** 搜索框下方的实时联想列表（百度地点输入提示） */
export default function SuggestList({ items, active, onHover, onPick }: Props) {
  if (!items.length) return null
  return (
    <ul
      id="addr-suggest"
      className="panel rise-in mt-1 max-h-80 overflow-auto border border-[var(--line-strong)] bg-[var(--paper)] py-1 scroll-thin"
      role="listbox"
      aria-label="地点联想"
    >
      {items.map((it, i) => (
        <li key={it.uid || `${it.name}-${i}`} role="option" aria-selected={i === active}>
          <button
            type="button"
            className={`block w-full px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--paper-2)] ${
              i === active ? 'bg-[var(--paper-2)]' : ''
            }`}
            onMouseEnter={() => onHover(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(it)}
          >
            <span className="flex items-baseline gap-2">
              <span className="text-sm font-medium">{it.name}</span>
              {it.tag && <span className="shrink-0 text-[11px] text-[var(--ink-3)]">{it.tag}</span>}
            </span>
            <span className="block truncate text-xs text-[var(--ink-3)]">
              {suggestSubtitle(it)}
            </span>
          </button>
        </li>
      ))}
      <li className="px-3 pt-1 text-[11px] text-[var(--ink-3)]">↑↓ 选择 · 回车定位并体检</li>
    </ul>
  )
}
