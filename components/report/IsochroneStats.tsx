import type { Isochrone } from '@/lib/types'
import { fmtKm2 } from '@/lib/ui/format'

/** 等时圈指标：三环面积、等效半径、圆度 + 16 方向可达半径小玫瑰图（纯 SVG） */
export default function IsochroneStats({ iso }: { iso: Isochrone }) {
  const rings = iso.rings.slice().sort((a, b) => a.minutes - b.minutes)
  const maxR = Math.max(1, ...iso.reachRadiusByBearing.map((r) => r.radiusM))
  const R = 44
  const pts = iso.reachRadiusByBearing.map(({ bearingDeg, radiusM }) => {
    const rad = (bearingDeg * Math.PI) / 180
    const r = (radiusM / maxR) * R
    return `${(50 + Math.sin(rad) * r).toFixed(1)},${(50 - Math.cos(rad) * r).toFixed(1)}`
  })
  const circularityNote =
    iso.circularity >= 0.75 ? '路网通达' : iso.circularity >= 0.5 ? '部分方向受阻' : '路网阻隔严重'

  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <dl className="grid grid-cols-3 gap-x-2">
          {rings.map((r) => (
            <div key={r.minutes} className="min-w-0">
              <dt className="figure text-[0.6875rem] text-[var(--teal)]">{r.minutes}′ 圈</dt>
              <dd className="tnum text-lg font-semibold leading-tight">
                {fmtKm2(r.areaKm2)}
                <span className="ml-0.5 text-[0.6875rem] font-normal text-[var(--ink-3)]">km²</span>
              </dd>
            </div>
          ))}
        </dl>
        <dl className="mt-3 grid grid-cols-2 gap-x-2 text-sm">
          <div>
            <dt className="text-[0.6875rem] text-[var(--ink-3)]">等效半径</dt>
            <dd className="tnum font-medium">{iso.equivalentRadiusM} m</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] text-[var(--ink-3)]">圆度</dt>
            <dd className="tnum font-medium">
              {iso.circularity.toFixed(2)}
              <span
                className="ml-1.5 text-xs font-normal"
                style={{
                  color:
                    iso.circularity >= 0.75
                      ? 'var(--teal)'
                      : iso.circularity >= 0.5
                        ? 'var(--ochre)'
                        : 'var(--vermilion)',
                }}
              >
                {circularityNote}
              </span>
            </dd>
          </div>
        </dl>
      </div>
      <svg
        viewBox="0 0 100 100"
        width="96"
        height="96"
        className="shrink-0"
        role="img"
        aria-label="各方向 15 分钟可达半径"
      >
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeDasharray="2 2" />
        <circle cx="50" cy="50" r={R / 2} fill="none" stroke="var(--line)" strokeDasharray="2 2" />
        <path d="M50 4v92M4 50h92" stroke="var(--line)" strokeWidth="0.6" />
        <polygon
          points={pts.join(' ')}
          fill="rgba(31,110,106,0.22)"
          stroke="var(--teal)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <text x="50" y="9" textAnchor="middle" fontSize="7" fill="var(--ink-3)">
          北
        </text>
      </svg>
    </div>
  )
}
