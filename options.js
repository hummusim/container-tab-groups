const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = {
  autoCollapseInactiveGroups: true,
  audibleIndicator: true,
};

const statusEl = document.getElementById("status");
const autoCollapseEl = document.getElementById("autoCollapse");
const audibleIndicatorEl = document.getElementById("audibleIndicator");

function flash(msg, isError) {
  statusEl.style.color = isError ? "#a4262c" : "#126312";
  statusEl.textContent = msg;
  setTimeout(() => {
    statusEl.textContent = "";
  }, 2500);
}

async function loadSettings() {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

// Initial state -------------------------------------------------------------

(async () => {
  const settings = await loadSettings();
  autoCollapseEl.checked = !!settings.autoCollapseInactiveGroups;
  audibleIndicatorEl.checked = !!settings.audibleIndicator;
})();

// Event wiring --------------------------------------------------------------

document.getElementById("regroup").addEventListener("click", async () => {
  try {
    await browser.runtime.sendMessage({ type: "regroup-all" });
    flash("Regrouping triggered.");
  } catch (e) {
    flash("Failed: " + e.message, true);
  }
});

document.getElementById("reset").addEventListener("click", async () => {
  try {
    await browser.storage.local.remove("containerGroupMap");
    flash("Cached mapping cleared.");
  } catch (e) {
    flash("Failed: " + e.message, true);
  }
});

autoCollapseEl.addEventListener("change", async () => {
  try {
    const settings = await loadSettings();
    settings.autoCollapseInactiveGroups = autoCollapseEl.checked;
    await saveSettings(settings);
    flash(autoCollapseEl.checked ? "Auto-collapse enabled." : "Auto-collapse disabled.");
  } catch (e) {
    flash("Failed: " + e.message, true);
  }
});

audibleIndicatorEl.addEventListener("change", async () => {
  try {
    const settings = await loadSettings();
    settings.audibleIndicator = audibleIndicatorEl.checked;
    await saveSettings(settings);
    // Trigger a regroup so titles refresh immediately to reflect the new
    // setting (suffix appears or disappears).
    await browser.runtime.sendMessage({ type: "regroup-all" }).catch(() => {});
    flash(
      audibleIndicatorEl.checked ? "Audible indicator enabled." : "Audible indicator disabled."
    );
  } catch (e) {
    flash("Failed: " + e.message, true);
  }
});
