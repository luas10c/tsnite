import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.dirname)

export const { name, description, version } = require(
  join(import.meta.dirname, '..', '..', 'package.json')
)

export const outDir = join(tmpdir(), name)
