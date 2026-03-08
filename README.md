# tsnite

[![npm version](https://img.shields.io/npm/v/tsnite.svg)](https://www.npmjs.com/package/tsnite)
[![Eslint](https://img.shields.io/badge/ESLint-3A33D1?logo=eslint)](https://img.shields.io/badge/ESLint-3A33D1?logo=eslint)
[![prettier](https://img.shields.io/badge/Prettier-de9954?logo=prettier&logoColor=ffffff)](https://img.shields.io/badge/Prettier-de9954?logo=prettier&logoColor=ffffff)
[![github license](https://img.shields.io/github/license/luas10c/tsnite)](https://img.shields.io/github/license/luas10c/tsnite)

```
TypeScript at full throttle—fast, safe, unstoppable. 🚀
```

`tsnite` is a tool that accelerates TypeScript project development, offering a streamlined build and run experience. Ideal for developers seeking productivity without compromising security and performance.

### 🚀 Installation

To add `tsnite` to your project as a development dependency, run:

```bash
npm install tsnite -D
```

Or, if you're using Yarn:

```bash
yarn add --dev tsnite
```

### ⚡ Features

- **Decorators** first-class support for TypeScript decorators.
- **Simple integration** with existing projects.
- **ESM Support** native support for modern JavaScript modules.
- **Automatic `tsconfig.json` loading** – respects your project configuration.

### 🛠️ How to use

With `tsnite` installed, you can use it directly in your terminal to run TypeScript files without needing to compile them first.

### Run a TypeScript file

```bash
npx tsnite path/to/file.ts
```

This will execute the specified TypeScript file, allowing you to quickly test and run scripts during development.

## 💡 Tips & Best Practices

- **Use with `package.json` scripts** – integrate `tsnite` into `npm` or `yarn` scripts for a smoother workflow.
  Example:
  ```json
  {
    "scripts": {
      //...
      "dev": "tsnite watch --include src --exclude uploads --ext js,ts,json src/index.ts"
    }
  }
  ```

## 📚 More information

Check the official npm page for details, examples, and updates:
[https://www.npmjs.com/package/tsnite](https://www.npmjs.com/package/tsnite)

#

Enjoy developing TypeScript at full throttle!
