/**
 * 把分析流水线包装成 SSE（text/event-stream）响应。
 * 每个 AnalyzeEvent 一行 `data: <json>\n\n`；流水线致命错误也会以 error 事件发出后关闭流。
 */
import type { AnalyzeEvent, AnalyzeRequest } from '@/lib/types'
import { runAnalysis } from './analyze'
import type { PipelineDeps } from './deps'
import { errMsg } from './util'

/** SSE 响应头（禁缓存 + 关闭 Nginx 缓冲） */
export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-store, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

/** 单个事件序列化为 SSE 帧 */
export function encodeEvent(e: AnalyzeEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`
}

/**
 * 运行分析并以 SSE 流返回。
 * @param req 已校验的请求
 * @param deps 依赖注入（测试用）；缺省绑定真实实现
 */
export function analyzeToSse(req: AnalyzeRequest, deps?: PipelineDeps): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const push = (e: AnalyzeEvent) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(encodeEvent(e)))
        } catch {
          closed = true // 客户端已断开
        }
      }
      try {
        await runAnalysis(req, push, deps)
      } catch (e) {
        // runAnalysis 的致命错误已 emit 过 error；这里兜底未 emit 的意外异常
        const msg = errMsg(e)
        push({
          type: 'error',
          message: msg.startsWith('分析') ? msg : `分析中断：${msg}`,
          recoverable: false,
        })
      } finally {
        if (!closed) controller.close()
      }
    },
  })
  return new Response(stream, { status: 200, headers: SSE_HEADERS })
}

/** 把 SSE 文本解析回事件数组（测试/脚本用） */
export function parseSse(text: string): AnalyzeEvent[] {
  return text
    .split('\n\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as AnalyzeEvent)
}
