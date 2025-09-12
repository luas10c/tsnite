import { transformFile } from '@swc/core'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFile, access, constants } from 'node:fs/promises'
import json5 from 'json5'
import path from 'node:path'

async function exists(path: string) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
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
    if (await exists(file)) {
      return {
        url: pathToFileURL(file).href,
        format: 'module',
        shortCircuit: true
      }
    }
  }
}

async function loadTsconfigPaths(): Promise<
  | {
      [from: string]: string[]
    }
  | undefined
> {
  try {
    const data = await readFile(
      path.join(process.cwd(), 'tsconfig.json'),
      'utf-8'
    )
    const {
      compilerOptions: { paths }
    } = json5.parse(data)
    return paths
  } catch {
    return {}
  }
}

export async function load(
  url: string,
  ctx: unknown,
  next: (url: string, ctx: unknown) => void
) {
  if (!url.startsWith('file://') || !url.endsWith('.ts')) {
    return next(url, ctx)
  }

  const paths = await loadTsconfigPaths()

  const filename = fileURLToPath(url)
  const { code } = await transformFile(filename, {
    filename,
    jsc: {
      baseUrl: process.cwd(),
      parser: {
        syntax: 'typescript',
        tsx: false,
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
      paths
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
