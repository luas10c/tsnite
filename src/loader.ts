import { transformFile } from '@swc/core'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import json5 from 'json5'
import path from 'node:path'

import { resolveCache, existsWithCache } from './cache'

const tsconfigCache: {
  paths: Record<string, string[]> | null
  baseUrl: string | null
} = { paths: null, baseUrl: null }

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
    const {
      compilerOptions: { paths, baseUrl }
    } = json5.parse(data)
    tsconfigCache.paths = paths || null
    tsconfigCache.baseUrl = baseUrl || process.cwd()
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
  if (cached) {
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
    basePath + '.js',
    basePath + '.mjs',
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs')
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

  return next(specifier, ctx)
}

export async function load(
  url: string,
  ctx: unknown,
  next: (url: string, ctx: unknown) => void
) {
  if (!url.startsWith('file://') || !url.endsWith('.ts')) {
    return next(url, ctx)
  }

  const { paths, baseUrl } = await loadTSConfig()

  const filename = fileURLToPath(url)
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

  return { format: 'module', source: code, shortCircuit: true }
}
