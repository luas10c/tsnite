import { registerHooks, register } from 'node:module'


if (typeof registerHooks === 'function') {
  registerHooks({
    resolve(specifier, context, next) {
      return next(specifier, context)
    }
  })
} else if (typeof register === 'function') {
  register(new URL('./loader.js', import.meta.url))
} else {
  throw new Error('Unsupported Node.js version: module hooks are not available!')
}

