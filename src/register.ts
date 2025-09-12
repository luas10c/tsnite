import { join } from 'node:path'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register(pathToFileURL(join(import.meta.dirname, 'loader.js')).href)
