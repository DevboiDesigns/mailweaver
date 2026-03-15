module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts", // Re-exports only
    "!src/validation/index.ts", // Re-exports only
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 85,
      statements: 85,
    },
  },
};