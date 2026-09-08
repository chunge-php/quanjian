'use client'
import type { BatchState } from '@/lib/ui/useBatch'
import { Icon } from '@/components/Icon'
import { GRADE_COLOR } from '@/lib/ui/theme'
import type { BatchDraft, BatchMode } from '@/components/batch/batchTypes'
import { MAX_POINT_OPTIONS, SPACING_OPTIONS, distM, scoreStats } from '@/components/batch/batchGeo'
import { gradeOf } from '@/lib/ui/batchExplain'
import {
  ChipRow,
  Field,
  ProgressBlock,
  RadiusSlider,
  Segment,
} from '@/components/batch/BatchSetupParts'

export interface BatchSetupProps {
  mode: BatchMode
  draft: BatchDraft
  onDraft: (patch: Partial<BatchDraft>) => void
  state: BatchState
  estimate: { points: number; minutes: number } | null
  heat: boolean
  onHeat: (on: boolean) => void
  onStart: () => void
  onCancel: () => void
  onExit: () => void
  /** 已完成 → 回到选范围 */
  onEdit: () => void
  className?: string
}

const TITLE: Record<BatchMode, string> = {
  off: '',
  setup: '选择要体检的范围',
  running: '正在逐点体检…',
  done: '街道体检已完成',
}

/**
 * 街道体检设置面板（受控）：范围（圆 / 框选）→ 参数 → 预估 → 开始；
 * 进行中显示进度；完成后显示摘要与「调整范围重跑」。
 */
export default function BatchSetup(p: BatchSetupProps) {
  const { draft, mode } = p
  return (
    <section
      className={`panel flex max-h-full flex-col border border-[var(--ink)] bg-[var(--paper)] ${p.className ?? ''}`}
      aria-label="街道体检设置"
      data-testid="batch-setup"
    >
      <header className="flex items-center gap-2 border-b border-[var(--line)] px-3.5 py-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--teal)] text-[var(--teal)]">
          <Icon name="locate" size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="kicker">街道体检</p>
          <p className="truncate text-sm font-medium leading-tight">{TITLE[mode]}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon !h-8 !min-h-8 !w-8"
          aria-label="退出街道体检"
          title="退出街道体检（清除本次结果）"
          onClick={p.onExit}
        >
          <Icon name="x" size={14} />
        </button>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-3.5 py-3">
        {mode === 'setup' && <SetupForm {...p} />}
        {mode === 'running' && <ProgressBlock state={p.state} onCancel={p.onCancel} />}
        {mode === 'done' && <DoneBlock {...p} />}
      </div>
    </section>
  )
}

function SetupForm(p: BatchSetupProps) {
  const { draft, onDraft } = p
  const hasArea = draft.kind === 'circle' ? !!draft.center : !!draft.rect
  return (
    <div className="space-y-4">
      <Field label="范围">
        <Segment
          label="范围方式"
          value={draft.kind}
          onChange={(kind) => onDraft({ kind, drawing: false })}
          options={[
            { key: 'circle', label: '以中心点画圆', hint: '搜街道名或点地图' },
            { key: 'rect', label: '在地图上框选', hint: '按住拖出矩形' },
          ]}
        />
        {draft.kind === 'circle' ? (
          <div className="mt-2.5 space-y-2.5">
            <CenterLine draft={draft} />
            <RadiusSlider value={draft.radiusM} onChange={(radiusM) => onDraft({ radiusM })} />
          </div>
        ) : (
          <RectLine draft={draft} onDraft={onDraft} />
        )}
      </Field>

      <Field label="参数">
        <div className="space-y-2">
          <ChipRow
            label="点距"
            unit="m"
            value={draft.spacingM}
            options={SPACING_OPTIONS}
            onChange={(spacingM) => onDraft({ spacingM })}
          />
          <ChipRow
            label="最多点数"
            value={draft.maxPoints}
            options={MAX_POINT_OPTIONS}
            onChange={(maxPoints) => onDraft({ maxPoints })}
          />
          <label className="flex cursor-pointer select-none items-start gap-2 text-xs text-[var(--ink-2)]">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--teal)]"
              checked={draft.fast}
              onChange={(e) => onDraft({ fast: e.target.checked })}
            />
            <span>
              <span className="font-medium text-[var(--ink)]">快速模式</span>
              <span className="block leading-4">
                8 方向等时圈，省一半算路；关掉则每点 16 方向、更精细但慢一倍
              </span>
            </span>
          </label>
        </div>
      </Field>

      <div className="flex items-center justify-between rounded-[var(--r-sm)] border border-dashed border-[var(--line-strong)] px-3 py-2">
        <p className="text-xs text-[var(--ink-2)]">
          {p.estimate ? (
            <>
              预计 <span className="figure text-sm text-[var(--ink)]">{p.estimate.points}</span>{' '}
              个点，约{' '}
              <span className="figure text-sm text-[var(--ink)]">{p.estimate.minutes}</span> 分钟
            </>
          ) : (
            '先选范围，再看预计点数'
          )}
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">每点按 6 秒估</span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={p.onStart}
          disabled={!hasArea}
          title={hasArea ? '逐点跑 15 分钟生活圈体检' : '先选一个范围'}
          data-testid="batch-start"
        >
          开始体检
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onExit}>
          退出
        </button>
      </div>
    </div>
  )
}

function CenterLine({ draft }: { draft: BatchDraft }) {
  const c = draft.center
  return (
    <div
      className={`rounded-[var(--r-sm)] border px-3 py-2 text-xs ${
        c
          ? 'border-[var(--teal)] bg-[var(--teal-tint)]'
          : 'border-dashed border-[var(--line-strong)]'
      }`}
      data-testid="batch-center"
    >
      <span className="kicker">中心点</span>
      {c ? (
        <p className="mt-0.5 break-words text-sm text-[var(--ink)]">
          {draft.centerLabel ?? '地图上点选的位置'}
          <span className="figure ml-1.5 text-[11px] text-[var(--ink-3)]">
            {c.lng.toFixed(4)}, {c.lat.toFixed(4)}
          </span>
        </p>
      ) : (
        <p className="mt-0.5 leading-4 text-[var(--ink-2)]">
          还没选：在左上搜索框输入街道 / 小区名从联想里挑一个，或直接在地图上点一下
        </p>
      )}
    </div>
  )
}

function RectLine({
  draft,
  onDraft,
}: {
  draft: BatchDraft
  onDraft: (p: Partial<BatchDraft>) => void
}) {
  const r = draft.rect
  const size = r
    ? `${(distM({ lng: r.sw.lng, lat: r.sw.lat }, { lng: r.ne.lng, lat: r.sw.lat }) / 1000).toFixed(1)} × ${(
        distM({ lng: r.sw.lng, lat: r.sw.lat }, { lng: r.sw.lng, lat: r.ne.lat }) / 1000
      ).toFixed(1)} km`
    : null
  return (
    <div className="mt-2.5 space-y-2">
      {draft.drawing ? (
        <div className="rounded-[var(--r-sm)] border border-[var(--vermilion)] bg-[var(--vermilion-tint)] px-3 py-2 text-xs">
          <p className="font-medium text-[var(--vermilion)]">
            正在框选：在地图上按住鼠标拖出矩形，松手完成
          </p>
          <p className="mt-0.5 leading-4 text-[var(--ink-2)]">对角线最多 6 km，超出会提示重画</p>
          <button
            type="button"
            className="btn !min-h-7 mt-2 text-xs"
            onClick={() => onDraft({ drawing: false })}
          >
            取消框选
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`btn w-full ${r ? '' : 'btn-primary'}`}
          onClick={() => onDraft({ drawing: true })}
          data-testid="batch-draw"
        >
          <Icon name="crosshair" size={15} />
          {r ? '重新框选' : '在地图上拖出矩形'}
        </button>
      )}
      {r && !draft.drawing && (
        <p className="rounded-[var(--r-sm)] border border-[var(--teal)] bg-[var(--teal-tint)] px-3 py-2 text-xs">
          <span className="kicker">已框选</span>
          <span className="figure mt-0.5 block text-sm text-[var(--ink)]">{size}</span>
        </p>
      )}
    </div>
  )
}

function DoneBlock(p: BatchSetupProps) {
  const pts = p.state.report?.points ?? Object.values(p.state.summaries)
  const st = scoreStats(pts)
  const fails = Object.keys(p.state.failed).length
  return (
    <div className="space-y-3">
      {st && (
        <div className="flex items-end gap-3">
          <span
            className="figure text-4xl font-semibold leading-none"
            style={{ color: GRADE_COLOR[gradeOf(st.avg)] }}
          >
            {st.avg}
          </span>
          <span className="text-xs leading-4 text-[var(--ink-2)]">
            平均分 · {pts.length} 个点{fails ? `（${fails} 个失败）` : ''}
            <span className="figure block text-[var(--ink)]">
              最高 {st.max} · 最低 {st.min}
            </span>
          </span>
        </div>
      )}
      <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-[var(--ink-2)]">
        <input
          type="checkbox"
          className="accent-[var(--teal)]"
          checked={p.heat}
          onChange={(e) => p.onHeat(e.target.checked)}
        />
        热力图（按分数着色的渐变叠加）
      </label>
      <p className="text-[11px] leading-4 text-[var(--ink-3)]">
        点地图上的圆标看该点完整报告；汇总、排名和建议在右侧抽屉。
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn flex-1" onClick={p.onEdit}>
          调整范围重跑
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onExit}>
          退出
        </button>
      </div>
    </div>
  )
}
