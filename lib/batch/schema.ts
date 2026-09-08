/**
 * BatchRequest 的 zod 校验（POST body 与 GET query 共用）。
 * 约束：圆半径 300~3000 m；矩形对角线 ≤ 6 km 且 sw 在 ne 西南；maxPoints 1~25；spacingM 200~1500。
 */
import { z } from 'zod'
import type { BatchRequest } from '@/lib/types'
import { lngLatSchema } from '@/lib/pipeline/schema'
import { haversineM } from '@/lib/isochrone/geo'

/** 矩形对角线上限（米） */
export const RECT_MAX_DIAGONAL_M = 6000

const nameSchema = z.string().trim().max(60).optional()

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || /^(1|true|yes)$/i.test(String(v)))

const circleSchema = z.object({
  kind: z.literal('circle'),
  center: lngLatSchema,
  radiusM: z.coerce.number().min(300).max(3000),
  name: nameSchema,
})

const rectSchema = z
  .object({ kind: z.literal('rect'), sw: lngLatSchema, ne: lngLatSchema, name: nameSchema })
  .refine((r) => r.sw.lng < r.ne.lng && r.sw.lat < r.ne.lat, {
    message: 'sw 必须位于 ne 的西南方',
  })
  .refine((r) => haversineM(r.sw, r.ne) <= RECT_MAX_DIAGONAL_M, {
    message: `矩形对角线不能超过 ${RECT_MAX_DIAGONAL_M / 1000} 公里`,
  })

/** 区域：kind 决定分支（discriminatedUnion 不接受带 refine 的成员，故用普通 union） */
export const batchAreaSchema = z.union([circleSchema, rectSchema])

export const batchRequestSchema = z.object({
  area: batchAreaSchema,
  spacingM: z.coerce.number().min(200).max(1500).optional(),
  maxPoints: z.coerce.number().int().min(1).max(25).optional(),
  fast: boolish.optional(),
  noCache: boolish.optional(),
})

/** 解析 GET query（?lng=&lat=&radius=[&max=&spacing=&fast=&noCache=&name=]），圆形区域 */
export function parseBatchQuery(sp: URLSearchParams): z.SafeParseReturnType<unknown, BatchRequest> {
  const raw: Record<string, unknown> = {
    area: {
      kind: 'circle',
      center: { lng: sp.get('lng'), lat: sp.get('lat') },
      radiusM: sp.get('radius') ?? 1000,
      ...(sp.get('name') ? { name: sp.get('name') } : {}),
    },
  }
  if (sp.get('max')) raw.maxPoints = sp.get('max')
  if (sp.get('spacing')) raw.spacingM = sp.get('spacing')
  if (sp.get('fast')) raw.fast = sp.get('fast')
  if (sp.get('noCache')) raw.noCache = sp.get('noCache')
  return batchRequestSchema.safeParse(raw) as z.SafeParseReturnType<unknown, BatchRequest>
}
