import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.dirname)

export const { name, description, version } = require(
  join(import.meta.dirname, '..', 'package.json')
)
