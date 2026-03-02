/** @type{import('jest').Config} */
const config = {
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
