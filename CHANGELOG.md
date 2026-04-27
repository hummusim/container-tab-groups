# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
