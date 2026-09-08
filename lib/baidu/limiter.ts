/**
 * 限流器：令牌桶 QPS 限流 + 并发信号量 + 指数退避重试。
 *
 * 实测（见 LIMITS.md）：个人开发者 AK 的 routematrix/walking 单次耗时约 0.9s，
 * 并发 ≥3 就会稳定出现 401「当前并发量已经超过约定并发配额」，并发 2 偶发。
 * 所以默认 concurrency=2、qps=3，再配合 401 退避重试兜底。
 */

export interface LimiterOptions {
  /** 每秒最多放行的请求数（令牌桶速率） */
  qps: number
  /** 同时在途请求上限（信号量） */
  concurrency: number
  /** 令牌桶容量，默认 = qps（允许 1 秒的突发） */
  burst?: number
  /** 注入时钟，便于测试 */
  now?: () => number
  /** 注入 sleep，便于测试 */
  sleep?: (ms: number) => Promise<void>
}

export interface Limiter {
  /** 在限流 + 并发约束下执行 fn */
  schedule<T>(fn: () => Promise<T>): Promise<T>
  /** 当前在途数量（用于观测/测试） */
  readonly inFlight: number
  /** 当前排队数量 */
  readonly queued: number
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 创建限流器。
 * 令牌桶：每 1000/qps 毫秒补一个令牌，容量 burst；没令牌就等到下一个令牌到期。
 * 信号量：最多 concurrency 个 fn 同时运行，其余排队 FIFO。
 */
export function createLimiter(opts: LimiterOptions): Limiter {
  const qps = Math.max(0.01, opts.qps)
  const capacity = Math.max(1, opts.burst ?? Math.ceil(qps))
  const now = opts.now ?? (() => Date.now())
  const sleep = opts.sleep ?? defaultSleep
  const intervalMs = 1000 / qps

  let tokens = capacity
  let lastRefill = now()
  let inFlight = 0
  const waiters: Array<() => void> = []

  function refill() {
    const t = now()
    const gained = Math.floor((t - lastRefill) / intervalMs)
    if (gained > 0) {
      tokens = Math.min(capacity, tokens + gained)
      lastRefill += gained * intervalMs
    }
  }

  async function takeToken() {
    for (;;) {
      refill()
      if (tokens > 0) {
        tokens -= 1
        return
      }
      const wait = Math.max(1, Math.ceil(intervalMs - (now() - lastRefill)))
      await sleep(wait)
    }
  }

  function acquire(): Promise<void> {
    if (inFlight < Math.max(1, opts.concurrency)) {
      inFlight += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      waiters.push(() => {
        inFlight += 1
        resolve()
      })
    })
  }

  function release() {
    inFlight -= 1
    const next = waiters.shift()
    if (next) next()
  }

  return {
    async schedule<T>(fn: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        await takeToken()
        return await fn()
      } finally {
        release()
      }
    },
    get inFlight() {
      return inFlight
    },
    get queued() {
      return waiters.length
    },
  }
}

export interface RetryOptions {
  /** 最多重试次数（不含首次），默认 3 */
  retries?: number
  /** 首次退避毫秒，默认 500；之后 ×2 递增，并加 0-30% 抖动 */
  baseDelayMs?: number
  /** 单次退避上限，默认 8000 */
  maxDelayMs?: number
  /** 判断错误是否可重试 */
  shouldRetry: (err: unknown, attempt: number) => boolean
  /** 每次重试前回调（用于计数 stats.rateLimited） */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

/**
 * 指数退避重试：fn 抛错且 shouldRetry 为真时，等待 base×2^attempt（含抖动）后重试。
 * 超过 retries 次后把最后一次错误原样抛出。
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const retries = opts.retries ?? 3
  const base = opts.baseDelayMs ?? 500
  const max = opts.maxDelayMs ?? 8000
  const sleep = opts.sleep ?? defaultSleep
  const random = opts.random ?? Math.random
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !opts.shouldRetry(err, attempt)) throw err
      const delay = Math.min(max, base * 2 ** attempt) * (1 + 0.3 * random())
      opts.onRetry?.(err, attempt, delay)
      attempt += 1
      await sleep(delay)
    }
  }
}
