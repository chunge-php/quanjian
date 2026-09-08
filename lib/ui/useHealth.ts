'use client'
import { useEffect, useState } from 'react'

export interface Health {
  ok: boolean
  hasServerAk: boolean
  sampleCount: number
}

/**
 * 后端健康检查：最多重试 5 次、约 18 秒（开发模式首个请求要等路由编译），全部失败才切本地样例。
 * 注意：React 严格模式会把首个 effect 立即清理，AbortError 不能算作后端故障。
 */
export function useHealth(forceMock: boolean) {
  const [health, setHealth] = useState<Health | null>(null)
  const [backendDown, setBackendDown] = useState(false)

  useEffect(() => {
    if (forceMock) return
    const ctrl = new AbortController()
    let cancelled = false
    const probe = async () => {
      // 开发模式首个请求要等路由编译（Windows 上可能 10 秒+），总共等约 18 秒再判定后端不可用
      const delays = [0, 1500, 3000, 5000, 8000]
      for (let i = 0; i < delays.length; i++) {
        if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]))
        if (cancelled) return
        try {
          const r = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' })
          if (r.ok) {
            const h = (await r.json()) as Health
            if (!cancelled) {
              setHealth(h)
              setBackendDown(false)
            }
            return
          }
        } catch (e) {
          if ((e as { name?: string })?.name === 'AbortError') return
        }
      }
      if (!cancelled) setBackendDown(true)
    }
    void probe()
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [forceMock])

  return { health, backendDown }
}
