'use client'
import { useMemo } from 'react'
import type { HealthReport } from '@/lib/types'
import { buildComparison } from '@/lib/ui/compare'
import {
  explainCompareBlind,
  explainCompareEssentials,
  explainCompareIso,
  explainCompareMap,
  explainCompareRadar,
  explainCompareScores,
  explainCompareSuggestions,
  explainCompareTable,
  explainCompareWalk,
  readerSummary,
} from '@/lib/ui/compareExplain'
import PrintFrame from '@/components/report/PrintFrame'
import SectionHead from '@/components/report/SectionHead'
import MapSnapshot, { MAP_SNAPSHOT_CAPTION } from '@/components/report/MapSnapshot'
import CompareRadar from '@/components/compare/CompareRadar'
import CompareTable from '@/components/compare/CompareTable'
import CompareWalkBars from '@/components/compare/CompareWalkBars'
import CompareConclusion from '@/components/compare/CompareConclusion'
import {
  CompareCover,
  CompareHeaderLine,
  Explain,
  ScorePair,
  StrongWeak,
  TwoCol,
} from '@/components/compare/ComparePrintParts'
import {
  BlindCols,
  BlindDirTable,
  EssentialGrid,
  IsoCols,
  MethodBlock,
  ReachTable,
  SuggestionCols,
} from '@/components/compare/ComparePrintTables'

interface Props {
  a: HealthReport
  b: HealthReport
  /** 搜索框给的地名；缺省用报告地址尾段 */
  nameA?: string
  nameB?: string
}

/** 对比地图快照的请求尺寸（两张并排，各占半页） */
export const COMPARE_MAP_SIZE = { w: 480, h: 360 } as const

/**
 * 对比 PDF：一份文档，每一节都是左 A 右 B 两列逐项对照（屏幕上不显示，只在打印时输出）。
 * 0 封头 → 01 地图 → 02 综合评分 → 03 十类覆盖 → 04 步行分钟 → 05 对照表 → 06 硬指标
 * → 07 等时圈 → 08 盲区 → 09 建议 → 10 结论 → 11 数据与方法。
 */
export default function ComparePrint({ a, b, nameA, nameB }: Props) {
  const c = useMemo(() => {
    const base = buildComparison(a, b)
    return { ...base, nameA: nameA || base.nameA, nameB: nameB || base.nameB }
  }, [a, b, nameA, nameB])
  const sec = 'print-avoid px-5 pt-5'

  return (
    <div className="print-only cmp-print" data-testid="compare-print">
      <PrintFrame header={<CompareHeaderLine c={c} />}>
        <article className="pb-0">
          <CompareCover c={c} />

          <section className="print-avoid px-5">
            <SectionHead no="01" title="地图与等时圈" note="百度静态图 · 圈内硬指标设施" />
            <TwoCol
              c={c}
              a={<MapSnapshot report={a} caption={null} label="A" {...COMPARE_MAP_SIZE} />}
              b={<MapSnapshot report={b} caption={null} label="B" {...COMPARE_MAP_SIZE} />}
            />
            <p className="mt-1.5 text-[10.5px] leading-4 text-[var(--ink-3)]">
              {MAP_SNAPSHOT_CAPTION}
            </p>
            <Explain>{explainCompareMap(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="02" title="综合评分" note="硬指标 60% · 加分项 40%" />
            <ScorePair c={c} />
            <Explain>{explainCompareScores(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="03" title="十类设施覆盖" note="雷达叠加 · 满分 100" />
            <CompareRadar c={c} />
            <TwoCol
              c={c}
              a={<StrongWeak report={a} />}
              b={<StrongWeak report={b} />}
              className="mt-3"
            />
            <Explain>{explainCompareRadar(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="04" title="最近步行分钟" note="每类两根柱 · 朱砂线 = 15 分钟" />
            <CompareWalkBars c={c} />
            <Explain>{explainCompareWalk(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="05" title="十类对照表" note="分钟 · 差值 · 谁更好" />
            <CompareTable c={c} />
            <Explain>{explainCompareTable(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="06" title="硬指标" note="缺一项即盲区" />
            <EssentialGrid c={c} />
            <Explain>{explainCompareEssentials(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="07" title="等时圈" note="15 分钟能走多远" />
            <IsoCols c={c} />
            <ReachTable c={c} />
            <Explain>{explainCompareIso(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="08" title="服务盲区" note="200 m 网格 · 越少越好" />
            <BlindCols c={c} />
            <BlindDirTable c={c} />
            <Explain>{explainCompareBlind(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead
              no="09"
              title="规划建议"
              note={`A ${a.suggestions.length} 条 · B ${b.suggestions.length} 条`}
            />
            <SuggestionCols c={c} />
            <Explain>{explainCompareSuggestions(c)}</Explain>
          </section>

          <section className={sec}>
            <SectionHead no="10" title="结论" note="按类别分差自动生成" />
            <CompareConclusion c={c} />
            <div className="mt-3 border-l-2 border-[var(--ochre)] pl-3">
              <p className="kicker">给普通读者的一句话</p>
              <p className="mt-0.5 text-[12.5px] leading-5 text-[var(--ink)]">{readerSummary(c)}</p>
            </div>
          </section>

          <section className={sec}>
            <SectionHead no="11" title="数据与方法" note="可复现" />
            <MethodBlock c={c} />
          </section>
        </article>
      </PrintFrame>
    </div>
  )
}
