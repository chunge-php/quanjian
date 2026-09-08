/**
 * 百度 Web 服务 API 客户端 —— 错误类型
 */

/** 配置错误：缺少服务端 AK 等。client 可以创建，但真正调用时抛此错误 */
export class BaiduConfigError extends Error {
  constructor(message = '缺少百度服务端 AK（BAIDU_SERVER_AK）') {
    super(message)
    this.name = 'BaiduConfigError'
  }
}

/** 可重试的错误码：401 并发超限、302 配额超限（按赛题约定退避重试） */
export const RETRYABLE_STATUS = new Set([401, 302])

/**
 * API 返回非 0 status 的错误。
 * - status: 百度错误码（0 成功；302/4/5 配额或权限；401 并发超限；240 服务禁用；2 参数错误）
 * - retryable: 是否值得退避重试
 */
export class BaiduApiError extends Error {
  readonly status: number
  readonly retryable: boolean
  readonly endpoint: string
  constructor(endpoint: string, status: number, message: string) {
    super(`百度 API ${endpoint} 失败：status=${status} ${message}`)
    this.name = 'BaiduApiError'
    this.status = status
    this.endpoint = endpoint
    this.retryable = RETRYABLE_STATUS.has(status)
  }
}

/** 网络错误（fetch 抛错 / 非 2xx / JSON 解析失败），一律可重试 */
export class BaiduNetworkError extends Error {
  readonly endpoint: string
  readonly retryable = true
  constructor(endpoint: string, cause: unknown) {
    super(
      `百度 API ${endpoint} 网络错误：${cause instanceof Error ? cause.message : String(cause)}`
    )
    this.name = 'BaiduNetworkError'
    this.endpoint = endpoint
  }
}

/** 判断一个错误是否可重试 */
export function isRetryableError(err: unknown): boolean {
  return (
    (err instanceof BaiduApiError && err.retryable) ||
    err instanceof BaiduNetworkError ||
    (err instanceof Error && !(err instanceof BaiduConfigError) && err.name === 'TypeError')
  )
}
