/*
 * Container Tab Groups
 * --------------------
 * Groups tabs by their Multi-Account Container (cookieStoreId), so each
 * container behaves like a "profile" with its own tab group, color, and label.
 *
 * Strategy:
 *   - On startup / install / toolbar click: scan all windows, bucket tabs
 *     by cookieStoreId, and call browser.tabs.group() per bucket.
 *   - On tab created or updated (cookieStoreId change): move the tab into
 *     the group that matches its container.
 *   - Group <-> container association is persisted in storage.local so we
 *     don't fragment groups when the background script restarts.
 */

"use strict";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[container-tab-groups]";
const log = {
  info: (...args) => console.log(LOG_PREFIX, ...args),
  warn: (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args),
};

const DEFAULT_COOKIE_STORE_ID = "firefox-default";
const STORAGE_KEY = "containerGroupMap"; // { [windowId::cookieStoreId]: groupId }
const SETTINGS_KEY = "settings";
const NEW_TAB_DEBOUNCE_MS = 250;
const TAB_GROUP_ID_NONE = -1;

const DEFAULT_SETTINGS = {
  autoCollapseInactiveGroups: true,
};

// ---------------------------------------------------------------------------
// Mutex (serialized async queue)
// ---------------------------------------------------------------------------
//
// All public entry points push their work onto a single chain so that
// concurrent events (onCreated + onAttached + manual regroup) can't race
// each other and create duplicate groups or leave tabs orphaned.

let opChain = Promise.resolve();

function withLock(label, fn) {
  const next = opChain.then(async () => {
    try {
      return await fn();
    } catch (e) {
      log.error(`${label} failed:`, e);
    }
  });
  // Swallow errors on the chain so one failure doesn't poison the queue.
  opChain = next.catch(() => {});
  return next;
}

// Map Firefox container colors -> tabGroups API colors.
// tabGroups colors: "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"
const CONTAINER_COLOR_MAP = {
  blue: "blue",
  turquoise: "cyan",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
  pink: "pink",
  purple: "purple",
  toolbar: "grey",
};

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function loadGroupMap() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || {};
}

async function saveGroupMap(map) {
  await browser.storage.local.set({ [STORAGE_KEY]: map });
}

function mapKey(windowId, cookieStoreId) {
  return `${windowId}::${cookieStoreId}`;
}

async function loadSettings() {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

// ---------------------------------------------------------------------------
// Container helpers
// ---------------------------------------------------------------------------

async function getContainerIdentity(cookieStoreId) {
  if (!cookieStoreId || cookieStoreId === DEFAULT_COOKIE_STORE_ID) {
    return null;
  }
  try {
    return await browser.contextualIdentities.get(cookieStoreId);
  } catch (e) {
    log.warn("container not found:", cookieStoreId, e);
    return null;
  }
}

function mapContainerColor(containerColor) {
  return CONTAINER_COLOR_MAP[containerColor] || "grey";
}

// ---------------------------------------------------------------------------
// Group resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the tab-group ID for a given (window, container) pair.
 * Returns null if no group exists yet (caller should create one).
 *
 * Strategy (in order):
 *   1. Cached groupId in storage.local (validated via tabGroups.get).
 *   2. Existing group in the same window whose title matches the container.
 */
async function resolveGroupId(windowId, identity, persistedMap) {
  const key = mapKey(windowId, identity.cookieStoreId);

  // 1. Cached.
  const cached = persistedMap[key];
  if (cached != null) {
    try {
      const group = await browser.tabGroups.get(cached);
      if (group && group.windowId === windowId) {
        return cached;
      }
    } catch {
      // Stale - fall through and clean up later.
      delete persistedMap[key];
    }
  }

  // 2. By matching title in the same window. We query without a title filter
  //    and match in JS, since the `title` query parameter isn't honored
  //    consistently across Firefox versions.
  try {
    const groups = await browser.tabGroups.query({ windowId });
    const match = groups.find((g) => g.title === identity.name);
    if (match) {
      persistedMap[key] = match.id;
      return match.id;
    }
  } catch (e) {
    log.warn("tabGroups.query failed:", e);
  }

  return null;
}

async function applyGroupMetadata(groupId, identity) {
  try {
    await browser.tabGroups.update(groupId, {
      title: identity.name,
      color: mapContainerColor(identity.color),
    });
  } catch (e) {
    log.warn("tabGroups.update failed:", e);
  }
}

/**
 * Adds the given tabs to the appropriate container group, creating it if
 * necessary. Returns the groupId used (or null if grouping was skipped).
 */
async function placeTabsInContainerGroup(windowId, cookieStoreId, tabIds, persistedMap) {
  if (!tabIds || tabIds.length === 0) return null;

  const identity = await getContainerIdentity(cookieStoreId);
  if (!identity) return null; // Default container or unknown - leave ungrouped.

  let groupId = await resolveGroupId(windowId, identity, persistedMap);

  if (groupId == null) {
    // Create a new group from these tabs.
    groupId = await browser.tabs.group({
      tabIds,
      createProperties: { windowId },
    });
    persistedMap[mapKey(windowId, cookieStoreId)] = groupId;
  } else {
    // Append tabs to the existing group.
    await browser.tabs.group({ tabIds, groupId });
  }

  await applyGroupMetadata(groupId, identity);
  return groupId;
}

// ---------------------------------------------------------------------------
// Window-level grouping
// ---------------------------------------------------------------------------

async function groupTabsInWindow(windowId, persistedMap) {
  const tabs = await browser.tabs.query({ windowId });

  // Bucket tabs by cookieStoreId. Skip pinned tabs (they live outside groups).
  const buckets = new Map();
  for (const tab of tabs) {
    if (tab.pinned) continue;
    const id = tab.cookieStoreId || DEFAULT_COOKIE_STORE_ID;
    if (id === DEFAULT_COOKIE_STORE_ID) continue;
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(tab.id);
  }

  for (const [cookieStoreId, tabIds] of buckets) {
    try {
      await placeTabsInContainerGroup(windowId, cookieStoreId, tabIds, persistedMap);
    } catch (e) {
      log.error("failed to group container", cookieStoreId, "in window", windowId, e);
    }
  }
}

async function regroupAllWindowsImpl() {
  const persistedMap = await loadGroupMap();
  const windows = await browser.windows.getAll();
  for (const win of windows) {
    if (win.type !== "normal") continue;
    try {
      await groupTabsInWindow(win.id, persistedMap);
    } catch (e) {
      log.error("failed in window", win.id, e);
    }
  }
  await saveGroupMap(persistedMap);
}

function regroupAllWindows() {
  return withLock("regroupAllWindows", regroupAllWindowsImpl);
}

// ---------------------------------------------------------------------------
// Live tab handling
// ---------------------------------------------------------------------------

async function handleSingleTabImpl(tabId) {
  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab || tab.pinned) return;
  if (!tab.cookieStoreId || tab.cookieStoreId === DEFAULT_COOKIE_STORE_ID) return;

  const persistedMap = await loadGroupMap();
  await placeTabsInContainerGroup(tab.windowId, tab.cookieStoreId, [tab.id], persistedMap);
  await saveGroupMap(persistedMap);
}

function handleSingleTab(tabId) {
  return withLock(`handleSingleTab(${tabId})`, () => handleSingleTabImpl(tabId));
}

// ---------------------------------------------------------------------------
// Auto-collapse inactive groups
// ---------------------------------------------------------------------------
//
// When a tab is activated, expand the group it belongs to (if any) and
// collapse every other group in the same window. The active tab's own
// group must stay expanded so the user can see siblings of the tab they
// just focused.

async function collapseInactiveGroupsImpl(windowId, keepExpandedGroupId) {
  let groups;
  try {
    groups = await browser.tabGroups.query({ windowId });
  } catch (e) {
    log.warn("tabGroups.query failed:", e);
    return;
  }
  for (const g of groups) {
    const shouldCollapse = g.id !== keepExpandedGroupId;
    if (g.collapsed === shouldCollapse) continue;
    try {
      await browser.tabGroups.update(g.id, { collapsed: shouldCollapse });
    } catch (e) {
      // Firefox rejects collapsing a group whose active tab is the focused
      // one - in our flow that group is the one we keep expanded, so this
      // shouldn't normally fire. Log and continue.
      log.warn("failed to set collapsed on group", g.id, e);
    }
  }
}

async function handleTabActivatedImpl(tabId, windowId) {
  const settings = await loadSettings();
  if (!settings.autoCollapseInactiveGroups) return;

  let tab;
  try {
    tab = await browser.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab) return;

  const activeGroupId =
    typeof tab.groupId === "number" && tab.groupId !== TAB_GROUP_ID_NONE
      ? tab.groupId
      : null;

  await collapseInactiveGroupsImpl(windowId, activeGroupId);
}

function handleTabActivated(tabId, windowId) {
  return withLock("tabs.onActivated", () => handleTabActivatedImpl(tabId, windowId));
}

// New tabs may not have their final cookieStoreId immediately, so debounce.
const pendingTabs = new Map();
function scheduleTabHandling(tabId) {
  if (pendingTabs.has(tabId)) {
    clearTimeout(pendingTabs.get(tabId));
  }
  const timer = setTimeout(() => {
    pendingTabs.delete(tabId);
    handleSingleTab(tabId).catch((e) =>
      log.warn("handleSingleTab failed:", e)
    );
  }, NEW_TAB_DEBOUNCE_MS);
  pendingTabs.set(tabId, timer);
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

browser.runtime.onInstalled.addListener(() => {
  regroupAllWindows().catch((e) =>
    log.error("onInstalled regroup failed:", e)
  );
});

browser.runtime.onStartup.addListener(() => {
  regroupAllWindows().catch((e) =>
    log.error("onStartup regroup failed:", e)
  );
});

browser.action.onClicked.addListener(() => {
  regroupAllWindows().catch((e) =>
    log.error("action regroup failed:", e)
  );
});

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === "regroup-all") {
    return regroupAllWindows()
      .then(() => ({ ok: true }))
      .catch((e) => ({ ok: false, error: String(e) }));
  }
  return undefined;
});

browser.tabs.onCreated.addListener((tab) => {
  scheduleTabHandling(tab.id);
});

// In Firefox, when a tab is reopened in another container, the original tab
// is closed and a new tab is created with a different cookieStoreId, so
// onCreated covers most cases. We also watch for pinned/unpinned changes.
browser.tabs.onUpdated.addListener(
  (tabId, changeInfo) => {
    if ("pinned" in changeInfo) {
      scheduleTabHandling(tabId);
    }
  },
  { properties: ["pinned"] }
);

// When a tab is dragged into another window, re-place it in that window's
// container group.
browser.tabs.onAttached.addListener((tabId) => {
  scheduleTabHandling(tabId);
});

// When the active tab changes, expand its container's group and collapse
// the rest (if the setting is enabled).
browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
  handleTabActivated(tabId, windowId);
});

// If the user removes a tab group manually, drop its cached entries so the
// next pass recreates the group cleanly instead of pointing at a dead id.
if (browser.tabGroups && browser.tabGroups.onRemoved) {
  browser.tabGroups.onRemoved.addListener((group) => {
    withLock("tabGroups.onRemoved", async () => {
      const persistedMap = await loadGroupMap();
      let changed = false;
      for (const [key, gid] of Object.entries(persistedMap)) {
        if (gid === group.id) {
          delete persistedMap[key];
          changed = true;
        }
      }
      if (changed) await saveGroupMap(persistedMap);
    });
  });
}

// When containers are renamed/recolored, refresh metadata of matching groups.
browser.contextualIdentities.onUpdated.addListener(async ({ contextualIdentity }) => {
  try {
    const persistedMap = await loadGroupMap();
    for (const [key, groupId] of Object.entries(persistedMap)) {
      if (!key.endsWith(`::${contextualIdentity.cookieStoreId}`)) continue;
      try {
        await applyGroupMetadata(groupId, contextualIdentity);
      } catch (e) {
        log.warn("refresh metadata failed:", e);
      }
    }
  } catch (e) {
    log.warn("contextualIdentities.onUpdated handler failed:", e);
  }
});

// When a container is removed, drop its cached group entries.
browser.contextualIdentities.onRemoved.addListener(async ({ contextualIdentity }) => {
  try {
    const persistedMap = await loadGroupMap();
    let changed = false;
    for (const key of Object.keys(persistedMap)) {
      if (key.endsWith(`::${contextualIdentity.cookieStoreId}`)) {
        delete persistedMap[key];
        changed = true;
      }
    }
    if (changed) await saveGroupMap(persistedMap);
  } catch (e) {
    log.warn("contextualIdentities.onRemoved handler failed:", e);
  }
});
