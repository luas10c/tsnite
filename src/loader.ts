import { transformFile, transformFileSync } from '@swc/core'
import type { Options as SwcOptions } from '@swc/core'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

import { parse } from './parse'
import {
  ensureTranspileCacheDir,
  ensureTranspileCacheDirSync,
  existsWithCache,
  existsWithCacheSync,
  getTranspileCacheFile,
  resolveCache
} from './cache'

export type ResolveHookContext = {
  conditions?: string[]
  importAttributes?: Record<string, string>
  parentURL?: string
}

export type ResolveHookResult = {
  format?: string | null
  importAttributes?: Record<string, string>
  shortCircuit?: boolean
  url: string
}

export type LoadHookContext = {
  conditions?: string[]
  format?: string | null
  importAttributes?: Record<string, string>
}

export type LoadHookResult = {
  format: string | null
  shortCircuit?: boolean
  source?: string | ArrayBuffer | SharedArrayBuffer | Uint8Array
}

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
const RELATIVE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs'
]

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

function resolveTypeScriptFileSync(basePath: string): string | null {
  for (const file of getTypeScriptTryFiles(basePath)) {
    if (existsWithCacheSync(file)) {
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

function* getTsConfigCandidates(
  specifier: string,
  paths: Record<string, string[]> | null,
  baseUrl: string | null
): Generator<string> {
  if (!paths || !baseUrl || !isTypeScriptSpecifier(specifier)) {
    return
  }

  for (const [pattern, targets] of Object.entries(paths)) {
    const matches = matchPathPattern(specifier, pattern)
    if (!matches) continue

    for (const target of targets) {
      const mappedTarget = applyPathMapping(target, matches)
      yield join(baseUrl, mappedTarget)
    }
  }
}

async function resolveTsConfigPath(
  specifier: string,
  paths: Record<string, string[]> | null,
  baseUrl: string | null
): Promise<string | null> {
  for (const candidate of getTsConfigCandidates(specifier, paths, baseUrl)) {
    const resolved = await resolveTypeScriptFile(candidate)
    if (resolved) return resolved
  }

  return null
}

function resolveTsConfigPathSync(
  specifier: string,
  paths: Record<string, string[]> | null,
  baseUrl: string | null
): string | null {
  for (const candidate of getTsConfigCandidates(specifier, paths, baseUrl)) {
    const resolved = resolveTypeScriptFileSync(candidate)
    if (resolved) return resolved
  }

  return null
}

function getParentDir(parentURL?: string): string {
  if (parentURL && parentURL.startsWith('file://')) {
    return dirname(fileURLToPath(parentURL))
  }

  return process.cwd()
}

function getRelativeTryFiles(
  parentURL: string | undefined,
  specifier: string
): string[] {
  const parentDir = getParentDir(parentURL)
  const basePath =
    specifier.startsWith('/') ? specifier : join(parentDir, specifier)

  return [
    basePath,
    ...RELATIVE_EXTENSIONS.map((extension) => basePath + extension),
    ...RELATIVE_EXTENSIONS.map((extension) =>
      join(basePath, 'index' + extension)
    )
  ]
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

function getConfigHash(
  baseUrl: string | null,
  paths: Record<string, string[]> | null
): string {
  return hash(
    JSON.stringify({
      baseUrl: baseUrl || process.cwd(),
      paths: paths ?? {}
    })
  )
}

function isCacheEntryValid(
  entry: TranspileCacheEntry,
  mtimeMs: number,
  size: number,
  configHash: string
): boolean {
  return (
    entry.mtimeMs === mtimeMs &&
    entry.size === size &&
    entry.configHash === configHash
  )
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
    !isCacheEntryValid(memoryCached, mtimeMs, size, configHash)
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

    if (!isCacheEntryValid(diskCached, mtimeMs, size, configHash)) {
      return null
    }

    setMemoryCachedTranspile(filename, diskCached)
    return diskCached.code
  } catch {
    return null
  }
}

function readCachedTranspileSync(
  filename: string,
  mtimeMs: number,
  size: number,
  configHash: string
): string | null {
  const memoryCached = getMemoryCachedTranspile(
    filename,
    mtimeMs,
    size,
    configHash
  )
  if (memoryCached !== null) return memoryCached

  try {
    const raw = readFileSync(getTranspileCacheFile(filename), 'utf8')
    const diskCached = JSON.parse(raw) as TranspileCacheEntry

    if (!isCacheEntryValid(diskCached, mtimeMs, size, configHash)) {
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

function writeCachedTranspileSync(
  filename: string,
  entry: TranspileCacheEntry
): void {
  setMemoryCachedTranspile(filename, entry)

  try {
    ensureTranspileCacheDirSync()
    writeFileSync(getTranspileCacheFile(filename), JSON.stringify(entry))
  } catch {
    // Ignore cache write failures and continue with fresh output.
  }
}

function parseTSConfigData(data: string): {
  paths: Record<string, string[]> | null
  baseUrl: string | null
} {
  const { compilerOptions } = parse<{
    compilerOptions?: {
      paths?: Record<string, string[]>
      baseUrl?: string
    }
  }>(data)

  const paths = compilerOptions?.paths ?? null
  const baseUrl = compilerOptions?.baseUrl

  return {
    paths: paths || null,
    baseUrl: baseUrl ? join(process.cwd(), baseUrl) : process.cwd()
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
    const parsed = parseTSConfigData(data)
    tsconfigCache.paths = parsed.paths
    tsconfigCache.baseUrl = parsed.baseUrl
    return tsconfigCache
  } catch {
    tsconfigCache.paths = null
    tsconfigCache.baseUrl = process.cwd()
    return tsconfigCache
  }
}

function loadTSConfigSync(): {
  paths: Record<string, string[]> | null
  baseUrl: string | null
} {
  if (tsconfigCache.paths !== null && tsconfigCache.baseUrl !== null) {
    return tsconfigCache
  }

  try {
    const data = readFileSync(join(process.cwd(), 'tsconfig.json'), 'utf-8')
    const parsed = parseTSConfigData(data)
    tsconfigCache.paths = parsed.paths
    tsconfigCache.baseUrl = parsed.baseUrl
    return tsconfigCache
  } catch {
    tsconfigCache.paths = null
    tsconfigCache.baseUrl = process.cwd()
    return tsconfigCache
  }
}

function getSwcOptions(
  filename: string,
  url: string,
  baseUrl: string | null,
  paths: Record<string, string[]> | null
): SwcOptions {
  return {
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
  }
}

export async function resolve(
  specifier: string,
  ctx: ResolveHookContext,
  next: (
    specifier: string,
    ctx: ResolveHookContext
  ) => Promise<ResolveHookResult> | Promise<void> | ResolveHookResult
) {
  const { paths, baseUrl } = await loadTSConfig()
  const resolvedTsConfigPath = await resolveTsConfigPath(
    specifier,
    paths,
    baseUrl
  )

  const cacheKey = ctx?.parentURL ? `${ctx.parentURL}::${specifier}` : null

  if (resolvedTsConfigPath) {
    const url = pathToFileURL(resolvedTsConfigPath).href
    if (cacheKey) {
      resolveCache.set(cacheKey, url)
    }
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

  if (cacheKey) {
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
  }

  const tryFiles = getRelativeTryFiles(ctx?.parentURL, specifier)

  for (const file of tryFiles) {
    if (await existsWithCache(file)) {
      const url = pathToFileURL(file).href
      if (cacheKey) {
        resolveCache.set(cacheKey, url)
      }
      return {
        url,
        format: 'module',
        shortCircuit: true
      }
    }
  }

  if (cacheKey) {
    resolveCache.set(cacheKey, null)
  }

  return next(specifier, ctx)
}

export function resolveSync(
  specifier: string,
  ctx: ResolveHookContext,
  next: (
    specifier: string,
    ctx: ResolveHookContext
  ) => ResolveHookResult
): ResolveHookResult {
  const { paths, baseUrl } = loadTSConfigSync()
  const resolvedTsConfigPath = resolveTsConfigPathSync(
    specifier,
    paths,
    baseUrl
  )

  const cacheKey = ctx?.parentURL ? `${ctx.parentURL}::${specifier}` : null

  if (resolvedTsConfigPath) {
    const url = pathToFileURL(resolvedTsConfigPath).href
    if (cacheKey) {
      resolveCache.set(cacheKey, url)
    }
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

  if (cacheKey) {
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
  }

  const tryFiles = getRelativeTryFiles(ctx?.parentURL, specifier)

  for (const file of tryFiles) {
    if (existsWithCacheSync(file)) {
      const url = pathToFileURL(file).href
      if (cacheKey) {
        resolveCache.set(cacheKey, url)
      }
      return {
        url,
        format: 'module',
        shortCircuit: true
      }
    }
  }

  if (cacheKey) {
    resolveCache.set(cacheKey, null)
  }

  return next(specifier, ctx)
}

export async function load(
  url: string,
  ctx: unknown,
  next: (url: string, ctx: unknown) => Promise<unknown> | unknown
) {
  if (!url.startsWith('file://') || !hasTypeScriptExtension(url)) {
    return next(url, ctx)
  }

  const { paths, baseUrl } = await loadTSConfig()
  const filename = fileURLToPath(url)
  const fileStats = await stat(filename)
  const configHash = getConfigHash(baseUrl, paths)
  const cachedCode = await readCachedTranspile(
    filename,
    fileStats.mtimeMs,
    fileStats.size,
    configHash
  )

  if (cachedCode !== null) {
    return { format: 'module', source: cachedCode, shortCircuit: true }
  }

  const { code } = await transformFile(
    filename,
    getSwcOptions(filename, url, baseUrl, paths)
  )

  await writeCachedTranspile(filename, {
    code,
    mtimeMs: fileStats.mtimeMs,
    size: fileStats.size,
    configHash
  })

  return { format: 'module', source: code, shortCircuit: true }
}

export function loadSync(
  url: string,
  ctx: unknown,
  next: (url: string, ctx: unknown) => unknown
) {
  if (!url.startsWith('file://') || !hasTypeScriptExtension(url)) {
    return next(url, ctx)
  }

  const { paths, baseUrl } = loadTSConfigSync()
  const filename = fileURLToPath(url)
  const fileStats = statSync(filename)
  const configHash = getConfigHash(baseUrl, paths)
  const cachedCode = readCachedTranspileSync(
    filename,
    fileStats.mtimeMs,
    fileStats.size,
    configHash
  )

  if (cachedCode !== null) {
    return { format: 'module', source: cachedCode, shortCircuit: true }
  }

  const { code } = transformFileSync(
    filename,
    getSwcOptions(filename, url, baseUrl, paths)
  )

  writeCachedTranspileSync(filename, {
    code,
    mtimeMs: fileStats.mtimeMs,
    size: fileStats.size,
    configHash
  })

  return { format: 'module', source: code, shortCircuit: true }
}
