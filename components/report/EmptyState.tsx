import { Icon } from '@/components/Icon'

interface Props {
  mock: boolean
  noServerAk: boolean
  onUseSample: () => void
}

/** 空状态：教用户三种设中心点的方式 */
export default function EmptyState({ mock, noServerAk, onUseSample }: Props) {
  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-6">
      <p className="kicker">开始体检</p>
      <h1
        className="mt-1 text-xl font-semibold leading-snug"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        先定一个中心点
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
        以它为起点，算出 15 分钟步行能走到哪里，再看这一圈里菜市场、药店、小学等 10
        类民生设施够不够、缺在哪。
      </p>

      <button type="button" className="btn btn-primary mt-5 self-start" onClick={onUseSample}>
        用璧山样例试一下
      </button>

      <p className="kicker mt-8 mb-3">或者，自己定中心点</p>
      <ol className="space-y-4">
        <Step
          no="1"
          icon="pin"
          title="在地图上点一下"
          text="任意位置即为中心点；分析完成后还能拖动那个朱砂色准星再算一次。"
        />
        <Step
          no="2"
          icon="search"
          title="左上角搜地址"
          text="输入小区、学校或街道名，回车即体检。"
        />
        <Step
          no="3"
          icon="layers"
          title="从「样例」下拉挑一个"
          text="没有 AK 或想先看效果时，样例数据同样走完整流程。"
        />
      </ol>

      {(noServerAk || mock) && (
        <p className="mt-5 text-xs leading-relaxed text-[var(--ink-3)]">
          {mock
            ? '当前为 mock 模式（?mock=1），所有数据为本地样例。'
            : '服务端未配置百度 AK，实时分析不可用，样例仍可查看。'}
        </p>
      )}

      <div className="mt-auto pt-8">
        <p className="kicker mb-1.5">怎么算的</p>
        <p className="text-xs leading-relaxed text-[var(--ink-3)]">
          16 个方向 × 7 环采样点 → 百度批量算路取真实步行时长 → 拟合 5/10/15 分钟等时圈 → 地点检索
          10 类设施并算路 → 200 m 网格扫描 1 公里内缺硬指标的盲区。
        </p>
      </div>
    </div>
  )
}

function Step({
  no,
  icon,
  title,
  text,
}: {
  no: string
  icon: 'pin' | 'search' | 'layers'
  title: string
  text: string
}) {
  return (
    <li className="flex gap-3">
      <span className="figure mt-0.5 w-4 shrink-0 text-xs text-[var(--ink-3)]">{no}</span>
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--ink)] text-[var(--ink)]">
        <Icon name={icon} size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-2)]">{text}</p>
      </div>
    </li>
  )
}
