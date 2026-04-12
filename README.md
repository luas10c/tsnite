# tsnite

[![npm version](https://img.shields.io/npm/v/tsnite.svg)](https://www.npmjs.com/package/tsnite)
[![Eslint](https://img.shields.io/badge/ESLint-3A33D1?logo=eslint)](https://img.shields.io/badge/ESLint-3A33D1?logo=eslint)
[![prettier](https://img.shields.io/badge/Prettier-de9954?logo=prettier&logoColor=ffffff)](https://img.shields.io/badge/Prettier-de9954?logo=prettier&logoColor=ffffff)
[![github license](https://img.shields.io/github/license/luas10c/tsnite)](https://img.shields.io/github/license/luas10c/tsnite)

TypeScript runner for Node.js with watch mode, `tsconfig` path alias support, and extensionless TypeScript import resolution.

## Install

```bash
npm install --save-dev tsnite
```

## Usage

Run a TypeScript entry file:

```bash
npx tsnite src/index.ts
```

Run in watch mode:

```bash
npx tsnite watch src/index.ts
```

Pass extra Node.js arguments after the entry file:

```bash
npx tsnite src/index.ts --env-file=.env
```

Use in `package.json`:

```json
{
  "scripts": {
    "dev": "tsnite src/index.ts",
    "dev:watch": "tsnite watch src/index.ts"
  }
}
```

## Features

- Run `.ts`, `.tsx`, `.mts`, and `.cts` files directly in Node.js
- Watch mode with automatic restart
- Reads the current project's `tsconfig.json`
- Resolves `compilerOptions.paths`
- Resolves extensionless TypeScript imports
- ESM-friendly runtime
- Decorator support in transpilation

## Import Resolution

`tsnite` resolves TypeScript files without requiring explicit extensions.

These imports work:

```ts
import './server'
import './components/App'
```

It will try these TypeScript candidates:

- `./server.ts`
- `./server.tsx`
- `./server.mts`
- `./server.cts`
- `./server/index.ts`
- `./server/index.tsx`
- `./server/index.mts`
- `./server/index.cts`

Explicit JavaScript imports such as `.js`, `.mjs`, and `.cjs` are delegated to Node.js.

## `tsconfig` Paths

`tsnite` supports `compilerOptions.paths` aliases.

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "#/*": ["src/*"]
    }
  }
}
```

Then this works without an extension:

```ts
import { getMetadata } from '#/common/metadata'
```

If `baseUrl` is not defined, `tsnite` uses the project root by default.

## Watch Mode

Customize watched paths and extensions:

```bash
npx tsnite watch --include src --exclude dist,coverage,uploads --ext ts,tsx,js,jsx,json src/index.ts
```

Options:

- `--include <paths>` comma-separated paths to watch
- `--exclude <paths>` comma-separated paths to ignore
- `--ext <extensions>` comma-separated file extensions to watch
- `--source-root <path>` base path used by the watcher

Defaults:

- include: `.`
- exclude: `node_modules,.git,dist,build,coverage`
- ext: `ts,tsx,js,jsx,json`
- source root: `.`

## Example

`tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "es2022",
    "moduleResolution": "bundler",
    "baseUrl": ".",
    "paths": {
      "#/*": ["src/*"]
    }
  }
}
```

`src/index.ts`

```ts
import { startServer } from '#/server/start'

await startServer()
```

Run it:

```bash
npx tsnite src/index.ts
```

## Notes

- `tsnite` is focused on development-time execution
- the current project's `tsconfig.json` is used
- watch mode clears cached resolution and transpilation state before restart

## Links

- npm: <https://www.npmjs.com/package/tsnite>
- repository: <https://github.com/luas10c/tsnite>
