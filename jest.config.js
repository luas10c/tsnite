import { defineConfig } from 'jest'

export default defineConfig({
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/cli.ts',
    '!<rootDir>/src/register.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: '<rootDir>/tests/environment.ts',
  moduleNameMapper: {
    '^#/(.+)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  }
})
