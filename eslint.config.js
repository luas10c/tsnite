import { defineConfig, globalIgnores } from 'eslint/config'

import globals from 'globals'

import js from '@eslint/js'

import ts from 'typescript-eslint'

import prettier from 'eslint-plugin-prettier'

import jest from 'eslint-plugin-jest'

export default defineConfig([
  globalIgnores(['node_modules', 'coverage', 'dist']),
  js.configs.recommended,
  ts.configs.recommended,
  {
    name: 'prettier/recommended',
    plugins: {
      prettier
    },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.node,
        ...globals.es2024
      },
      sourceType: 'module'
    },
    rules: {
      ...prettier.configs.recommended.rules
    }
  },
  {
    name: 'jest/recommended',
    files: ['**/*.{test,spec}.ts'],
    plugins: {
      jest
    },
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.jest
      },
      sourceType: 'module'
    },
    rules: {
      ...jest.configs.recommended.rules
    }
  }
])
