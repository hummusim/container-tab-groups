# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Validate container/group associations against the actual tabs instead of trusting
  cached group IDs or group titles. Stale mappings and identical container names
  no longer merge different containers; regrouping also separates mixed groups.

## [1.1.0] - 2026-04-27

### Added

- Toolbar **player popup**: clicking the extension icon opens a panel
  listing the tabs currently producing audio, with per-row mute/unmute
  toggle (rendered as ⏸/▶) and "switch to tab" control. Container badges
  match the Multi-Account Containers color of each row. Includes the
  existing "Re-group all tabs" action.
  - Mute/unmute is used instead of true `pause()`/`play()` because
    Firefox's autoplay policy rejects programmatic `play()` calls
    originating in extension popups (the user-gesture chain is not
    transferred to the target tab). For a true video pause, switch to
    the tab and press space.
- Audible indicator: appends a " ♪" suffix to the title of any tab group
  that contains a tab currently playing audio. Toggle in the options page.
- Keyboard shortcut `Ctrl+Shift+.` (`Cmd+Shift+.` on macOS) that toggles
  mute on the audible tab. Falls back to the active tab when nothing is
  currently producing sound. Reassign at `about:addons` -> gear ->
  Manage Extension Shortcuts.

### Notes on permissions

- The toolbar player and keyboard shortcut are intentionally implemented
  via mute/unmute (the `tabs` API) instead of `HTMLMediaElement.play()` /
  `pause()`. That keeps the permission surface minimal: no `scripting`
  permission, no host access of any kind. The trade-off is that "pausing"
  via the popup actually mutes the tab; the underlying media keeps
  decoding silently. To truly pause the video, switch to the tab and
  press space.

### Changed

- Toolbar icon click no longer immediately re-groups; it opens the popup.
  The same action is available as a button at the bottom of the popup.

## [1.0.1] - 2026-04-27

### Changed

- Bump `strict_min_version` to 140 so the `data_collection_permissions`
  manifest key validates cleanly on AMO.
- Switch icons from SVG to PNG (48 and 128) for AMO compatibility.

### Fixed

- Exclude `.env` and related dotfiles from the packaged artifact so
  signing credentials never end up inside the .zip.

## [1.0.0] - 2026-04-27

### Added

- Auto-group tabs by Multi-Account Container on startup, install, and toolbar click.
- Persistent container -> group mapping in `storage.local`.
- Live tab handling via `tabs.onCreated`, `tabs.onAttached`, and `tabs.onUpdated`.
- Auto-collapse inactive container groups when a tab is activated.
- Group title/color sync with `contextualIdentities.onUpdated`.
- Cleanup on container removal (`contextualIdentities.onRemoved`) and group removal (`tabGroups.onRemoved`).
- Options page with manual re-group, cache reset, and auto-collapse toggle.
- Mutex-based serialization of all mutating operations to prevent races.
