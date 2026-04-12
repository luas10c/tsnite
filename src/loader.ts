import { transformFile } from '@swc/core'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

import { parse } from './parse'
import {
  clearTranspileCache,
  ensureTranspileCacheDir,
  existsWithCache,
  getTranspileCacheFile,
  resolveCache
} from './cache'

const tsconfigCache: {
  paths: Record<string, string[]> | null
  baseUrl: string | null
} = { paths: null, baseUrl: null }

const transpileCache = new Map<
  string,
  {
    code: string
    mtimeMs: number
    size: number
    configHash: string
  }
>()

const MAX_TRANSPILE_CACHE_ENTRIES = 256
const TS_SOURCE_RE = /\.(cts|mts|tsx|ts)$/

type TranspileCacheEntry = {
  code: string
  mtimeMs: number
  size: number
  configHash: string
}

function hash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function getMemoryCachedTranspile(
  filename: string,
  mtimeMs: number,
  size: number,
  configHash: string
): string | null {
  const memoryCached = transpileCache.get(filename)

  if (
    !memoryCached ||
    memoryCached.mtimeMs !== mtimeMs ||
    memoryCached.size !== size ||
    memoryCached.configHash !== configHash
  ) {
    return null
  }

  transpileCache.delete(filename)
  transpileCache.set(filename, memoryCached)
  return memoryCached.code
}

function setMemoryCachedTranspile(
  filename: string,
  entry: TranspileCacheEntry
): void {
  if (transpileCache.has(filename)) {
    transpileCache.delete(filename)
  }

  transpileCache.set(filename, entry)

  if (transpileCache.size <= MAX_TRANSPILE_CACHE_ENTRIES) return

  const oldestKey = transpileCache.keys().next().value
  if (oldestKey) transpileCache.delete(oldestKey)
}

async function readCachedTranspile(
  filename: string,
  mtimeMs: number,
  size: number,
  configHash: string
): Promise<string | null> {
  const memoryCached = getMemoryCachedTranspile(
    filename,
    mtimeMs,
    size,
    configHash
  )
  if (memoryCached !== null) return memoryCached

  try {
    const raw = await readFile(getTranspileCacheFile(filename), 'utf8')
    const diskCached = JSON.parse(raw) as TranspileCacheEntry

    if (
      diskCached.mtimeMs !== mtimeMs ||
      diskCached.size !== size ||
      diskCached.configHash !== configHash
    ) {
      return null
    }

    setMemoryCachedTranspile(filename, diskCached)
    return diskCached.code
  } catch {
    return null
  }
}

async function writeCachedTranspile(
  filename: string,
  entry: TranspileCacheEntry
): Promise<void> {
  setMemoryCachedTranspile(filename, entry)

  try {
    await ensureTranspileCacheDir()
    await writeFile(getTranspileCacheFile(filename), JSON.stringify(entry))
  } catch {
    // Ignore cache write failures and continue with fresh output.
  }
}

async function loadTSConfig(): Promise<{
  paths: Record<string, string[]> | null
  baseUrl: string | null
}> {
  if (tsconfigCache.paths !== null && tsconfigCache.baseUrl !== null) {
    return tsconfigCache
  }

  try {
    const data = await readFile(
      path.join(process.cwd(), 'tsconfig.json'),
      'utf-8'
    )
    const { compilerOptions } = parse<{
      compilerOptions?: {
        paths?: Record<string, string[]>
        baseUrl?: string
      }
    }>(data)

    const paths = compilerOptions?.paths ?? null
    const baseUrl = compilerOptions?.baseUrl

    tsconfigCache.paths = paths || null
    tsconfigCache.baseUrl =
      baseUrl ? path.resolve(process.cwd(), baseUrl) : process.cwd()
    return tsconfigCache
  } catch {
    tsconfigCache.paths = null
    tsconfigCache.baseUrl = process.cwd()
    return tsconfigCache
  }
}

export async function resolve(
  specifier: string,
  ctx: { parentURL: string },
  next: (specifier: string, ctx: { parentURL: string }) => Promise<void>
) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return next(specifier, ctx)
  }

  const cacheKey = `${ctx.parentURL}::${specifier}`
  const cached = resolveCache.get(cacheKey)
  if (cached !== undefined) {
    if (cached === null) {
      return next(specifier, ctx)
    }

    return {
      url: cached,
      format: 'module',
      shortCircuit: true
    }
  }

  const parentPath = fileURLToPath(ctx.parentURL)
  const parentDir = path.dirname(parentPath)

  const basePath = path.resolve(parentDir, specifier)

  const tryFiles = [
    basePath,
    basePath + '.ts',
    basePath + '.tsx',
    basePath + '.mts',
    basePath + '.cts',
    basePath + '.js',
    basePath + '.mjs',
    basePath + '.cjs',
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.mts'),
    path.join(basePath, 'index.cts'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
    path.join(basePath, 'index.cjs')
  ]

  for (const file of tryFiles) {
    if (await existsWithCache(file)) {
      const url = pathToFileURL(file).href
      resolveCache.set(cacheKey, url)
      return {
        url,
        format: 'module',
        shortCircuit: true
      }
    }
  }

  resolveCache.set(cacheKey, null)

  return next(specifier, ctx)
}

export async function load(
  url: string,
  ctx: unknown,
  next: (url: string, ctx: unknown) => void
) {
  if (!url.startsWith('file://') || !TS_SOURCE_RE.test(url)) {
    return next(url, ctx)
  }

  const { paths, baseUrl } = await loadTSConfig()

  const filename = fileURLToPath(url)
  const fileStats = await stat(filename)
  const configHash = hash(
    JSON.stringify({ baseUrl: baseUrl || process.cwd(), paths: paths ?? {} })
  )
  const cachedCode = await readCachedTranspile(
    filename,
    fileStats.mtimeMs,
    fileStats.size,
    configHash
  )

  if (cachedCode !== null) {
    return { format: 'module', source: cachedCode, shortCircuit: true }
  }

  const { code } = await transformFile(filename, {
    filename,
    jsc: {
      baseUrl: baseUrl || process.cwd(),
      parser: {
        syntax: 'typescript',
        tsx: url.endsWith('.tsx'),
        decorators: true
      },
      target: 'es2022',
      keepClassNames: true,
      experimental: {
        emitAssertForImportAttributes: true
      },
      transform: {
        decoratorMetadata: true,
        legacyDecorator: true,
        react: {
          runtime: 'automatic',
          development: true
        }
      },
      paths: paths ?? {}
    },
    module: {
      type: 'es6',
      strict: true,
      outFileExtension: 'ts' as 'js',
      resolveFully: true
    },
    sourceMaps: 'inline'
  })

  await writeCachedTranspile(filename, {
    code,
    mtimeMs: fileStats.mtimeMs,
    size: fileStats.size,
    configHash
  })

  return { format: 'module', source: code, shortCircuit: true }
}

export async function resetLoaderState(options?: {
  preserveTranspileCache?: boolean
}): Promise<void> {
  tsconfigCache.paths = null
  tsconfigCache.baseUrl = null
  transpileCache.clear()
  resolveCache.clear()

  if (!options?.preserveTranspileCache) {
    await clearTranspileCache()
  }
}
