import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    // ESM config files in this repo (eslint.config.js, web-ext-config.mjs).
    files: ["eslint.config.js", "*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Extension code: classic background script + options page script + popup.
    files: ["background.js", "options.js", "popup.js"],
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
