#!/usr/bin/env node

import { program } from 'commander'
import { extname, join, resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fork } from 'node:child_process'
import { watch } from 'chokidar'
import type { Stats } from 'node:fs'

import { name, description, version } from './metadata'

const DEFAULT_INCLUDE_PATHS = ['.']
const DEFAULT_EXCLUDE_PATHS = ['dist', 'build', 'coverage']
const DEFAULT_WATCH_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'json']
const INTERNAL_IGNORED_PATHS = ['node_modules', '.git']

const pids = new Set<number>()

program
  .name(name)
  .description(description)
  .version(version, '-v, --version', 'Output the current version')
  .showSuggestionAfterError()

function cleanup() {
  for (const pid of pids.values()) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      //
    }
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

function spawn(entry: string, nodeArgs: string[]) {
  const { pid } = fork(join(process.cwd(), entry), {
    stdio: 'inherit',
    execArgv: [
      '--enable-source-maps',
      '--no-experimental-strip-types',
      '--import',
      pathToFileURL(join(import.meta.dirname, 'register.js')).href,
      ...nodeArgs
    ]
  })

  pids.add(pid as number)
}

function normalizePath(value: string) {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '')
}

function normalizeExt(value: string) {
  return value.trim().replace(/^\./, '').toLowerCase()
}

type WatchOptions = {
  include: string[]
  exclude: string[]
  ext: string[]
  sourceRoot: string
}

function createWatchConfig(options: WatchOptions) {
  const sourceRoot = resolve(process.cwd(), options.sourceRoot)

  const includePaths = options.include.map((value) =>
    resolve(sourceRoot, value)
  )

  const excludePaths = options.exclude.map(normalizePath).filter(Boolean)

  const excludeSet = new Set(excludePaths)

  const allowedExts = new Set(options.ext.map(normalizeExt).filter(Boolean))

  function ignored(filePath: string, stats?: Stats) {
    const rel = normalizePath(relative(sourceRoot, filePath))

    // fora do sourceRoot
    if (rel.startsWith('../')) {
      return true
    }

    // raiz do sourceRoot
    if (rel === '') {
      return false
    }

    const segments = rel.split('/')

    // ignora por nome de pasta/arquivo em qualquer nível
    if (segments.some((segment) => excludeSet.has(segment))) {
      return true
    }

    // ignora por caminho relativo completo
    if (
      excludePaths.some(
        (excluded) => rel === excluded || rel.startsWith(excluded + '/')
      )
    ) {
      return true
    }

    // nunca filtra diretório por extensão
    if (stats?.isDirectory()) {
      return false
    }

    const extension = extname(rel).slice(1).toLowerCase()

    // se tiver lista de extensões, ignora arquivo fora dela
    if (allowedExts.size > 0 && !allowedExts.has(extension)) {
      return true
    }

    return false
  }

  return {
    sourceRoot,
    paths: includePaths,
    ignored
  }
}

async function handler(
  entry: string,
  options: WatchOptions,
  nodeArgs: string[],
  isWatch: boolean
): Promise<void> {
  process.stdout.write('\x1Bc')
  spawn(entry, nodeArgs)

  if (!isWatch) return

  const { ignored, paths } = createWatchConfig(options)

  const watcher = watch(paths, {
    atomic: true,
    ignoreInitial: true,
    ignored
  })

  watcher.on('change', async function () {
    process.stdout.write('\x1Bc')

    for (const pid of pids.values()) {
      try {
        process.kill(pid)
      } catch {
        //
      }
    }

    spawn(entry, nodeArgs)
  })
}

function parseCsv(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

program
  .argument('<string>', 'Entrypoint file')
  .argument(
    '[nodeArgs...]',
    'Specify the Node.js command and any additional arguments'
  )
  .action(async function (
    entry: string,
    nodeArgs: string[],
    options: WatchOptions
  ) {
    await handler(entry, options, nodeArgs, false)
  })

program
  .command('watch')
  .option(
    '--include <string>',
    'Paths to be watched',
    parseCsv,
    DEFAULT_INCLUDE_PATHS
  )
  .option('--exclude <string>', 'Paths to be ignored by watched', parseCsv, [
    ...INTERNAL_IGNORED_PATHS,
    ...DEFAULT_EXCLUDE_PATHS
  ])
  .option(
    '--ext <string>',
    'Extensions to be watched',
    parseCsv,
    DEFAULT_WATCH_EXTENSIONS
  )
  .option('--source-root <string>', 'Source root to be watched', '.')
  .argument('<string>', 'Entrypoint file')
  .argument(
    '[nodeArgs...]',
    'Specify the Node.js command and any additional arguments'
  )
  .action(async function (
    entry: string,
    nodeArgs: string[],
    options: WatchOptions
  ) {
    await handler(entry, options, nodeArgs, true)
  })

await program.parseAsync(process.argv).catch(function (err) {
  console.error(err)
  process.exit(1)
})
