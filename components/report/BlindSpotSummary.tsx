import type { BlindSpotCell, FacilityCategory } from '@/lib/types'
import { CATEGORY_LABEL } from '@/lib/ui/theme'
import { fmtKm2 } from '@/lib/ui/format'

/** 盲区摘要：网格数、面积、缺哪类最多（圈内 / 圈外分列） */
export default function BlindSpotSummary({ cells }: { cells: BlindSpotCell[] }) {
  if (cells.length === 0) {
    return (
      <p className="text-sm text-[var(--teal)]">
        扫描范围内没有服务盲区：每个 200 m 网格 1 公里内都有菜市场、药店和小学。
      </p>
    )
  }
  const inner = cells.filter((c) => c.inIsochrone)
  const areaKm2 = (list: BlindSpotCell[]) => list.reduce((s, c) => s + (c.sizeM * c.sizeM) / 1e6, 0)
  const missCount = new Map<FacilityCategory, number>()
  for (const c of cells) for (const m of c.missing) missCount.set(m, (missCount.get(m) ?? 0) + 1)
  const ranked = [...missCount.entries()].sort((a, b) => b[1] - a[1])
  const maxCount = ranked[0]?.[1] ?? 1
  const severe = cells.filter((c) => c.severity >= 0.99).length

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-3 gap-x-3">
        <Stat
          label="圈内盲区格"
          value={String(inner.length)}
          sub={`共 ${cells.length} 格`}
          accent={inner.length > 0}
        />
        <Stat
          label="盲区面积"
          value={fmtKm2(areaKm2(inner))}
          sub={`km² · 全部 ${fmtKm2(areaKm2(cells))}`}
        />
        <Stat label="三项全缺" value={String(severe)} sub="格" accent={severe > 0} />
      </dl>
      <div>
        <p className="kicker mb-2">缺失类别 · 按网格数</p>
        <ul className="space-y-1.5">
          {ranked.map(([cat, n]) => (
            <li key={cat} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0 text-[var(--ink-2)]">{CATEGORY_LABEL[cat]}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-3)]">
                <span
                  className="block h-full bg-[var(--vermilion)]"
                  style={{
                    width: `${(n / maxCount) * 100}%`,
                    opacity: 0.55 + (n / maxCount) * 0.45,
                  }}
                />
              </span>
              <span className="tnum w-10 shrink-0 text-right text-xs text-[var(--ink-2)]">
                {n} 格
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] text-[var(--ink-3)]">{label}</dt>
      <dd className="mt-0.5 leading-none">
        <span
          className="tnum text-2xl font-bold"
          style={{
            fontFamily: 'var(--font-serif)',
            color: accent ? 'var(--vermilion)' : 'var(--ink)',
          }}
        >
          {value}
        </span>
      </dd>
      {sub && <dd className="mt-1 truncate text-[0.6875rem] text-[var(--ink-3)]">{sub}</dd>}
    </div>
  )
}
