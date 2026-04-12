import { transformFile } from '@swc/core'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { extname, join, dirname } from 'node:path'
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
const TS_EXTENSIONS = ['.cts', '.mts', '.tsx', '.ts']

function hasTypeScriptExtension(value: string): boolean {
  return TS_EXTENSIONS.some((extension) => value.endsWith(extension))
}

function isTypeScriptSpecifier(specifier: string): boolean {
  const extension = extname(specifier)

  return extension === '' || hasTypeScriptExtension(extension)
}

function getTypeScriptTryFiles(basePath: string): string[] {
  return [
    basePath,
    ...TS_EXTENSIONS.map((extension) => basePath + extension),
    ...TS_EXTENSIONS.map((extension) => join(basePath, 'index' + extension))
  ]
}

async function resolveTypeScriptFile(basePath: string): Promise<string | null> {
  for (const file of getTypeScriptTryFiles(basePath)) {
    if (await existsWithCache(file)) {
      return file
    }
  }

  return null
}

function matchPathPattern(specifier: string, pattern: string): string[] | null {
  const starIndex = pattern.indexOf('*')

  if (starIndex === -1) {
    return specifier === pattern ? [] : null
  }

  const prefix = pattern.slice(0, starIndex)
  const suffix = pattern.slice(starIndex + 1)

  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
    return null
  }

  return [specifier.slice(prefix.length, specifier.length - suffix.length)]
}

function applyPathMapping(target: string, matches: string[]): string {
  let mapped = target

  for (const match of matches) {
    mapped = mapped.replace('*', match)
  }

  return mapped
}

async function resolveTsConfigPath(
  specifier: string,
  paths: Record<string, string[]> | null,
  baseUrl: string | null
): Promise<string | null> {
  if (!paths || !baseUrl || !isTypeScriptSpecifier(specifier)) {
    return null
  }

  for (const [pattern, targets] of Object.entries(paths)) {
    const matches = matchPathPattern(specifier, pattern)
    if (!matches) continue

    for (const target of targets) {
      const mappedTarget = applyPathMapping(target, matches)
      const resolved = await resolveTypeScriptFile(join(baseUrl, mappedTarget))
      if (resolved) return resolved
    }
  }

  return null
}

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
    const data = await readFile(join(process.cwd(), 'tsconfig.json'), 'utf-8')
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
      baseUrl ? join(process.cwd(), baseUrl) : process.cwd()
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
  const { paths, baseUrl } = await loadTSConfig()
  const resolvedTsConfigPath = await resolveTsConfigPath(
    specifier,
    paths,
    baseUrl
  )

  if (resolvedTsConfigPath) {
    const url = pathToFileURL(resolvedTsConfigPath).href
    resolveCache.set(`${ctx.parentURL}::${specifier}`, url)
    return {
      url,
      format: 'module',
      shortCircuit: true
    }
  }

  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    return next(specifier, ctx)
  }

  if (!isTypeScriptSpecifier(specifier)) {
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
  const parentDir = dirname(parentPath)

  const basePath = join(parentDir, specifier)

  const tryFiles = [
    basePath,
    basePath + '.ts',
    basePath + '.tsx',
    basePath + '.mts',
    basePath + '.cts',
    basePath + '.js',
    basePath + '.mjs',
    basePath + '.cjs',
    join(basePath, 'index.ts'),
    join(basePath, 'index.tsx'),
    join(basePath, 'index.mts'),
    join(basePath, 'index.cts'),
    join(basePath, 'index.js'),
    join(basePath, 'index.mjs'),
    join(basePath, 'index.cjs')
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
  if (!url.startsWith('file://') || !hasTypeScriptExtension(url)) {
    return next(url, ctx)
  }

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
