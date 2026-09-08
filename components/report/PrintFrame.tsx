import type { ReactNode } from 'react'

/**
 * 打印页眉框架：用 <table> 的 <thead> 承载页眉，Chrome 打印时会在每一页重复。
 * 屏幕上整张表按 block 渲染、thead 隐藏（见 globals.css / print.css 的 .print-frame 规则）。
 * 之所以不用 position:fixed：Chrome 会把超出页面区域的 fixed 元素溢出到相邻页，无法安全放进页边距。
 */
export default function PrintFrame({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <table className="print-frame">
      <thead>
        <tr>
          <td>
            <div className="print-frame__header">{header}</div>
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{children}</td>
        </tr>
      </tbody>
    </table>
  )
}
