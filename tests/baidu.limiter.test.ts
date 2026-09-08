import { describe, it, expect } from 'vitest'
import { createLimiter, withRetry } from '@/lib/baidu'

describe('createLimiter', () => {
  it('并发信号量：同时在途不超过 concurrency', async () => {
    const lim = createLimiter({ qps: 1000, concurrency: 2 })
    let peak = 0
    let running = 0
    const job = () =>
      lim.schedule(async () => {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((r) => setTimeout(r, 5))
        running -= 1
      })
    await Promise.all(Array.from({ length: 8 }, job))
    expect(peak).toBe(2)
    expect(lim.inFlight).toBe(0)
  })

  it('令牌桶：qps=10 时 25 个请求至少跨 2 个补桶周期', async () => {
    let t = 0
    const sleep = async (ms: number) => {
      t += ms
    }
    const lim = createLimiter({ qps: 10, concurrency: 100, now: () => t, sleep })
    await Promise.all(Array.from({ length: 25 }, () => lim.schedule(async () => undefined)))
    // 容量 10：前 10 个立刻，之后每 100ms 一个 → 至少推进 1500ms
    expect(t).toBeGreaterThanOrEqual(1500)
  })

  it('fn 抛错也会释放并发槽', async () => {
    const lim = createLimiter({ qps: 1000, concurrency: 1 })
    await expect(
      lim.schedule(async () => {
        throw new Error('x')
      })
    ).rejects.toThrow('x')
    expect(lim.inFlight).toBe(0)
    await expect(lim.schedule(async () => 1)).resolves.toBe(1)
  })
})

describe('withRetry', () => {
  it('指数退避：延迟 base×2^n，达到 retries 后抛出', async () => {
    const delays: number[] = []
    let n = 0
    await expect(
      withRetry(
        async () => {
          n += 1
          throw new Error('boom')
        },
        {
          retries: 3,
          baseDelayMs: 100,
          shouldRetry: () => true,
          random: () => 0,
          onRetry: (_e, _a, d) => delays.push(d),
          sleep: async () => undefined,
        }
      )
    ).rejects.toThrow('boom')
    expect(n).toBe(4)
    expect(delays).toEqual([100, 200, 400])
  })

  it('shouldRetry=false 立即抛出', async () => {
    let n = 0
    await expect(
      withRetry(
        async () => {
          n += 1
          throw new Error('nope')
        },
        { shouldRetry: () => false, sleep: async () => undefined }
      )
    ).rejects.toThrow('nope')
    expect(n).toBe(1)
  })
})
