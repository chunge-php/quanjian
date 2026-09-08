import type { Metadata, Viewport } from 'next'
import './globals.css'
import './print.css'

export const metadata: Metadata = {
  title: '圈见 · 15 分钟生活圈体检',
  description:
    '在地图上定一个中心点，圈见基于百度地图开放能力计算 15 分钟步行等时圈，体检菜市场、药店、小学等民生设施覆盖情况，并标出服务盲区与规划建议。',
  applicationName: '圈见',
  keywords: ['15分钟生活圈', '等时圈', '百度地图', '社区规划', '民生设施', '服务盲区'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: '圈见 · 15 分钟生活圈体检',
    description: '真实步行路网等时圈 · 十类民生设施体检 · 服务盲区识别与规划建议',
    images: [{ url: '/brand/og.png', width: 1200, height: 630 }],
    locale: 'zh_CN',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f3ede0',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
