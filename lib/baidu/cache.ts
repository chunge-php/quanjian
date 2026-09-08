/**
 * 响应缓存：内存 LRU + 可选磁盘缓存。
 * key = sha1(去掉 ak 参数后的 URL)，所以磁盘文件里绝不会出现 AK。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

export interface CacheOptions {
  /** 内存条目上限，默认 500 */
  maxEntries?: number
  /** 磁盘目录；null/undefined 表示不落盘 */
  cacheDir?: string | null
  /** 有效期毫秒，默认 7 天；0 表示永不过期 */
  ttlMs?: number
  now?: () => number
}

export interface ResponseCache {
  get(key: string): Promise<unknown | undefined>
  set(key: string, value: unknown): Promise<void>
  /** 清空内存（磁盘不动） */
  clear(): void
  readonly size: number
}

interface Entry {
  savedAt: number
  value: unknown
}

/** 去掉 URL 里的 ak / sn 等敏感参数，用于生成缓存 key 与写日志 */
export function stripSecrets(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('ak')
    u.searchParams.delete('sn')
    u.searchParams.delete('timestamp')
    return u.toString()
  } catch {
    return url.replace(/([?&])ak=[^&]*&?/g, '$1').replace(/[?&]$/, '')
  }
}

/** 缓存 key：sha1(去 ak 的 URL) */
export function cacheKey(url: string): string {
  return createHash('sha1').update(stripSecrets(url)).digest('hex')
}

/**
 * 创建缓存实例。内存 LRU 用 Map 的插入顺序实现（命中即重新插入到尾部）。
 * 磁盘文件：<cacheDir>/<sha1>.json，内容 {savedAt, value}，写入失败静默忽略。
 */
export function createCache(opts: CacheOptions = {}): ResponseCache {
  const maxEntries = Math.max(1, opts.maxEntries ?? 500)
  const ttl = opts.ttlMs ?? 7 * 24 * 3600 * 1000
  const now = opts.now ?? (() => Date.now())
  const dir = opts.cacheDir ?? null
  const mem = new Map<string, Entry>()
  let dirReady: Promise<void> | null = null

  const fresh = (e: Entry) => ttl === 0 || now() - e.savedAt < ttl
  const fileOf = (key: string) => path.join(dir as string, `${key}.json`)

  function ensureDir() {
    if (!dir) return Promise.resolve()
    if (!dirReady) dirReady = mkdir(dir, { recursive: true }).then(() => undefined)
    return dirReady
  }

  function putMem(key: string, e: Entry) {
    mem.delete(key)
    mem.set(key, e)
    while (mem.size > maxEntries) {
      const oldest = mem.keys().next().value
      if (oldest === undefined) break
      mem.delete(oldest)
    }
  }

  return {
    async get(key) {
      const hit = mem.get(key)
      if (hit) {
        if (fresh(hit)) {
          putMem(key, hit)
          return hit.value
        }
        mem.delete(key)
      }
      if (!dir) return undefined
      try {
        const raw = await readFile(fileOf(key), 'utf8')
        const e = JSON.parse(raw) as Entry
        if (typeof e?.savedAt !== 'number' || !('value' in e)) return undefined
        if (!fresh(e)) {
          unlink(fileOf(key)).catch(() => undefined)
          return undefined
        }
        putMem(key, e)
        return e.value
      } catch {
        return undefined
      }
    },
    async set(key, value) {
      const e: Entry = { savedAt: now(), value }
      putMem(key, e)
      if (!dir) return
      try {
        await ensureDir()
        await writeFile(fileOf(key), JSON.stringify(e), 'utf8')
      } catch {
        /* 磁盘不可写不影响功能 */
      }
    },
    clear() {
      mem.clear()
    },
    get size() {
      return mem.size
    },
  }
}
