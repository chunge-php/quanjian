import type { BatchArea, BatchPointSummary, LngLat } from '@/lib/types'

/** 顶栏三态之外多一个 done：关 / 选范围中 / 进行中 / 已完成（按钮上仍算"进行中"色） */
export type BatchMode = 'off' | 'setup' | 'running' | 'done'

export interface BatchDraft {
  kind: 'circle' | 'rect'
  center: LngLat | null
  centerLabel: string | null
  radiusM: number
  rect: { sw: LngLat; ne: LngLat } | null
  /** 正在地图上拖框 */
  drawing: boolean
  spacingM: number
  maxPoints: number
  fast: boolean
}

/** MapView 接线用：全部加性，null = 非批量模式 */
export interface BatchMapProps {
  area: BatchArea | null
  points: LngLat[] | null
  summaries: Record<number, BatchPointSummary>
  failed: Record<number, string>
  selected: number | null
  heat: boolean
  fitKey: number
  /** 圆模式选中心：点地图 = 设中心而不是体检 */
  pickingCenter: boolean
  drawing: boolean
  /** 定位到某点（key 变化触发一次 panTo） */
  pan: { point: LngLat; key: number } | null
  onMapClick: (p: LngLat) => void
  onRectDrawn: (sw: LngLat, ne: LngLat) => void
  onRectTooBig: (diagM: number) => void
  onSelect: (index: number) => void
}
