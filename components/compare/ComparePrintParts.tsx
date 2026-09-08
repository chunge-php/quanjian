import type { HealthReport } from '@/lib/types'
import type { Comparison, Slot } from '@/lib/ui/compare'
import { SLOT_HEX } from '@/lib/ui/compare'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { fmtDateTime } from '@/lib/ui/format'
import { strongWeak } from '@/lib/ui/compareRows'
import { SlotChip } from '@/components/compare/SlotChip'
import { ScoreCol } from '@/components/compare/CompareScores'
import { printTitle } from '@/components/report/PrintChrome'

export const COMPARE_TITLE = printTitle('两地对比')

/** 列头：A / B 圆标 + 地址简称，每一节的两列都带 */
export function ColHead({ slot, name }: { slot: Slot; name: string }) {
  return (
    <p
      className="mb-1.5 flex items-center gap-1.5 border-b pb-1 text-[11.5px] font-semibold leading-tight"
      style={{ borderColor: SLOT_HEX[slot] }}
    >
      <SlotChip slot={slot} size={15} />
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
    </p>
  )
}

/** 左 A 右 B 两列；每列自带列头 */
export function TwoCol({
  c,
  a,
  b,
  className = '',
}: {
  c: Comparison
  a: React.ReactNode
  b: React.ReactNode
  className?: string
}) {
  return (
    <div className={`grid grid-cols-2 gap-x-5 ${className}`}>
      <div className="min-w-0">
        <ColHead slot="A" name={c.nameA} />
        {a}
      </div>
      <div className="min-w-0">
        <ColHead slot="B" name={c.nameB} />
        {b}
      </div>
    </div>
  )
}

/** 每一节下面的一句大白话 */
export function Explain({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11.5px] leading-5 text-[var(--ink-2)]">{children}</p>
}

/** 页眉（PrintFrame thead 每页重复） */
export function CompareHeaderLine({ c }: { c: Comparison }) {
  return (
    <>
      <span>圈见 · {COMPARE_TITLE}</span>
      <span>
        A {c.nameA} vs B {c.nameB} · {fmtDateTime(c.a.generatedAt)}
      </span>
    </>
  )
}

/** 0 封头：标题 + 两列各自地址 / 综合分 / 评级 / 生成时间 */
export function CompareCover({ c }: { c: Comparison }) {
  return (
    <header className="print-cover px-5">
      <p className="kicker">圈见 · QuanJian</p>
      <h1
        className="mt-1 text-[26px] font-bold leading-tight"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {COMPARE_TITLE}
      </h1>
      <div className="mt-3 grid grid-cols-2 gap-x-5">
        <CoverCol slot="A" report={c.a} />
        <CoverCol slot="B" report={c.b} />
      </div>
      <p className="mt-3 text-[11.5px] leading-5 text-[var(--ink-2)]">
        本报告把两个地点放在同一把尺子下逐项左右对照：地图、综合分、十类设施、步行分钟、硬指标、
        等时圈、服务盲区与规划建议。每一节左列是 A、右列是 B，青色标记为 A、赭色为 B，
        谁更好在数字旁直接标出。评分与建议仅供规划参考，设施数据以现场核实为准。
      </p>
    </header>
  )
}

function CoverCol({ slot, report }: { slot: Slot; report: HealthReport }) {
  const color = GRADE_COLOR[report.overallGrade]
  return (
    <div className="min-w-0 border-t-2 pt-2" style={{ borderColor: SLOT_HEX[slot] }}>
      <p className="flex items-start gap-1.5 text-[13px] font-medium leading-snug">
        <SlotChip slot={slot} size={18} />
        <span className="min-w-0 break-words">{report.address.formatted || '未命名地点'}</span>
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 text-[11px] leading-4 text-[var(--ink-2)]">
        <div>
          <dt className="kicker">综合评分</dt>
          <dd className="tnum text-[15px] font-semibold" style={{ color }}>
            {report.overallScore}
            <span className="text-[11px] font-normal text-[var(--ink-2)]"> / 100</span>
          </dd>
        </div>
        <div>
          <dt className="kicker">评级</dt>
          <dd className="stamp text-[13px]" style={{ color }}>
            {report.overallGrade} · {GRADE_LABEL[report.overallGrade]}
          </dd>
        </div>
        <div>
          <dt className="kicker">生成时间</dt>
          <dd className="text-[var(--ink)]">{fmtDateTime(report.generatedAt)}</dd>
        </div>
      </dl>
    </div>
  )
}

/** 02 综合评分：两张大分数卡 + 中间箭头差值 */
export function ScorePair({ c }: { c: Comparison }) {
  const d = Math.abs(c.scoreDiff)
  const w = c.scoreWinner
  return (
    <div className="grid grid-cols-[1fr_5.5rem_1fr] items-center gap-x-2">
      <ScoreCol slot="A" report={c.a} name={c.nameA} winner={w} />
      <div className="text-center leading-tight">
        {w === 'tie' ? (
          <span className="text-xs text-[var(--ink-3)]">同分</span>
        ) : (
          <>
            <span
              className="block text-[22px] font-bold"
              style={{ color: SLOT_HEX[w], fontFamily: 'var(--font-serif)' }}
              aria-hidden="true"
            >
              {w === 'A' ? '◀' : '▶'}
            </span>
            <span className="block text-[11px] text-[var(--ink-2)]">
              {w} 高
              <span
                className="tnum mx-0.5 text-base font-bold"
                style={{ color: SLOT_HEX[w], fontFamily: 'var(--font-serif)' }}
              >
                {d}
              </span>
              分
            </span>
          </>
        )}
      </div>
      <ScoreCol slot="B" report={c.b} name={c.nameB} winner={w} />
    </div>
  )
}

/** 03 雷达下方：最强三类 / 最弱三类 */
export function StrongWeak({ report }: { report: HealthReport }) {
  const { strong, weak } = strongWeak(report)
  const line = (xs: typeof strong) => xs.map((x) => `${x.label} ${x.score}`).join(' · ')
  return (
    <dl className="space-y-1 text-[11.5px] leading-4">
      <div className="flex gap-2">
        <dt className="w-14 shrink-0 text-[var(--ink-3)]">最强三类</dt>
        <dd className="tnum text-[var(--teal)]">{line(strong)}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="w-14 shrink-0 text-[var(--ink-3)]">最弱三类</dt>
        <dd className="tnum text-[var(--vermilion)]">{line(weak)}</dd>
      </div>
    </dl>
  )
}
