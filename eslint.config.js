import { defineConfig, globalIgnores } from 'eslint/config'

import globals from 'globals'

import js from '@eslint/js'

import ts from 'typescript-eslint'


import jest from 'eslint-plugin-jest'

export default defineConfig([
  globalIgnores(['node_modules', 'coverage', 'dist']),
  js.configs.recommended,
  ts.configs.recommended,
  {
    name: 'stylistic/recommended',
    plugins: {
      '@stylistic': stylistic
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
            '@stylistic/quotes': ['error', 'single', {
        avoidEscape: true
      }],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/comma-dangle': ['error', 'never'],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/quote-props': ['error', 'consistent'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@stylistic/jsx-quotes': ['error', 'prefer-double'],
      '@stylistic/jsx-curly-brace-presence': ['error', {
        props: 'never',
        children: 'never'
      }],
      '@stylistic/jsx-first-prop-new-line': ['error', 'multiline'],
      '@stylistic/jsx-max-props-per-line': ['error', {
        maximum: 1,
        when: 'multiline'
      }],
      '@stylistic/indent': ['error', 2, {
        SwitchCase: 1
      }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/eol-last': ['error', 'always'],
      '@stylistic/linebreak-style': ['error', 'unix']
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
