/*
 * Toolbar popup. Lists tabs that are currently producing audio and offers
 * mute/unmute and "switch to tab" controls per row, plus a manual
 * "re-group all tabs" button at the bottom.
 *
 * The DOM is built with createElement / textContent / createElementNS
 * (no innerHTML) so AMO's static analyzer doesn't flag UNSAFE_VAR_ASSIGNMENT
 * and we never have to hand-roll HTML escaping for tab titles.
 */

const tracksEl = document.getElementById("tracks");

// Approximate the colors Firefox uses for Multi-Account Containers so the
// popup chip looks the same as the badge Firefox draws around the URL bar.
const CONTAINER_COLOR_HEX = {
  blue: "#37adff",
  turquoise: "#00c79a",
  green: "#51cd00",
  yellow: "#ffcb00",
  orange: "#ff9f00",
  red: "#ff613d",
  pink: "#ff4bda",
  purple: "#af51f5",
  toolbar: "#737373",
};
const FALLBACK_CONTAINER_COLOR = "#737373";

const DEFAULT_COOKIE_STORE_ID = "firefox-default";

// Material Design "volume_up" and "volume_off" path data, rendered with
// currentColor so they inherit the popup's text color (light/dark theme).
const SVG_NS = "http://www.w3.org/2000/svg";
const VOLUME_UP_PATH =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
const VOLUME_OFF_PATH =
  "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z";

// Track rendered rows so they remain visible after mute (when the tab is no
// longer "audible") - the user can still unmute from the same row.
const rowsByTabId = new Map();

function makeIcon(pathD) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

async function getContainerIdentity(cookieStoreId) {
  if (!cookieStoreId || cookieStoreId === DEFAULT_COOKIE_STORE_ID) return null;
  try {
    return await browser.contextualIdentities.get(cookieStoreId);
  } catch {
    return null;
  }
}

function isMuted(tab) {
  return Boolean(tab.mutedInfo && tab.mutedInfo.muted);
}

function isAudible(tab) {
  return Boolean(tab.audible) && !isMuted(tab);
}

function renderEmpty() {
  tracksEl.replaceChildren();
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "No audio playing.";
  tracksEl.appendChild(empty);
  rowsByTabId.clear();
}

function clearEmptyState() {
  tracksEl.replaceChildren();
}

function buildRow(tab, identity) {
  const row = document.createElement("div");
  row.className = "track";
  row.dataset.tabId = String(tab.id);

  // Info column.
  const info = document.createElement("div");
  info.className = "info";

  const chip = document.createElement("span");
  chip.className = "container-chip";
  chip.style.background = identity
    ? CONTAINER_COLOR_HEX[identity.color] || FALLBACK_CONTAINER_COLOR
    : FALLBACK_CONTAINER_COLOR;
  chip.textContent = identity ? identity.name : "No container";
  info.appendChild(chip);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = tab.title || "(untitled)";
  if (tab.title) title.title = tab.title;
  info.appendChild(title);

  // Controls column.
  const controls = document.createElement("div");
  controls.className = "controls";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "icon-btn";
  toggleBtn.dataset.action = "toggle";
  toggleBtn.addEventListener("click", () => handleToggle(tab.id));
  controls.appendChild(toggleBtn);

  const focusBtn = document.createElement("button");
  focusBtn.className = "icon-btn";
  focusBtn.dataset.action = "focus";
  focusBtn.title = "Switch to tab";
  focusBtn.textContent = "↗";
  focusBtn.addEventListener("click", () => handleFocus(tab.id));
  controls.appendChild(focusBtn);

  row.appendChild(info);
  row.appendChild(controls);

  updateRowState(row, tab);
  rowsByTabId.set(tab.id, row);
  return row;
}

function updateRowState(row, tab) {
  const toggleBtn = row.querySelector('[data-action="toggle"]');
  const audible = isAudible(tab);
  toggleBtn.replaceChildren(makeIcon(audible ? VOLUME_UP_PATH : VOLUME_OFF_PATH));
  toggleBtn.title = audible ? "Mute" : "Unmute";
}

async function refreshRow(tabId) {
  const row = rowsByTabId.get(tabId);
  if (!row) return;
  try {
    const tab = await browser.tabs.get(tabId);
    updateRowState(row, tab);
  } catch {
    // Tab closed - drop the row.
    row.remove();
    rowsByTabId.delete(tabId);
    if (rowsByTabId.size === 0) renderEmpty();
  }
}

// "Stop / play" in the popup is implemented as mute / unmute. Calling
// HTMLMediaElement.play() from within an extension popup is rejected by
// Firefox's autoplay policy because the popup's user gesture isn't
// transferred to the target tab. Mute/unmute is the only operation that
// reliably round-trips: the audio stops immediately, and unmuting brings
// it back without any policy hurdles. The trade-off is that the video
// keeps decoding in the background while "paused"; for a music player
// that's usually what the user wants. To truly pause the video, switch
// to the tab and press space.
async function handleToggle(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    await browser.tabs.update(tabId, { muted: !isMuted(tab) });
    setTimeout(() => refreshRow(tabId), 100);
  } catch (e) {
    console.warn("[popup] toggle failed:", e);
  }
}

async function handleFocus(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.update(tabId, { active: true });
  } catch (e) {
    console.warn("[popup] focus failed:", e);
  } finally {
    window.close();
  }
}

async function initialRender() {
  const audibleTabs = await browser.tabs.query({ audible: true });
  if (audibleTabs.length === 0) {
    renderEmpty();
    return;
  }
  clearEmptyState();
  for (const tab of audibleTabs) {
    const identity = await getContainerIdentity(tab.cookieStoreId);
    tracksEl.appendChild(buildRow(tab, identity));
  }
}

// Re-render when audible / muted state changes for tabs we already display,
// and add new tabs that just started playing.
browser.tabs.onUpdated.addListener(
  async (tabId, _changeInfo, tab) => {
    if (rowsByTabId.has(tabId)) {
      updateRowState(rowsByTabId.get(tabId), tab);
      return;
    }
    if (tab.audible) {
      const identity = await getContainerIdentity(tab.cookieStoreId);
      if (rowsByTabId.size === 0) clearEmptyState();
      tracksEl.appendChild(buildRow(tab, identity));
    }
  },
  { properties: ["audible", "mutedInfo"] }
);

browser.tabs.onRemoved.addListener((tabId) => {
  const row = rowsByTabId.get(tabId);
  if (!row) return;
  row.remove();
  rowsByTabId.delete(tabId);
  if (rowsByTabId.size === 0) renderEmpty();
});

document.getElementById("regroup").addEventListener("click", async () => {
  try {
    await browser.runtime.sendMessage({ type: "regroup-all" });
  } catch (e) {
    console.warn("[popup] regroup-all message failed:", e);
  }
  window.close();
});

initialRender().catch((e) => {
  console.error("[popup] initial render failed:", e);
  renderEmpty();
});
