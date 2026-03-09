module.exports = {
  root: false,
  extends: ["../../.eslintrc.js"],
  rules: {
    semi: ["error", "always"],
    "object-curly-spacing": ["warn", "always"],
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
