module.exports = {
  root: false,
  extends: ["../../.eslintrc.js"],
  ignorePatterns: ["dist/**"],
  overrides: [
    {
      files: ["**/*.test.ts"],
      env: {
        mocha: true,
      },
    },
  ],
};
