/**
 * web-ext configuration.
 * https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
 */
export default {
  // Files NOT shipped inside the .zip artifact.
  ignoreFiles: [
    "package.json",
    "*.test.mjs",
    "package-lock.json",
    "web-ext-config.mjs",
    "eslint.config.js",
    ".prettierrc",
    ".prettierignore",
    ".editorconfig",
    ".gitignore",
    ".github",
    "node_modules",
    "web-ext-artifacts",
    "CHANGELOG.md",
    // Local secrets - MUST never end up in the signed package.
    ".env",
    ".env.*",
    ".env.example",
  ],
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ["about:debugging#/runtime/this-firefox"],
  },
};
