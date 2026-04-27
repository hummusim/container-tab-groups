import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        browser: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "warn",
    },
  },
  {
    ignores: ["node_modules/**", "web-ext-artifacts/**"],
  },
];
