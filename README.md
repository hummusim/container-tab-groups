# Container Tab Groups

> Treat every Firefox **Multi-Account Container** as a profile by automatically
> placing its tabs inside a native **tab group** with the container's name and
> color.

[![CI](https://github.com/hummusim/container-tab-groups/actions/workflows/ci.yml/badge.svg)](https://github.com/hummusim/container-tab-groups/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Firefox 140+](https://img.shields.io/badge/Firefox-140%2B-orange.svg)](https://www.mozilla.org/firefox/)

## Features

- Auto-groups every non-pinned tab into a tab group named after its container.
- Reuses the container's color (mapped to the closest `tabGroups` palette color).
- Auto-collapses inactive container groups when you switch tabs, so only the
  "profile" you're using stays expanded. Toggle in the options page.
- Reacts to live changes: tabs created, attached to another window, or moved
  to a different container; containers renamed, recolored, or deleted; tab
  groups deleted manually.
- Persistent container -> group mapping in `storage.local`, so a background
  script restart doesn't fragment groups.
- Single mutex serializes all mutating operations to avoid races.

## Requirements

- Firefox **140+**. The WebExtensions `tabGroups` and `tabs.group()` APIs
  shipped in 139, but Firefox 140 introduced
  `browser_specific_settings.gecko.data_collection_permissions`, which AMO
  now requires for new submissions.
- Multi-Account Containers feature enabled. Mozilla's _Firefox Multi-Account
  Containers_ extension makes managing containers easier, but isn't strictly
  required - any `contextualIdentities` entry works.

## Install (temporary, for development)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file at the project root.
4. Click the toolbar icon to trigger the first regrouping pass, or restart
   Firefox.

For permanent installation you'll need to package and sign the extension via
[addons.mozilla.org](https://addons.mozilla.org/) (`web-ext sign`).

## Development

```bash
npm install
npm run start         # launch a Firefox dev profile with the extension loaded
npm run lint          # web-ext lint + eslint
npm run format        # prettier --write .
npm run build         # produces a .zip in web-ext-artifacts/
```

CI runs `format:check`, `lint`, and `build` on every push and pull request.

### Project layout

```
.
├── background.js        # All grouping logic and event listeners.
├── manifest.json        # WebExtension manifest (MV3, Gecko-only).
├── options.html         # Options panel markup.
├── options.js           # Options panel logic + settings persistence.
├── icons/               # Toolbar / extension SVG icons.
├── web-ext-config.mjs   # web-ext build/run config.
├── eslint.config.js     # ESLint v9 flat config (browser + webextensions).
└── .github/workflows/   # CI pipeline.
```

## Color mapping

Firefox container colors are mapped to `tabGroups` colors as follows:

| Container | Tab group |
| --------- | --------- |
| blue      | blue      |
| turquoise | cyan      |
| green     | green     |
| yellow    | yellow    |
| orange    | orange    |
| red       | red       |
| pink      | pink      |
| purple    | purple    |
| toolbar   | grey      |

## Limitations / known caveats

- Pinned tabs are skipped because Firefox doesn't allow pinned tabs inside
  tab groups.
- "Default" (containerless) tabs are not grouped on purpose - they don't
  belong to a profile.
- Tab groups are per-window. If you move a tab to another window, the
  extension creates / reuses the group there on the next pass.
- This extension only does **container -> group**. If you want the inverse
  ("create a container from a tab group I just made"), see
  [container-tab-groups-sync](https://github.com/SerafimDietrich/container-tab-groups-sync).

## License

[MIT](LICENSE)
