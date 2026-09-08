'use client'
/**
 * DOM 标记覆盖物：BMapGL.Marker 在 WebGL 里画进底图 canvas，会被 .map-canvas 的纸色滤镜一起压淡；
 * 这里用自定义 Overlay 把标记挂进 markerPane（普通 DOM），颜色不受滤镜影响，也方便做 hover。
 */
export interface DomMarkerOptions {
  /** 图片 data URL（SVG） */
  url: string
  size: number
  title?: string
  zIndex?: number
  onClick?: () => void
  /** 是否响应鼠标（有些层只做展示） */
  interactive?: boolean
}

export type DomMarkerInstance = BMapGL.Overlay & {
  setPosition(p: BMapGL.Point): void
  getPosition(): BMapGL.Point
  setUrl(url: string): void
  el: HTMLElement | null
}

type Ctor = new (point: BMapGL.Point, opts: DomMarkerOptions) => DomMarkerInstance
let cached: Ctor | null = null

/** 取得（并缓存）DomMarker 类；必须在 BMapGL 加载后调用 */
export function getDomMarkerClass(B: typeof BMapGL): Ctor {
  if (cached) return cached
  class DomMarker extends B.Overlay {
    private _map: BMapGL.Map | null = null
    private _point: BMapGL.Point
    private _opts: DomMarkerOptions
    el: HTMLElement | null = null
    constructor(point: BMapGL.Point, opts: DomMarkerOptions) {
      super()
      this._point = point
      this._opts = opts
    }
    initialize(map: BMapGL.Map): HTMLElement {
      this._map = map
      const o = this._opts
      const div = document.createElement('div')
      div.className = 'qj-marker'
      div.style.cssText = `position:absolute;width:${o.size}px;height:${o.size}px;z-index:${o.zIndex ?? 1};cursor:${o.onClick ? 'pointer' : 'default'};pointer-events:${o.interactive === false ? 'none' : 'auto'};`
      const img = document.createElement('img')
      img.src = o.url
      img.width = o.size
      img.height = o.size
      img.draggable = false
      img.style.cssText = 'display:block;width:100%;height:100%;'
      if (o.title) div.title = o.title
      div.appendChild(img)
      if (o.onClick) {
        div.addEventListener('click', (e) => {
          e.stopPropagation()
          o.onClick?.()
        })
      }
      map.getPanes().markerPane.appendChild(div)
      this.el = div
      return div
    }
    draw(): void {
      if (!this._map || !this.el) return
      const px = this._map.pointToOverlayPixel(this._point)
      const half = this._opts.size / 2
      this.el.style.left = `${px.x - half}px`
      this.el.style.top = `${px.y - half}px`
    }
    setPosition(p: BMapGL.Point): void {
      this._point = p
      this.draw()
    }
    getPosition(): BMapGL.Point {
      return this._point
    }
    setUrl(url: string): void {
      const img = this.el?.querySelector('img')
      if (img) img.src = url
    }
  }
  cached = DomMarker as unknown as Ctor
  return cached
}
