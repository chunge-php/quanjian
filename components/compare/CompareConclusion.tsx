import type { Comparison } from '@/lib/ui/compare'

const CN_NO = ['一', '二', '三', '四']

/** 直白结论：按类别分差排序自动生成的中文，两三句说清楚谁更宜居、赢在哪 */
export default function CompareConclusion({ c }: { c: Comparison }) {
  return (
    <ol className="space-y-2 border-l-2 border-[var(--teal)] pl-3">
      {c.conclusion.map((line, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          <span
            className="shrink-0 font-semibold text-[var(--teal)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {CN_NO[i] ?? i + 1}
          </span>
          <span className="min-w-0 break-words text-[var(--ink)]">{line}</span>
        </li>
      ))}
    </ol>
  )
}
