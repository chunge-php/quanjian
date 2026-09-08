'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BlindSpotCell, FacilityCategory, Isochrone, LngLat, Poi } from '@/lib/types'
import { ESSENTIAL_CATEGORIES } from '@/lib/categories'
import type { Slot } from '@/lib/ui/compare'
import type { VirtualFacility } from '@/lib/ui/simulate'
import {
  applyPoiFilter,
  countByCategory,
  DEFAULT_FILTER,
  onlyEssential,
  toggleCategory,
  type LayerFilter,
} from '@/lib/ui/layerFilter'
import { Icon } from '@/components/Icon'
import { useBaiduMap, eventLngLat } from '@/components/map/useBaiduMap'
import { useIsochroneLayer, useSampleLayer } from '@/components/map/useIsochroneLayer'
import { useCompareLayer } from '@/components/map/useCompareLayer'
import { useCenterMarker, usePoiLayer } from '@/components/map/usePoiLayer'
import { useBlindSpotLayer, type CellHover } from '@/components/map/useBlindSpotLayer'
import { useVirtualPoiLayer } from '@/components/map/useVirtualPoiLayer'
import MapLegend from '@/components/map/MapLegend'
import CompareSwitch from '@/components/map/CompareSwitch'
import PoiCard from '@/components/map/PoiCard'
import BlindSpotTip from '@/components/map/BlindSpotTip'
import { useBatchLayer, type BatchPointHover } from '@/components/map/useBatchLayer'
import { useAreaDraw } from '@/components/map/useAreaDraw'
import BatchPointTip from '@/components/batch/BatchPointTip'
import type { BatchMapProps } from '@/components/batch/batchTypes'

const NO_VIRTUALS: VirtualFacility[] = []
const noopRect = () => undefined

export interface CompareLayerProps {
  center: LngLat | null
  isochrone: Isochrone | null
  nameA: string
  nameB: string
  runningB: boolean
  /** 分段控件顶部位置（避开搜索框与提示条） */
  switchTop: string
}

export interface MapViewProps {
  /** A（当前报告）中心点与等时圈 */
  center: LngLat | null
  isochrone: Isochrone | null
  /** 对比模式：B 的中心点与等时圈；null = 单点模式 */
  compare: CompareLayerProps | null
  /** 设施 / 盲区显示哪一边 */
  focus: Slot
  onFocusChange: (s: Slot) => void
  /** 聚焦槽位的设施与盲区 */
  pois: Poi[] | null
  blindSpots: BlindSpotCell[] | null
  /** 聚焦槽位的等时圈（采样点用） */
  focusIsochrone: Isochrone | null
  showSamples: boolean
  onToggleSamples: () => void
  /** 右侧抽屉占用宽度（桌面），用于 setViewport 留边 */
  rightInset: number
  bottomInset: number
  /** 左下模拟面板占用宽度（桌面）：PoiCard 右移、setViewport 留边 */
  leftInset: number
  /** 模拟：放置模式选中的类别（非空时点地图 = 放拟建设施，而不是改中心点） */
  placing: FacilityCategory | null
  virtuals: VirtualFacility[]
  onPlaceVirtual: (category: FacilityCategory, p: LngLat) => void
  onRemoveVirtual: (id: string) => void
  /** 每次变化触发一次视野适配 */
  fitKey: number
  onCenterChange: (p: LngLat, source: 'click' | 'drag', slot: Slot) => void
  onStatus?: (status: 'loading' | 'ready' | 'error', error?: string) => void
  /** 街道体检：非空 = 批量模式（隐藏 POI / 盲区 / 等时圈，地图点击不再触发单点体检） */
  batch?: BatchMapProps | null
}

export default function MapView(props: MapViewProps) {
  const {
    center,
    isochrone,
    compare,
    focus,
    onFocusChange,
    pois,
    blindSpots,
    focusIsochrone,
    showSamples,
    onToggleSamples,
    rightInset,
    bottomInset,
    leftInset,
    placing,
    virtuals,
    onPlaceVirtual,
    onRemoveVirtual,
    fitKey,
    onCenterChange,
    onStatus,
    batch = null,
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const { map, status, error } = useBaiduMap(containerRef, center)
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null)
  const [hover, setHover] = useState<CellHover | null>(null)
  const [batchHover, setBatchHover] = useState<BatchPointHover | null>(null)
  const batchActive = batch != null
  const batchRef = useRef(batch)
  batchRef.current = batch
  const [bounds, setBounds] = useState({ w: 0, h: 0 })
  // 手机小屏默认只看硬指标（349 个设施全画会糊成一团），图例里随时可切回「全部」
  const [filter, setFilter] = useState<LayerFilter>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
      ? { ...DEFAULT_FILTER, categories: [...ESSENTIAL_CATEGORIES] }
      : DEFAULT_FILTER
  )
  const visiblePois = useMemo(() => applyPoiFilter(pois, filter), [pois, filter])
  const counts = useMemo(() => countByCategory(pois), [pois])
  const centerChangeRef = useRef(onCenterChange)
  centerChangeRef.current = onCenterChange
  const focusRef = useRef(focus)
  focusRef.current = focus
  const comparing = compare != null
  const comparingRef = useRef(comparing)
  comparingRef.current = comparing
  const placingRef = useRef(placing)
  placingRef.current = placing
  const placeRef = useRef(onPlaceVirtual)
  placeRef.current = onPlaceVirtual

  useEffect(() => {
    onStatus?.(status, error ?? undefined)
  }, [status, error, onStatus])

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect
      setBounds({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 地图点击：放置模式 = 落一处拟建设施；否则设中心点（对比模式下落到当前聚焦的一边）
  useEffect(() => {
    if (!map) return
    const handler = (e: BMapGL.MapEvent) => {
      const p = eventLngLat(e)
      if (!p) return
      const b = batchRef.current
      if (b) {
        // 批量模式：只有"选中心"吃点击；其余情况点击不触发单点体检
        if (b.pickingCenter && !b.drawing) b.onMapClick(p)
        return
      }
      if (placingRef.current) placeRef.current(placingRef.current, p)
      else centerChangeRef.current(p, 'click', comparingRef.current ? focusRef.current : 'A')
    }
    map.addEventListener('click', handler)
    return () => map.removeEventListener('click', handler)
  }, [map])

  // 批量模式下隐藏普通模式的等时圈 / POI / 盲区 / 拟建层，避免混乱
  const showIso = filter.showIsochrone && !batchActive
  useIsochroneLayer(map, showIso && !comparing ? isochrone : null)
  useCompareLayer(map, showIso && comparing ? isochrone : null, 'A', focus === 'A')
  useCompareLayer(
    map,
    showIso && comparing ? (compare?.isochrone ?? null) : null,
    'B',
    focus === 'B'
  )
  useSampleLayer(map, focusIsochrone, showSamples && !batchActive)
  useBlindSpotLayer(
    map,
    filter.showBlindSpots && !batchActive ? blindSpots : null,
    containerRef,
    setHover
  )
  usePoiLayer(map, batchActive ? null : visiblePois, setSelectedPoi)
  useVirtualPoiLayer(map, batchActive ? NO_VIRTUALS : virtuals, onRemoveVirtual)
  useBatchLayer(
    map,
    containerRef,
    batch
      ? {
          ...batch,
          insets: { right: rightInset, bottom: bottomInset, left: leftInset },
          onHover: setBatchHover,
        }
      : null
  )
  useAreaDraw(map, !!batch?.drawing, batch?.onRectDrawn ?? noopRect, batch?.onRectTooBig)
  // 街道体检：点排名表 → 定位到该点
  const batchPanKey = batch?.pan?.key ?? 0
  useEffect(() => {
    const B = window.BMapGL
    const target = batchRef.current?.pan
    if (!map || !B || !target || batchPanKey === 0) return
    map.panTo(new B.Point(target.point.lng, target.point.lat))
  }, [map, batchPanKey])
  useCenterMarker(
    map,
    center,
    useCallback((p: LngLat) => centerChangeRef.current(p, 'drag', 'A'), []),
    comparing ? 'A' : undefined,
    !batchActive
  )
  useCenterMarker(
    map,
    compare?.center ?? null,
    useCallback((p: LngLat) => centerChangeRef.current(p, 'drag', 'B'), []),
    'B'
  )

  // 选中的 POI 若已不在可见列表里（重新分析 / 被筛掉），关闭信息条
  useEffect(() => {
    setSelectedPoi((cur) => (cur && visiblePois?.some((p) => p.uid === cur.uid) ? cur : null))
  }, [visiblePois])

  // 视野适配：等时圈出来后一次性 fit；对比模式把两个 15 分钟圈一起包住
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || fitKey === 0) return
    const pts: BMapGL.Point[] = []
    for (const iso of [isochrone, compare?.isochrone ?? null]) {
      if (!iso) continue
      const ring = iso.rings.find((r) => r.minutes === 15) ?? iso.rings[0]
      if (ring) pts.push(...ring.polygon.coordinates[0].map(([lng, lat]) => new B.Point(lng, lat)))
    }
    const fallback = isochrone?.center ?? compare?.center ?? center
    if (pts.length === 0) return
    try {
      map.setViewport(pts, {
        margins: [comparing ? 104 : 72, 24 + rightInset, 24 + bottomInset, 24 + leftInset],
        enableAnimation: true,
      })
    } catch {
      if (fallback) map.setCenter(new B.Point(fallback.lng, fallback.lat))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])

  // 中心点变化（无等时圈时）→ 平移过去
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !center) return
    map.panTo(new B.Point(center.lng, center.lat))
  }, [map, center])
  const centerB = compare?.center ?? null
  useEffect(() => {
    const B = window.BMapGL
    if (!map || !B || !centerB) return
    map.panTo(new B.Point(centerB.lng, centerB.lat))
  }, [map, centerB])

  return (
    <div className="map-root absolute inset-0">
      <div
        ref={containerRef}
        className={`map-canvas absolute inset-0 bg-[var(--paper-2)] ${placing ? 'map-placing' : ''}`}
        style={batch?.drawing || batch?.pickingCenter ? { cursor: 'crosshair' } : undefined}
        aria-label={
          batch?.drawing
            ? '框选模式：按住拖出矩形范围'
            : batch?.pickingCenter
              ? '选中心模式：点击地图设为街道体检中心'
              : placing
                ? '放置模式：点击地图放置拟建设施'
                : '地图：点击任意位置设为分析中心点'
        }
      />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="blink text-sm text-[var(--ink-3)]">地图加载中…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md border border-[var(--vermilion)] bg-[var(--paper)] p-5">
            <p className="flex items-center gap-2 font-medium text-[var(--vermilion)]">
              <Icon name="alert" size={18} />
              地图无法显示
            </p>
            <p className="mt-2 text-sm text-[var(--ink-2)]">{error}</p>
            <p className="mt-2 text-xs text-[var(--ink-3)]">
              报告仍可通过样例数据查看（右侧抽屉）。
            </p>
          </div>
        </div>
      )}
      {status === 'ready' && compare && (
        <CompareSwitch
          focus={focus}
          nameA={compare.nameA}
          nameB={compare.nameB}
          runningB={compare.runningB}
          onChange={onFocusChange}
          top={compare.switchTop}
        />
      )}
      {status === 'ready' && (
        <MapLegend
          bottomInset={bottomInset}
          hasBlindSpots={!!blindSpots && blindSpots.length > 0}
          hasPois={!!pois && pois.length > 0}
          hasIsochrone={!!focusIsochrone}
          hasVirtuals={virtuals.length > 0}
          compare={comparing}
          batch={batchActive}
          rightInset={rightInset}
          filter={filter}
          counts={counts}
          showSamples={showSamples}
          onToggleSamples={onToggleSamples}
          onToggleCategory={(k: FacilityCategory) => setFilter((f) => toggleCategory(f, k))}
          onAllCategories={() => setFilter((f) => ({ ...f, categories: null }))}
          onOnlyEssential={() => setFilter((f) => onlyEssential(f))}
          onToggleLayer={(k) => setFilter((f) => ({ ...f, [k]: !f[k] }))}
        />
      )}
      {selectedPoi && !batchActive && (
        <PoiCard poi={selectedPoi} onClose={() => setSelectedPoi(null)} shifted={leftInset > 0} />
      )}
      {hover && !batchActive && <BlindSpotTip hover={hover} bounds={bounds} />}
      {batchHover && batchActive && <BatchPointTip hover={batchHover} bounds={bounds} />}
    </div>
  )
}
