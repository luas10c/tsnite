/** @type{import('jest').Config} */
const config = {
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: '<rootDir>/tests/environment.ts',
  moduleNameMapper: {
    '^#/(.+)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  }
}

export default config
