'use client'
import type { AnalyzeState } from '@/lib/ui/useAnalyze'
import { STAGE_LABEL } from '@/lib/ui/useAnalyze'
import { fmtKm2 } from '@/lib/ui/format'

/** 分析进行中：抽屉里显示已到达的中间结果，等时圈先出、设施后出 */
export default function RunningPanel({ state }: { state: AnalyzeState }) {
  const ring15 = state.isochrone?.rings.find((r) => r.minutes === 15)
  const inCount = state.pois?.filter((p) => p.inIsochrone).length ?? 0
  return (
    <div className="px-5 pb-6 pt-6" aria-live="polite">
      <p className="kicker">正在体检</p>
      <h1 className="mt-1 text-xl font-semibold" style={{ fontFamily: 'var(--font-serif)' }}>
        {state.stage ? STAGE_LABEL[state.stage] : '准备中'}
        <span className="blink">…</span>
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-2)]">{state.message}</p>

      <dl className="mt-8 space-y-4">
        <Row label="等时圈" ready={!!ring15}>
          {ring15
            ? `15 分钟圈 ${fmtKm2(ring15.areaKm2)} km² · 等效半径 ${state.isochrone?.equivalentRadiusM} m`
            : '等待批量算路结果'}
        </Row>
        <Row label="民生设施" ready={!!state.pois}>
          {state.pois ? `共 ${state.pois.length} 处，圈内 ${inCount} 处` : '等待地点检索'}
        </Row>
        <Row label="评分与盲区" ready={false}>
          最后一步生成
        </Row>
      </dl>

      <div className="mt-10 space-y-2.5" aria-hidden="true">
        {[100, 84, 92, 60].map((w, i) => (
          <div key={i} className="h-3 bg-[var(--paper-3)]" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function Row({
  label,
  ready,
  children,
}: {
  label: string
  ready: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-1.5 inline-block h-2 w-2 shrink-0 ${ready ? 'bg-[var(--teal)]' : 'blink bg-[var(--line-strong)]'}`}
      />
      <div className="min-w-0">
        <dt className="text-[0.6875rem] tracking-wider text-[var(--ink-3)]">{label}</dt>
        <dd className={`text-sm ${ready ? 'text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
          {children}
        </dd>
      </div>
    </div>
  )
}
