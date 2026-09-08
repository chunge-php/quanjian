import type { HealthReport } from '@/lib/types'

const META: Record<HealthReport['dataSource'], { label: string; color: string; hint: string }> = {
  live: { label: '实时', color: 'var(--teal)', hint: '百度地图 Web 服务 API 实时调用' },
  mixed: { label: '部分降级', color: 'var(--ochre)', hint: '部分接口限流或失败，已用估算补齐' },
  sample: { label: '样例', color: 'var(--ink-3)', hint: '内置样例数据' },
}

export default function SourceBadge({ source }: { source: HealthReport['dataSource'] }) {
  const m = META[source]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 text-[0.6875rem] tracking-wider"
      style={{ borderColor: m.color, color: m.color }}
      title={m.hint}
    >
      <span
        className="inline-block h-1.5 w-1.5"
        style={{ background: m.color }}
        aria-hidden="true"
      />
      {m.label}
    </span>
  )
}
