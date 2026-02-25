module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/test/**/*.test.ts"],
  verbose: true,
  setupFiles: ["<rootDir>/src/test/loadEnv.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  maxWorkers: 1,
  // Optional but helpful if you use ESModule stuff later
  // globals: { "ts-jest": { tsconfig: "tsconfig.json" } },
};
