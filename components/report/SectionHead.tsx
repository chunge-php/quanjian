/** 报告分节标题：图纸式编号 + 标题 + 髮丝线，不用卡片 */
export default function SectionHead({
  no,
  title,
  note,
  className = '',
}: {
  no: string
  title: string
  note?: string
  className?: string
}) {
  return (
    <header className={`mb-3 ${className}`}>
      <div className="flex items-baseline gap-2.5">
        <span className="figure text-[0.6875rem] text-[var(--ink-3)]">{no}</span>
        <h2 className="text-[0.9375rem] font-semibold tracking-wide">{title}</h2>
        {note && <span className="ml-auto text-[0.6875rem] text-[var(--ink-3)]">{note}</span>}
      </div>
      <div className="hairline mt-1.5" />
    </header>
  )
}
