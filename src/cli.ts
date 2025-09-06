#!/usr/bin/env node

import { program } from 'commander'
import { join } from 'node:path'
import { readdir, stat, rm, mkdir, cp, symlink } from 'node:fs/promises'
import { fork } from 'node:child_process'
import { watch } from 'chokidar'
import { EventEmitter } from 'node:events'

import { name, description, version, outDir } from './common/constants'

import { compile } from './builders/swc'

import { gradient } from './utils/gradient'

program
  .name(name)
  .description(description)
  .version(version, '-v, --version', 'Output the current version')
  .option('--source-root <string>', 'Source Root', '.')
  .option('--watch', 'Enables watch mode', false)
  .option('--include-assets', 'Include static files in the build', false)
  .argument('<string>', 'Entrypoint file')
  .argument(
    '[args...]',
    'Specify the Node.js command and any additional arguments'
  )
  .showSuggestionAfterError()

type Args = {
  watch?: boolean
  includeAssets?: boolean
  sourceRoot: string
}

const events = new EventEmitter()

const pids = new Set<number>()
let starts: number = 0

export async function* discover(path: string): AsyncGenerator<string> {
  const entries = await readdir(path)

  const ignores =
    /^(?:node_modules|dist|coverage|tests|\..+|.*\.(?:spec|test)\.ts)$/
  for (const entry of entries) {
    if (ignores.test(entry)) continue

    const stats = await stat(join(path, entry))
    if (stats.isDirectory()) {
      yield* discover(join(path, entry))
      continue
    }

    yield join(path, entry)
  }
}

async function handler(): Promise<void> {
  const options = program.opts<Args>()

  const [entry, nodeArgs] = program.processedArgs as [string, string[]]

  try {
    await rm(outDir, {
      force: true,
      recursive: true
    })
    await mkdir(outDir, { recursive: true })

    await symlink(
      join(process.cwd(), 'node_modules'),
      join(outDir, 'node_modules'),
      'junction'
    )

    starts = performance.now()

    for await (const filename of discover(options.sourceRoot)) {
      if (filename.endsWith('.ts')) {
        await compile(join(process.cwd(), filename), options.sourceRoot)
        continue
      }

      if (options.includeAssets) {
        await cp(
          join(process.cwd(), filename),
          join(
            outDir,
            join(filename.replace(`${join(options.sourceRoot)}/`, ''))
          ),
          {
            force: true,
            recursive: true
          }
        )
      }
    }

    const ends = performance.now()

    const entrypoint = entry
      .replace(join(options.sourceRoot, '/'), '')
      .replace(/(.+).ts$/, '$1.js')
    const { pid } = fork(join(outDir, entrypoint), {
      execArgv: ['--enable-source-maps', ...nodeArgs],
      stdio: 'inherit'
    })

    pids.add(pid as number)

    process.stdout.write(
      `\x1b[1m${gradient(['#5e23e6', '#f88bc7'])(
        `➤ Compiled successfully in ${(ends - starts).toFixed(2)}ms`
      )}\x1b[0m\n`
    )
  } catch (err) {
    process.stdout.write(
      `\x1b${gradient(['#cf4444', '#9b1e1e'])(`❌ Failed to compile!\n`)}\x1b[0m\n${err}`
    )
  }

  if (options.watch) {
    const watcher = watch(join(process.cwd(), options.sourceRoot), {
      atomic: true,
      ignoreInitial: true,
      ignored: [/.+\.(?:test|spec)\.ts$/i]
    })

    watcher.on('change', async function (path) {
      process.stdout.write('\x1Bc')
      starts = performance.now()
      try {
        if (!path.endsWith('.ts') && options.includeAssets) {
          await cp(
            path,
            join(
              outDir,
              path.replace(join(process.cwd(), options.sourceRoot, '/'), '')
            ),
            { force: true, recursive: true }
          )
          return
        }

        await compile(path, options.sourceRoot)
        events.emit('ready')
      } catch (err) {
        process.stdout.write(
          `\x1b${gradient(['#cf4444', '#9b1e1e'])(`❌ Failed to compile!\n`)}\x1b[0m\n${err}`
        )
      }
    })

    watcher.on('add', async function (path) {
      process.stdout.write('\x1Bc')
      starts = performance.now()
      try {
        if (!path.endsWith('.ts') && options.includeAssets) {
          await cp(
            path,
            join(
              outDir,
              path.replace(join(process.cwd(), options.sourceRoot, '/'), '')
            ),
            { force: true, recursive: true }
          )
          return
        }

        await compile(path, options.sourceRoot)
        events.emit('ready')
      } catch (err) {
        process.stdout.write(
          `\x1b${gradient(['#cf4444', '#9b1e1e'])(`❌ Failed to compile!\n`)}\x1b[0m\n${err}`
        )
      }
    })

    watcher.on('unlink', async function (path) {
      process.stdout.write('\x1Bc')
      starts = performance.now()
      try {
        await rm(
          join(
            outDir,
            path.replace(join(process.cwd(), options.sourceRoot, '/'), '')
          ),
          {
            force: true,
            recursive: true
          }
        )

        events.emit('ready')
      } catch (err) {
        console.error(err)
      }
    })

    events.on('ready', async function () {
      try {
        for (const pid of pids.values()) {
          try {
            process.kill(pid)
            pids.delete(pid)
          } catch {
            pids.delete(pid)
          }
        }

        const ends = performance.now()

        const entrypoint = entry
          .replace(join(options.sourceRoot, '/'), '')
          .replace(/(.+).ts$/, '$1.js')
        const { pid } = fork(join(outDir, entrypoint), {
          execArgv: ['--enable-source-maps', ...nodeArgs],
          stdio: 'inherit'
        })

        pids.add(pid as number)

        process.stdout.write(
          `\x1b[1m${gradient(['#5e23e6', '#f88bc7'])(
            `› Compiled successfully in ${(ends - starts).toFixed(2)}ms`
          )}\x1b[0m\n`
        )
      } catch (err) {
        console.error(err)
      }
    })
  }
}

program.action(handler)
program.parse(process.argv)
