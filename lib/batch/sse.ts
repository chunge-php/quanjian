/**
 * 把批量体检包装成 SSE（text/event-stream）响应，帧格式与 lib/pipeline/sse.ts 一致：
 * 每个 BatchEvent 一行 `data: <json>\n\n`；致命错误也以 error 事件发出后关闭流。
 */
import type { BatchEvent, BatchRequest } from '@/lib/types'
import type { PipelineDeps } from '@/lib/pipeline/deps'
import { SSE_HEADERS } from '@/lib/pipeline/sse'
import { errMsg } from '@/lib/pipeline/util'
import { runBatch } from './run'

/** 单个批量事件序列化为 SSE 帧 */
export function encodeBatchEvent(e: BatchEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`
}

/**
 * 运行批量体检并以 SSE 流返回。
 * @param req 已校验的请求
 * @param deps 依赖注入（测试用）；缺省绑定真实实现
 */
export function batchToSse(req: BatchRequest, deps?: PipelineDeps): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const push = (e: BatchEvent) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(encodeBatchEvent(e)))
        } catch {
          closed = true // 客户端已断开
        }
      }
      try {
        await runBatch(req, push, deps)
      } catch (e) {
        // runBatch 的致命错误已 emit 过 error；这里兜底未 emit 的意外异常
        const msg = errMsg(e)
        push({
          type: 'error',
          message: msg.startsWith('批量') ? msg : `批量体检中断：${msg}`,
          recoverable: false,
        })
      } finally {
        if (!closed) controller.close()
      }
    },
  })
  return new Response(stream, { status: 200, headers: SSE_HEADERS })
}

/** 把 SSE 文本解析回批量事件数组（测试/脚本用） */
export function parseBatchSse(text: string): BatchEvent[] {
  return text
    .split('\n\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as BatchEvent)
}
