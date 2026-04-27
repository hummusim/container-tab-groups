const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = {
  autoCollapseInactiveGroups: true,
};

const statusEl = document.getElementById("status");
const autoCollapseEl = document.getElementById("autoCollapse");

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
