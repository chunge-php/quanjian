'use client'
import type { SimulationDiff } from '@/lib/ui/simulate'
import { GRADE_COLOR, GRADE_LABEL } from '@/lib/ui/theme'
import { fmtMinutes } from '@/lib/ui/format'

/** 前 → 后 的变化方向：升为青、降为朱砂、不变为灰 */
function trendColor(before: number, after: number, higherIsBetter = true): string {
  if (after === before) return 'var(--ink-3)'
  const better = higherIsBetter ? after > before : after < before
  return better ? 'var(--teal)' : 'var(--vermilion)'
}

function Arrow() {
  return (
    <span className="mx-1 text-[var(--ink-3)]" aria-label="变为">
      →
    </span>
  )
}

/**
 * 效果对比区：综合分大数字、盲区网格、有变化的类别、一句话结论。
 * 数字全部 figure 等宽字体，前值淡、后值重，方便核对。
 */
export default function SimulateDiff({ diff }: { diff: SimulationDiff }) {
  const removed = diff.blindBefore - diff.blindAfter
  const removedInIso = diff.blindInIsoBefore - diff.blindInIsoAfter
  return (
    <section aria-label="模拟效果对比" className="rise-in">
      <div className="card border border-[var(--line-strong)] bg-[var(--paper-2)] px-3.5 py-3">
        <p className="kicker">综合评分</p>
        <p className="mt-1 flex items-baseline">
          <span className="figure text-2xl text-[var(--ink-3)]">{diff.overallBefore}</span>
          <Arrow />
          <span
            className="figure text-4xl font-semibold leading-none"
            style={{ color: trendColor(diff.overallBefore, diff.overallAfter) }}
          >
            {diff.overallAfter}
          </span>
          <span className="ml-3 flex items-baseline gap-1 text-sm">
            <span className="text-[var(--ink-3)]">
              {diff.gradeBefore} {GRADE_LABEL[diff.gradeBefore]}
            </span>
            {diff.gradeAfter !== diff.gradeBefore && (
              <>
                <Arrow />
                <span
                  className="stamp text-xs"
                  style={{ color: GRADE_COLOR[diff.gradeAfter] }}
                  aria-label={`评级 ${diff.gradeAfter}`}
                >
                  {diff.gradeAfter} {GRADE_LABEL[diff.gradeAfter]}
                </span>
              </>
            )}
          </span>
        </p>

        <div className="hairline my-2.5" />

        <dl className="grid grid-cols-2 gap-x-3 text-sm">
          <div>
            <dt className="kicker">盲区网格</dt>
            <dd className="mt-0.5 flex items-baseline">
              <span className="figure text-[var(--ink-3)]">{diff.blindBefore}</span>
              <Arrow />
              <span
                className="figure text-xl font-semibold"
                style={{ color: trendColor(diff.blindBefore, diff.blindAfter, false) }}
              >
                {diff.blindAfter}
              </span>
              {removed > 0 && (
                <span className="ml-1.5 text-xs text-[var(--teal)]">消除 {removed}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="kicker">其中圈内</dt>
            <dd className="mt-0.5 flex items-baseline">
              <span className="figure text-[var(--ink-3)]">{diff.blindInIsoBefore}</span>
              <Arrow />
              <span
                className="figure text-xl font-semibold"
                style={{ color: trendColor(diff.blindInIsoBefore, diff.blindInIsoAfter, false) }}
              >
                {diff.blindInIsoAfter}
              </span>
              {removedInIso > 0 && (
                <span className="ml-1.5 text-xs text-[var(--teal)]">消除 {removedInIso}</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {diff.categories.length > 0 && (
        <table className="mt-2.5 w-full border-collapse text-sm">
          <caption className="kicker mb-1 text-left">受影响的类别</caption>
          <thead>
            <tr className="text-left text-[0.6875rem] text-[var(--ink-3)]">
              <th className="py-1 font-normal">类别</th>
              <th className="py-1 font-normal">分数</th>
              <th className="py-1 font-normal">最近步行（分钟）</th>
            </tr>
          </thead>
          <tbody>
            {diff.categories.map((c) => (
              <tr key={c.category} className="border-t border-[var(--line)]">
                <td className="py-1.5 font-medium">{c.label}</td>
                <td className="py-1.5">
                  <span className="figure text-[var(--ink-3)]">{c.scoreBefore}</span>
                  <Arrow />
                  <span
                    className="figure font-semibold"
                    style={{ color: trendColor(c.scoreBefore, c.scoreAfter) }}
                  >
                    {c.scoreAfter}
                  </span>
                </td>
                <td className="py-1.5">
                  <span className="figure text-[var(--ink-3)]">{fmtMinutes(c.walkMinBefore)}</span>
                  <Arrow />
                  <span
                    className="figure font-semibold"
                    style={{
                      color: trendColor(c.walkMinBefore ?? 999, c.walkMinAfter ?? 999, false),
                    }}
                  >
                    {fmtMinutes(c.walkMinAfter)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p
        className="leader mt-3 text-sm leading-6 text-[var(--ink)]"
        style={{ color: 'var(--ink)' }}
      >
        {diff.headline}
      </p>
    </section>
  )
}
