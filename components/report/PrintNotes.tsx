import type { HealthReport } from '@/lib/types'
import SectionHead from '@/components/report/SectionHead'

/** 只在打印/PDF 里出现的一段直白说明（屏幕上隐藏，避免抽屉太长） */
export function PrintNote({ children }: { children: React.ReactNode }) {
  return <p className="print-only mt-2 text-[12px] leading-5 text-[var(--ink-2)]">{children}</p>
}

const GRADE_TEXT: Record<HealthReport['overallGrade'], string> = {
  A: '优（85 分及以上）：日常需求步行都能解决',
  B: '良（70–84 分）：大多数设施够用，个别类别偏远',
  C: '中（50–69 分）：有明显短板，部分需求要靠车',
  D: '差（50 分以下）：多类设施缺失，需要重点补配',
}

/** 09 · 怎么看这份报告：给非专业读者的直白解释 */
export default function PrintGuide({ report }: { report: HealthReport }) {
  const iso = report.isochrone
  const r15 = iso.rings.find((r) => r.minutes === 15)
  return (
    <section className="print-only print-avoid px-5 pt-6">
      <SectionHead no="09" title="怎么看这份报告" note="写给普通读者" />
      <dl className="mt-2 space-y-3 text-[12.5px] leading-5">
        <Item term="什么是 15 分钟生活圈">
          国家提倡居民从家出发步行 15 分钟，就能买到菜、配到药、送孩子上小学、看社区门诊。
          本报告以你选的中心点为「家」，看这 15 分钟里到底能走到哪、有什么。
        </Item>
        <Item term="地图上那个不规则的圈是怎么来的">
          它不是画的圆。系统从中心点向 16 个方向各撒了 7 个点，共 112 个点，逐个向百度地图询问
          「真实沿路走过去要几分钟」，再把「刚好 15
          分钟」的位置连起来。哪个方向路顺，圈就往哪个方向伸得远；
          有河、铁路、封闭小区挡着，圈就缩回来。
          {r15 && (
            <>
              这次 15 分钟圈面积 {r15.areaKm2.toFixed(2)} km²，相当于半径{' '}
              {Math.round(iso.equivalentRadiusM)} 米的圆；如果直接画 1080 米的圆（15 分钟 × 每秒 1.2
              米）， 面积会是 3.66 km²，比真实可达范围大{' '}
              {Math.round((3.66 / r15.areaKm2 - 1) * 100)}%。
            </>
          )}
        </Item>
        <Item term="圆度是什么">
          圆度 = 圈有多像一个圆，1 是正圆。数值越低说明某些方向被明显挡住。本次{' '}
          {iso.circularity.toFixed(2)}。
        </Item>
        <Item term="十类设施的分数怎么算">
          每一类看「最近的一处步行几分钟」：5 分钟内 100 分，10 分钟内 85 分，15 分钟内 70 分，20
          分钟内 45 分， 更远 20 分，周边没有 0 分；圈内数量多再加最多 10 分。
          菜市场、药店、小学是国家要求的硬指标，权重 60%；其余 7 类是加分项，权重 40%。
        </Item>
        <Item term="综合评级">
          {report.overallScore} 分 · {GRADE_TEXT[report.overallGrade]}。
        </Item>
        <Item term="什么是服务盲区">
          把中心点周边 1.5 公里铺成 200 米一格的网格，每一格检查 1 公里内有没有菜市场、药店、小学。
          缺一样就算盲区，缺得越多颜色越红。「圈内盲区」是你 15
          分钟能走到、却仍然缺硬指标的地方，最该优先补。
        </Item>
        <Item term="数据从哪来、准不准">
          设施位置来自百度地图地点检索，步行时间来自百度批量算路（按 4.3 km/h 的常人步速）。
          个别点位如果算路失败会用直线距离 × 1.3 估算，并在文末「数据与方法」里注明。 POI
          数据有更新滞后，新开或关门的店可能没反映；请把结论当作规划参考而不是精确测量。
        </Item>
      </dl>
    </section>
  )
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <dt className="font-medium text-[var(--ink)]">{term}</dt>
      <dd className="mt-0.5 text-[var(--ink-2)]">{children}</dd>
    </div>
  )
}
