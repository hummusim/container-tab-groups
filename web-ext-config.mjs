/**
 * web-ext configuration.
 * https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
 */
export default {
  // Files NOT shipped inside the .zip artifact.
  ignoreFiles: [
    "package.json",
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
  ],
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ["about:debugging#/runtime/this-firefox"],
  },
};
