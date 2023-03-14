module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
  ],
  ignorePatterns: [
    "*.d.ts",
    "bin",
    "dist",
    "lib",
    "node_modules",
    "package-inherit-cli.js",
    "package.*",
    ".eslintrc.js",
  ],
};
