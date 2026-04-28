/*
 * Toolbar popup. Shows tabs that are currently producing audio with
 * play/pause, mute and "focus tab" controls per row, plus a manual
 * "re-group all tabs" button.
 */

const tracksEl = document.getElementById("tracks");

// Approximate the colors Firefox uses for Multi-Account Containers so
// the popup chip looks the same as the container badge in the URL bar.
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

const DEFAULT_COOKIE_STORE_ID = "firefox-default";

// Track rendered rows so they remain visible after pause (when the tab
// is no longer "audible") - the user can still resume from the same row.
const rowsByTabId = new Map();

async function getContainerIdentity(cookieStoreId) {
  if (!cookieStoreId || cookieStoreId === DEFAULT_COOKIE_STORE_ID) return null;
  try {
    return await browser.contextualIdentities.get(cookieStoreId);
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]
  );
}

function isMuted(tab) {
  return Boolean(tab.mutedInfo && tab.mutedInfo.muted);
}

// The popup-toggle uses mute as the audible/silent boundary, so the
// "play" icon really means "audible right now".
function isAudible(tab) {
  return Boolean(tab.audible) && !isMuted(tab);
}

function buildRow(tab, identity) {
  const row = document.createElement("div");
  row.className = "track";
  row.dataset.tabId = String(tab.id);

  const containerColor = identity ? CONTAINER_COLOR_HEX[identity.color] || "#737373" : "#737373";
  const containerLabel = identity ? identity.name : "No container";

  row.innerHTML = `
    <div class="info">
      <span class="container-chip" style="background:${containerColor}">${escapeHtml(containerLabel)}</span>
      <div class="title" title="${escapeHtml(tab.title || "")}">${escapeHtml(tab.title || "(untitled)")}</div>
    </div>
    <div class="controls">
      <button class="icon-btn" data-action="toggle" title="Mute / unmute"></button>
      <button class="icon-btn" data-action="focus" title="Switch to tab">↗</button>
    </div>
  `;

  const toggleBtn = row.querySelector('[data-action="toggle"]');
  const focusBtn = row.querySelector('[data-action="focus"]');

  toggleBtn.addEventListener("click", () => handleToggle(tab.id));
  focusBtn.addEventListener("click", () => handleFocus(tab.id));

  updateRowState(row, tab);
  rowsByTabId.set(tab.id, row);
  return row;
}

// Inline SVG so the speaker icons render consistently across platforms
// (no emoji rendering quirks) and inherit the popup's text color.
const SVG_VOLUME_UP = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
  </svg>`;

const SVG_VOLUME_OFF = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
  </svg>`;

function updateRowState(row, tab) {
  const toggleBtn = row.querySelector('[data-action="toggle"]');
  toggleBtn.innerHTML = isAudible(tab) ? SVG_VOLUME_UP : SVG_VOLUME_OFF;
  toggleBtn.title = isAudible(tab) ? "Mute" : "Unmute";
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

function renderEmpty() {
  tracksEl.innerHTML = '<div class="empty">No audio playing.</div>';
  rowsByTabId.clear();
}

async function initialRender() {
  const audibleTabs = await browser.tabs.query({ audible: true });
  if (audibleTabs.length === 0) {
    renderEmpty();
    return;
  }
  tracksEl.innerHTML = "";
  for (const tab of audibleTabs) {
    const identity = await getContainerIdentity(tab.cookieStoreId);
    tracksEl.appendChild(buildRow(tab, identity));
  }
}

// Re-render when audible/muted state changes for tabs we already display, and
// add new tabs that just started playing.
browser.tabs.onUpdated.addListener(
  async (tabId, _changeInfo, tab) => {
    if (rowsByTabId.has(tabId)) {
      updateRowState(rowsByTabId.get(tabId), tab);
      return;
    }
    if (tab.audible) {
      const identity = await getContainerIdentity(tab.cookieStoreId);
      // First track started playing while the popup was open - clear empty state.
      if (rowsByTabId.size === 0) tracksEl.innerHTML = "";
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
