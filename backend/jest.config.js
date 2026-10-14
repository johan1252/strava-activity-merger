module.exports = {
  testEnvironment: 'node',
  // Prefer .ts over compiled .js sitting next to it (tsc emits in place)
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
