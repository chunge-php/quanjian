/**
 * 百度地图 JSAPI GL 脚本加载器：单例 + 超时 + 失败提示
 * AK 来自 NEXT_PUBLIC_BAIDU_BROWSER_AK（浏览器端 AK，需配置 Referer 白名单）
 */
export const MAP_LOAD_ERROR = '地图脚本加载失败，请检查浏览器端 AK 与 Referer 白名单'
export const MAP_NO_AK_ERROR = '未配置浏览器端 AK（NEXT_PUBLIC_BAIDU_BROWSER_AK），地图无法显示'

const CALLBACK = '__quanjianBMapReady'
const SCRIPT_ID = 'baidu-map-gl-sdk'
let pending: Promise<typeof BMapGL> | null = null

export function getBrowserAk(): string {
  return (process.env.NEXT_PUBLIC_BAIDU_BROWSER_AK ?? '').trim()
}

export function loadBaiduMap(timeoutMs = 15000): Promise<typeof BMapGL> {
  if (typeof window === 'undefined') return Promise.reject(new Error('仅限浏览器环境'))
  if (window.BMapGL?.Map) return Promise.resolve(window.BMapGL)
  if (pending) return pending

  const ak = getBrowserAk()
  if (!ak) return Promise.reject(new Error(MAP_NO_AK_ERROR))

  pending = new Promise<typeof BMapGL>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(MAP_LOAD_ERROR))
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timer)
      pending = null
      delete window.__quanjianBMapReady
    }

    window.__quanjianBMapReady = () => {
      window.clearTimeout(timer)
      delete window.__quanjianBMapReady
      if (window.BMapGL?.Map) resolve(window.BMapGL)
      else {
        pending = null
        reject(new Error(MAP_LOAD_ERROR))
      }
    }

    const existing = document.getElementById(SCRIPT_ID)
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.async = true
    script.src = `https://api.map.baidu.com/api?type=webgl&v=1.0&ak=${encodeURIComponent(ak)}&callback=${CALLBACK}`
    script.onerror = () => {
      cleanup()
      reject(new Error(MAP_LOAD_ERROR))
    }
    document.head.appendChild(script)
  })
  return pending
}
