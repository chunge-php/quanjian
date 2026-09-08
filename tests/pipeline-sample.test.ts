/** 样例回放：最近样例选择、3km 阈值、无 AK / API 不可用回退 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAnalysis } from '@/lib/pipeline/analyze'
import {
  findNearestSample,
  listSamples,
  replaySample,
  type SampleFile,
} from '@/lib/pipeline/sample'
import type { AnalyzeEvent } from '@/lib/types'
import { CENTER, makeStubDeps } from './pipeline-stubs.test'

let dir: string

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qj-samples-'))
  // 用 stub 跑一次真实流水线录成样例
  const { deps } = makeStubDeps()
  const events: AnalyzeEvent[] = []
  await runAnalysis({ center: CENTER }, (e) => events.push(e), deps)
  const file: SampleFile = {
    slug: 'bishan',
    name: '璧山测试样例',
    description: '测试',
    center: CENTER,
    createdAt: '2026-09-08T00:00:00Z',
    events,
  }
  fs.writeFileSync(path.join(dir, 'bishan.json'), JSON.stringify(file))
  const far: SampleFile = {
    ...file,
    slug: 'far',
    name: '远处样例',
    center: { lng: 121.47, lat: 31.23 },
  }
  fs.writeFileSync(path.join(dir, 'far.json'), JSON.stringify(far))
  fs.writeFileSync(path.join(dir, 'broken.json'), '{not json')
})
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('样例文件读取', () => {
  it('listSamples 跳过坏文件，只给摘要', () => {
    const list = listSamples(dir)
    expect(list.map((s) => s.slug).sort()).toEqual(['bishan', 'far'])
    expect(list[0]).not.toHaveProperty('events')
  })
  it('findNearestSample：3km 内取最近，超出返回 null', () => {
    const near = findNearestSample({ lng: CENTER.lng + 0.01, lat: CENTER.lat }, dir)
    expect(near?.sample.slug).toBe('bishan')
    expect(near!.distanceM).toBeLessThan(1200)
    expect(findNearestSample({ lng: 116.4, lat: 39.9 }, dir)).toBeNull()
    expect(findNearestSample({ lng: 121.48, lat: 31.24 }, dir)?.sample.slug).toBe('far')
  })
  it('replaySample 重放全套事件并改写 dataSource/warnings', () => {
    const found = findNearestSample(CENTER, dir)!
    const events: AnalyzeEvent[] = []
    const report = replaySample(found, (e) => events.push(e), '测试原因')
    expect(events[0]).toMatchObject({ type: 'stage', stage: 'geocode' })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
    expect(report.dataSource).toBe('sample')
    expect(report.warnings[0]).toContain('测试原因')
    expect(report.warnings[0]).toContain('璧山测试样例')
    expect(report.id).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('runAnalysis 回退样例', () => {
  it('无 AK → 直接回放最近样例，不调任何 API', async () => {
    const { deps, calls } = makeStubDeps({}, { hasAk: false, samplesDir: dir })
    const events: AnalyzeEvent[] = []
    const report = await runAnalysis(
      { center: { lng: CENTER.lng, lat: CENTER.lat + 0.005 } },
      (e) => events.push(e),
      deps
    )
    expect(report.dataSource).toBe('sample')
    expect(calls).toEqual(['resetStats'])
    expect(
      events.filter((e) => e.type === 'stage').map((e) => (e as { stage: string }).stage)
    ).toContain('done')
  })
  it('无 AK 且 3km 内无样例 → 致命错误', async () => {
    const { deps } = makeStubDeps({}, { hasAk: false, samplesDir: dir })
    const events: AnalyzeEvent[] = []
    await expect(
      runAnalysis({ center: { lng: 116.4, lat: 39.9 } }, (e) => events.push(e), deps)
    ).rejects.toThrow('没有内置样例')
    expect(events.at(-1)).toMatchObject({ type: 'error', recoverable: false })
  })
  it('有 AK、允许回退、API 不可用（逆地理编码失败）→ 回放样例', async () => {
    const { deps } = makeStubDeps(
      { reverseThrows: true },
      { allowSampleFallback: true, samplesDir: dir }
    )
    const events: AnalyzeEvent[] = []
    const report = await runAnalysis({ center: CENTER }, (e) => events.push(e), deps)
    expect(report.dataSource).toBe('sample')
    expect(report.warnings[0]).toContain('API 暂不可用')
  })
  it('有 AK、允许回退、算路与检索全部失败 → 回放样例', async () => {
    const { deps } = makeStubDeps(
      { routingThrows: true, searchThrows: true },
      { allowSampleFallback: true, samplesDir: dir }
    )
    const report = await runAnalysis({ center: CENTER }, () => {}, deps)
    expect(report.dataSource).toBe('sample')
  })
  it('有 AK、不允许回退、API 不可用 → 走降级不回放', async () => {
    const { deps } = makeStubDeps(
      { reverseThrows: true },
      { allowSampleFallback: false, samplesDir: dir }
    )
    const report = await runAnalysis({ center: CENTER }, () => {}, deps)
    expect(report.dataSource).toBe('mixed')
  })
})
