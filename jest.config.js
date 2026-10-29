module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  cacheDirectory: "<rootDir>/node_modules/.cache/jest",
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
};
