import { defineConfig, globalIgnores } from 'eslint/config'

import js from '@eslint/js'

import ts from 'typescript-eslint'

import prettier from 'eslint-plugin-prettier'

import jest from 'eslint-plugin-jest'

export default defineConfig([
  globalIgnores(['node_modules', 'dist', 'coverage']),
  js.configs.recommended,
  ts.configs.recommended,
  {
    plugins: {
      prettier
    },
    rules: {
      ...prettier.configs.recommended.rules
    }
  },
  {
    files: ['**/*.{test,spec}.ts'],
    plugins: {
      jest
    },
    rules: {
      ...jest.configs['flat/recommended']
    }
  }
])
