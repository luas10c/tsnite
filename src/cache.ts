import { stat } from 'node:fs/promises'

export const resolveCache = new Map<string, string>()

const statCache = new Map<string, { exists: boolean; mtime?: number }>()

export async function existsWithCache(filePath: string): Promise<boolean> {
  const cached = statCache.get(filePath)
  if (cached) return cached.exists

  try {
    const stats = await stat(filePath)
    statCache.set(filePath, { exists: true, mtime: stats.mtimeMs })
    return true
  } catch {
    statCache.set(filePath, { exists: false })
    return false
  }
}
