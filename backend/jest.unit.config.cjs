module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/test/**/*.unit.test.ts"],
  verbose: true,
  setupFiles: ["<rootDir>/src/test/loadEnv.ts"],
  maxWorkers: 1,
};
