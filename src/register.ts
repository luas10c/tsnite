import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as moduleApi from 'node:module'

import { resolveSync, loadSync } from './loader.js'

const { register, registerHooks } = moduleApi as unknown as {
  register?: (
    specifier: string | URL,
    parentURL?: string | URL,
    options?: unknown
  ) => void
  registerHooks?: (hooks: {
    resolve?: typeof resolveSync
    load?: typeof loadSync
  }) => unknown
}

if (typeof registerHooks === 'function') {
  registerHooks({
    resolve: resolveSync,
    load: loadSync
  })
} else if (typeof register === 'function') {
  const currentDir =
    import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
  const loaderUrl = pathToFileURL(join(currentDir, 'loader.js')).href

  register(loaderUrl)
} else {
  throw new Error('Unsupported Node.js version: module hooks are not available!')
}
