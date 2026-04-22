<h1 align="center">
<br>
<img alt="tsnite" src="https://github.com/luas10c/tsnite/blob/main/tsnite.png?raw=true">
<br><br>
<a href="https://npm.im/tsnite"><img src="https://badgen.net/npm/v/tsnite"></a>
<a href="https://npm.im/tsnite"><img src="https://badgen.net/npm/dm/tsnite"></a>
<a href="https://npm.im/tsnite"><img src="https://img.shields.io/badge/ESLint-3A33D1?logo=eslint" alt="eslint"></a>
<a href="https://npm.im/tsnite"><img src="https://img.shields.io/badge/Prettier-21323b?logo=prettier&logoColor=ffffff" alt="prettier"></a>
<a href="https://npm.im/tsnite"><img src="https://img.shields.io/github/license/luas10c/tsnite" alt="github license"></a>
</h1>

<p align="center">
TypeScript at full throttle—fast, safe, unstoppable. 🚀
<br><br>
<a href="https://github.com/luas10c/tsnite">Documentation</a>&nbsp;&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;&nbsp;<a href="https://github.com/luas10c/tsnite">Getting started →</a>
</p>

## Install

```bash
npm install --save-dev tsnite
```

## Features

- ESM-friendly runtime
- Watch mode with automatic restart
- Supports `compilerOptions.paths`
- Resolves extensionless TypeScript imports
- Decorator support

## Quick Start

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

## Support

Enjoying this tool? Consider supporting the project.

<p>
  <a href="https://buymeacoffee.com/luas10c" target="_blank" rel="noopener noreferrer"><img src="https://github.com/luas10c/tsnite/blob/main/buymeacoffe.png?raw=true" alt="Buy me a coffee" width="180" /></a>
</p>

## License

[MIT](LICENSE)
