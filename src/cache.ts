import { createHash } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export const resolveCache = new Map<string, string | null>()

const statCache = new Map<string, { exists: boolean; mtime?: number }>()

function getTranspileCacheDir(): string {
  return path.join(process.cwd(), 'node_modules', '.cache', 'tsnite')
}

function getTSConfigPath(): string {
  return path.join(process.cwd(), 'tsconfig.json')
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

export async function existsWithCache(filePath: string): Promise<boolean> {
  const cached = statCache.get(filePath)
  if (cached) return cached.exists

  try {
    const stats = await stat(filePath)
    const exists = stats.isFile()
    statCache.set(filePath, { exists, mtime: stats.mtimeMs })
    return exists
  } catch {
    statCache.set(filePath, { exists: false })
    return false
  }
}

export function clearResolveCache(): void {
  resolveCache.clear()
}

export function invalidateStatCache(filePath: string): void {
  statCache.delete(filePath)
}

export function getTranspileCacheFile(filePath: string): string {
  return path.join(getTranspileCacheDir(), `${hash(filePath)}.json`)
}

export async function ensureTranspileCacheDir(): Promise<void> {
  await mkdir(getTranspileCacheDir(), { recursive: true })
}

export async function clearTranspileCache(): Promise<void> {
  await rm(getTranspileCacheDir(), { recursive: true, force: true })
}

export function isTSConfigPath(filePath: string): boolean {
  return path.resolve(filePath) === getTSConfigPath()
}

export async function invalidateFileCaches(filePath: string): Promise<void> {
  invalidateStatCache(filePath)
  clearResolveCache()

  if (isTSConfigPath(filePath)) {
    await clearTranspileCache()
    return
  }

  try {
    await rm(getTranspileCacheFile(filePath), { force: true })
  } catch {
    // Ignore cache eviction failures during watch restarts.
  }
}
