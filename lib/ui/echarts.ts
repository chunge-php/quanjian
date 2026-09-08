'use client'
import * as echarts from 'echarts/core'
import { BarChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, RadarSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  MarkLineComponentOption,
  RadarComponentOption,
  TooltipComponentOption,
} from 'echarts/components'

echarts.use([
  BarChart,
  RadarChart,
  GridComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
  CanvasRenderer,
])

export type EChartsOption = ComposeOption<
  | BarSeriesOption
  | RadarSeriesOption
  | GridComponentOption
  | MarkLineComponentOption
  | RadarComponentOption
  | TooltipComponentOption
>

export { echarts }

/** 图表共用色（与 globals.css 令牌一致，ECharts 走 canvas 拿不到 CSS 变量） */
export const CHART = {
  ink: '#23261f',
  ink2: '#4b4e45',
  ink3: '#6f6b5f',
  line: '#cbc1aa',
  paper: '#f3ede0',
  teal: '#1f6e6a',
  tealSoft: 'rgba(31,110,106,0.22)',
  vermilion: '#c0391d',
  vermilionSoft: 'rgba(192,57,29,0.18)',
  ochre: '#b0801f',
  font: "'PingFang SC','Hiragino Sans GB','Noto Sans CJK SC','Microsoft YaHei',system-ui,sans-serif",
} as const
