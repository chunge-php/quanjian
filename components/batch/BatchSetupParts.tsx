'use client'
import type { ReactNode } from 'react'
import type { BatchPointSummary } from '@/lib/types'
import type { BatchState } from '@/lib/ui/useBatch'
import { BATCH_STAGE_LABEL } from '@/lib/ui/useBatch'
import { GRADE_COLOR } from '@/lib/ui/theme'
import { RADIUS_MAX_M, RADIUS_MIN_M } from '@/components/batch/batchGeo'

/** 两段式切换（范围方式） */
export function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { key: T; label: string; hint: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1.5">
      {options.map((o) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={`rounded-[var(--r-sm)] border px-2.5 py-2 text-left transition-colors duration-150 ${
              on
                ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] shadow-[0_0_0_3px_var(--teal-tint)]'
                : 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-[var(--ink)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="block text-sm font-medium leading-tight">{o.label}</span>
            <span
              className={`mt-0.5 block text-[11px] leading-4 ${on ? 'text-[var(--paper)]/80' : 'text-[var(--ink-3)]'}`}
            >
              {o.hint}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 一排数值芯片（点距 / 最多点数） */
export function ChipRow<T extends number>({
  label,
  unit,
  value,
  options,
  onChange,
}: {
  label: string
  unit?: string
  value: T
  options: readonly T[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-[var(--ink-2)]">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-1 gap-1">
        {options.map((o) => {
          const on = o === value
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o)}
              className={`figure flex-1 rounded-full border px-2 py-[3px] text-[12px] leading-4 transition-colors duration-150 ${
                on
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--line-strong)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--paper-2)]'
              }`}
            >
              {o}
              {unit && <span className="ml-0.5 text-[10px] opacity-80">{unit}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function RadiusSlider({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-[var(--ink-2)]">
        半径
        <span className="figure text-sm text-[var(--ink)]">{value} m</span>
      </span>
      <input
        type="range"
        min={RADIUS_MIN_M}
        max={RADIUS_MAX_M}
        step={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--teal)]"
        aria-label="圆形范围半径"
        aria-valuetext={`${value} 米`}
      />
      <span className="flex justify-between text-[10px] text-[var(--ink-3)]">
        <span>{RADIUS_MIN_M} m</span>
        <span>{RADIUS_MAX_M} m</span>
      </span>
    </label>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="kicker mb-1.5">{label}</p>
      {children}
    </div>
  )
}

/** 进行中：进度条 + 「第 i / N 点 · 阶段」 + 点位小格子 */
export function ProgressBlock({ state, onCancel }: { state: BatchState; onCancel: () => void }) {
  const { progress, summaries, failed, plan } = state
  const total = Math.max(progress.total, plan?.points.length ?? 0)
  const doneCount = Object.keys(summaries).length + Object.keys(failed).length
  const ratio = total ? doneCount / total : 0
  const current = Math.min(total, progress.index + 1)
  const stage = progress.stage ? BATCH_STAGE_LABEL[progress.stage] : '布点'
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-label="街道体检进度"
    >
      <div className="progress-track">
        <div className="progress-bar" style={{ transform: `scaleX(${Math.max(0.03, ratio)})` }} />
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <p className="text-sm font-medium">
          第 <span className="figure">{current}</span> /{' '}
          <span className="figure">{total || '—'}</span> 点 · {stage}
        </p>
        <span className="figure text-xs text-[var(--ink-3)]">{Math.round(ratio * 100)}%</span>
      </div>
      <p className="mt-0.5 break-words text-xs text-[var(--ink-2)]">
        {progress.message || '准备中…'}
      </p>
      {total > 0 && (
        <ol className="mt-2.5 flex flex-wrap gap-1" aria-label="各点状态">
          {Array.from({ length: total }, (_, i) => (
            <PointDot
              key={i}
              index={i}
              summary={summaries[i]}
              failed={!!failed[i]}
              active={i === progress.index && !summaries[i]}
            />
          ))}
        </ol>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-[var(--ink-3)]">
          每点约 6 秒，可随时中止，已完成的点会保留
        </span>
        <button type="button" className="btn !min-h-8 text-xs" onClick={onCancel}>
          中止
        </button>
      </div>
    </div>
  )
}

function PointDot({
  index,
  summary,
  failed,
  active,
}: {
  index: number
  summary?: BatchPointSummary
  failed: boolean
  active: boolean
}) {
  const color = summary
    ? GRADE_COLOR[summary.overallGrade]
    : failed
      ? 'var(--vermilion)'
      : undefined
  return (
    <li
      className={`figure flex h-6 w-6 items-center justify-center rounded-full border text-[10px] ${
        summary
          ? 'text-[var(--paper)]'
          : failed
            ? 'border-dashed text-[var(--vermilion)]'
            : active
              ? 'blink border-[var(--vermilion)] text-[var(--ink)]'
              : 'border-dashed border-[var(--line-strong)] text-[var(--ink-3)]'
      }`}
      style={
        summary
          ? { background: color, borderColor: color }
          : failed
            ? { borderColor: color }
            : undefined
      }
      title={
        summary
          ? `第 ${index + 1} 点 ${summary.overallScore} 分`
          : failed
            ? `第 ${index + 1} 点失败`
            : `第 ${index + 1} 点`
      }
    >
      {summary ? summary.overallScore : failed ? '×' : index + 1}
    </li>
  )
}
