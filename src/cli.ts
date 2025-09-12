#!/usr/bin/env node

import { program } from 'commander'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fork } from 'node:child_process'
import { watch } from 'chokidar'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.dirname)

const { name, description, version } = require(
  join(import.meta.dirname, '..', 'package.json')
)

const pids = new Set<number>()

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

async function handler(): Promise<void> {
  const options = program.opts<Args>()

  const [entry, nodeArgs] = program.processedArgs as [string, string[]]

  process.stdout.write('\x1Bc')

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

  if (!options.watch) return

  const watcher = watch('.', {
    atomic: true,
    ignoreInitial: true,
    ignored: [/.+\.(?:test|spec)\.ts$/i]
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
  })
}

program.action(handler)
program.parse(process.argv)
