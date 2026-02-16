module.exports = {
  root: false,
  extends: ["../../.eslintrc.js"],
  rules: {
    semi: ["error", "always"],
  },
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
