/**
 * AnalyzeRequest 的 zod 校验（POST body 与 GET query 共用）。
 */
import { z } from 'zod'
import type { AnalyzeRequest } from '@/lib/types'

/** 中国大陆范围粗校验（BD-09） */
export const lngLatSchema = z.object({
  lng: z.coerce.number().min(73).max(136),
  lat: z.coerce.number().min(3).max(54),
})

export const analyzeRequestSchema = z.object({
  center: lngLatSchema,
  address: z.string().trim().max(120).optional(),
  bearings: z.coerce.number().int().min(4).max(72).optional(),
  noCache: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || /^(1|true|yes)$/i.test(String(v)))
    .optional(),
})

/** 解析 GET query（?lng=&lat=&address=&bearings=&noCache=） */
export function parseAnalyzeQuery(
  sp: URLSearchParams
): z.SafeParseReturnType<unknown, AnalyzeRequest> {
  const raw: Record<string, unknown> = {
    center: { lng: sp.get('lng'), lat: sp.get('lat') },
  }
  if (sp.get('address')) raw.address = sp.get('address')
  if (sp.get('bearings')) raw.bearings = sp.get('bearings')
  if (sp.get('noCache')) raw.noCache = sp.get('noCache')
  return analyzeRequestSchema.safeParse(raw) as z.SafeParseReturnType<unknown, AnalyzeRequest>
}

/** 把 zod 错误压成一句中文 */
export function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('；')
}
