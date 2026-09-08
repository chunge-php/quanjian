'use client'
import { dismissToast, useToasts, type ToastKind } from '@/lib/ui/toast'
import { Icon } from '@/components/Icon'

const KIND_STYLE: Record<ToastKind, string> = {
  info: 'border-l-[var(--ink)]',
  success: 'border-l-[var(--teal)]',
  warn: 'border-l-[var(--ochre)]',
  error: 'border-l-[var(--vermilion)]',
}

export default function Toast() {
  const items = useToasts()
  if (items.length === 0) return null
  return (
    <div
      className="toast-root no-print pointer-events-none fixed inset-x-3 top-[7.25rem] z-[var(--z-toast)] flex flex-col items-center gap-2 md:inset-x-auto md:left-1/2 md:top-[4.25rem] md:-translate-x-1/2"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`panel rise-in pointer-events-auto flex max-w-[26rem] items-start gap-3 border border-[var(--line-strong)] border-l-[3px] bg-[var(--paper)] py-2.5 pl-3 pr-2 text-sm text-[var(--ink)] shadow-[0_2px_0_var(--line)] ${KIND_STYLE[t.kind]}`}
        >
          <p className="min-w-0 flex-1 break-words leading-snug">{t.text}</p>
          <button
            type="button"
            className="btn btn-ghost btn-icon !min-h-8 !h-8 !w-8"
            aria-label="关闭提示"
            onClick={() => dismissToast(t.id)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
