#!/usr/bin/env node

import { program } from 'commander'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fork } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { watch } from 'chokidar'
import type { Stats } from 'node:fs'

import { name, description, version } from './metadata'
import { clearResolveCache, invalidateFileCaches } from './cache'
import { debounce, yellow } from './util'

const DEFAULT_INCLUDE_PATHS = ['.']
const DEFAULT_EXCLUDE_PATHS = ['dist', 'build', 'coverage']
const DEFAULT_WATCH_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'json']
const INTERNAL_IGNORED_PATHS = ['node_modules', '.git']
const WATCH_DEBOUNCE_MS = 100
const CHILD_EXIT_TIMEOUT_MS = 300

const children = new Set<ChildProcess>()

program
  .name(name)
  .description(description)
  .version(version, '-v, --version', 'Output the current version')
  .showSuggestionAfterError()

function cleanup(signal: 'SIGINT' | 'SIGTERM') {
  process.stdout.write(
    `${yellow(`Received ${signal}. Stopping watcher and child processes...`)}\n`
  )

  for (const child of children.values()) {
    try {
      child.kill('SIGTERM')
    } catch {
      //
    }
  }
  process.exit(0)
}

process.on('SIGINT', function () {
  cleanup('SIGINT')
})
process.on('SIGTERM', function () {
  cleanup('SIGTERM')
})

function spawn(entry: string, nodeArgs: string[]) {
  const entryPath = isAbsolute(entry) ? entry : resolve(process.cwd(), entry)

  const child = fork(entryPath, {
    stdio: 'inherit',
    execArgv: [
      '--enable-source-maps',
      '--no-experimental-strip-types',
      '--import',
      pathToFileURL(join(import.meta.dirname, 'register.js')).href,
      ...nodeArgs
    ]
  })

  children.add(child)
  child.once('exit', function () {
    children.delete(child)
  })
}

async function waitForChildExit(child: ChildProcess): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true

  return await new Promise<boolean>(function (resolve) {
    const timeout = setTimeout(function () {
      child.off('exit', handleExit)
      resolve(false)
    }, CHILD_EXIT_TIMEOUT_MS)

    function handleExit() {
      clearTimeout(timeout)
      resolve(true)
    }

    child.once('exit', handleExit)
  })
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

function hasIgnoredSegment(filePath: string, ignoredSegments: Set<string>) {
  let start = 0

  for (let index = 0; index <= filePath.length; index++) {
    if (index !== filePath.length && filePath[index] !== '/') continue

    if (ignoredSegments.has(filePath.slice(start, index))) return true
    start = index + 1
  }

  return false
}

type WatchOptions = {
  include: string[]
  exclude: string[]
  ext: string[]
  sourceRoot: string
}

function createWatchConfig(options: WatchOptions) {
  const includePaths = options.include.map((value) =>
    join(options.sourceRoot, value)
  )

  const excludePaths = options.exclude.map(normalizePath).filter(Boolean)
  const excludedExactPaths = new Set(excludePaths)
  const excludedSegments = new Set(
    excludePaths.filter((value) => !value.includes('/'))
  )
  const excludedPrefixes = excludePaths.map((value) => value + '/')
  const allowedExts = new Set(options.ext.map(normalizeExt).filter(Boolean))
  const internalIgnoredSegments = new Set(INTERNAL_IGNORED_PATHS)

  function toRelativeFromRoot(sourceRoot: string, filePath: string): string {
    const rel = normalizePath(relative(sourceRoot, filePath))
    return rel === '' ? '.' : rel
  }

  function ignored(filePath: string, stats?: Stats) {
    const rel = toRelativeFromRoot(options.sourceRoot, filePath)

    if (rel === '..' || rel.startsWith('../')) return true
    if (rel === '.') return false

    if (hasIgnoredSegment(rel, internalIgnoredSegments)) return true
    if (hasIgnoredSegment(rel, excludedSegments)) return true
    if (excludedExactPaths.has(rel)) return true

    for (const excludedPrefix of excludedPrefixes) {
      if (rel.startsWith(excludedPrefix)) return true
    }

    if (!stats || stats.isDirectory()) return false

    const extension = extname(rel).slice(1).toLowerCase()
    if (allowedExts.size > 0 && !allowedExts.has(extension)) return true

    return false
  }

  return {
    sourceRoot: options.sourceRoot,
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
  const runtimeEntry = isAbsolute(entry) ? entry : resolve(process.cwd(), entry)

  async function restart(reason?: string) {
    process.stdout.write('\x1Bc')

    if (reason) {
      console.log(yellow(reason))
    }

    for (const child of children.values()) {
      try {
        child.kill('SIGTERM')
      } catch {
        continue
      }

      const exited = await waitForChildExit(child)

      if (exited) continue

      console.log(
        yellow(
          `${reason ?? 'Restart requested.'} Process hasn't exited. Killing process...`
        )
      )

      try {
        child.kill('SIGKILL')
      } catch {
        //
      }
    }

    clearResolveCache()
    spawn(runtimeEntry, nodeArgs)
  }

  const restartDebounced = debounce(restart, WATCH_DEBOUNCE_MS)

  process.stdout.write('\x1Bc')
  if (isWatch) {
    console.log(yellow('Watching for changes...'))
  }
  spawn(runtimeEntry, nodeArgs)

  if (!isWatch) return

  const { ignored, paths } = createWatchConfig(options)

  const watcher = watch(paths, {
    atomic: true,
    ignoreInitial: true,
    ignored
  })

  watcher.on('all', async function (eventName, changedPath) {
    if (
      eventName !== 'change' &&
      eventName !== 'add' &&
      eventName !== 'unlink'
    ) {
      return
    }

    await invalidateFileCaches(
      isAbsolute(changedPath) ? changedPath : (
        resolve(process.cwd(), changedPath)
      )
    )

    restartDebounced(`Change detected (${eventName}): ${changedPath}`)
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
