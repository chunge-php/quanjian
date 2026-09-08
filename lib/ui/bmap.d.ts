/* 百度地图 JSAPI GL 最小类型声明（只声明本项目用到的部分） */
declare namespace BMapGL {
  class Point {
    constructor(lng: number, lat: number)
    lng: number
    lat: number
  }
  class Size {
    constructor(width: number, height: number)
    width: number
    height: number
  }
  class Pixel {
    constructor(x: number, y: number)
    x: number
    y: number
  }
  interface MapOptions {
    enableMapClick?: boolean
    minZoom?: number
    maxZoom?: number
  }
  interface ViewportOptions {
    margins?: [number, number, number, number]
    enableAnimation?: boolean
  }
  interface MapEvent {
    latlng?: Point
    latLng?: Point
    point?: Point
    pixel?: Pixel
    target?: unknown
    domEvent?: MouseEvent
  }
  type EventHandler = (e: MapEvent) => void
  class Overlay {
    addEventListener(type: string, handler: EventHandler): void
    removeEventListener(type: string, handler: EventHandler): void
    hide(): void
    show(): void
  }
  class Map {
    constructor(container: HTMLElement | string, opts?: MapOptions)
    centerAndZoom(center: Point, zoom: number): void
    setCenter(center: Point): void
    panTo(center: Point): void
    getCenter(): Point
    getZoom(): number
    setZoom(zoom: number): void
    enableScrollWheelZoom(enable?: boolean): void
    enableDragging(): void
    addOverlay(overlay: Overlay): void
    removeOverlay(overlay: Overlay): void
    clearOverlays(): void
    setViewport(points: Point[], opts?: ViewportOptions): void
    addEventListener(type: string, handler: EventHandler): void
    removeEventListener(type: string, handler: EventHandler): void
    pointToPixel(point: Point): Pixel
    pointToOverlayPixel(point: Point): Pixel
    setMapStyleV2(opts: { styleId?: string; styleJson?: unknown[] }): void
    destroy(): void
    getContainer(): HTMLElement
  }
  interface IconOptions {
    anchor?: Size
    imageSize?: Size
    imageOffset?: Size
  }
  class Icon {
    constructor(url: string, size: Size, opts?: IconOptions)
  }
  interface MarkerOptions {
    icon?: Icon
    enableDragging?: boolean
    title?: string
    offset?: Size
    enableMassClear?: boolean
  }
  class Marker extends Overlay {
    constructor(point: Point, opts?: MarkerOptions)
    getPosition(): Point
    setPosition(point: Point): void
    setIcon(icon: Icon): void
    setTitle(title: string): void
  }
  interface PolygonOptions {
    strokeColor?: string
    strokeWeight?: number
    strokeOpacity?: number
    strokeStyle?: 'solid' | 'dashed'
    fillColor?: string
    fillOpacity?: number
    enableMassClear?: boolean
    enableClicking?: boolean
  }
  class Polygon extends Overlay {
    constructor(points: Point[], opts?: PolygonOptions)
    setPath(points: Point[]): void
    setFillOpacity(opacity: number): void
    setStrokeWeight(weight: number): void
  }
  class Circle extends Overlay {
    constructor(center: Point, radius: number, opts?: PolygonOptions)
  }
  class Polyline extends Overlay {
    constructor(points: Point[], opts?: PolygonOptions)
  }
}

interface Window {
  BMapGL?: typeof BMapGL
  __quanjianBMapReady?: () => void
}
