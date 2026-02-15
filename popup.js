const modeSelect = document.getElementById("mode");
const toggleSiteButton = document.getElementById("toggle-site");
const manageAllowlistButton = document.getElementById("manage-allowlist");
const refreshButton = document.getElementById("refresh");
const meta = document.getElementById("meta");

let currentTabUrl = "";
let currentDomain = "";
let siteAllowed = false;
let allowlistCount = 0;
let sessionBlocked = 0;
let todayBlocked = 0;
let countersAvailable = false;

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const active = tabs[0];
  return active && active.url ? active.url : "";
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "No response" });
    });
  });
}

function render() {
  modeSelect.value = modeSelect.value || "standard";

  if (!currentDomain) {
    toggleSiteButton.disabled = true;
    toggleSiteButton.textContent = "Unsupported tab";
  } else {
    toggleSiteButton.disabled = false;
    toggleSiteButton.textContent = siteAllowed
      ? "Block ads on this site"
      : "Allow ads on this site";
  }

  const siteLine = currentDomain ? `Site: ${currentDomain}` : "Site: unavailable";
  const allowlistLine = `Allowlisted sites: ${allowlistCount}`;
  const sessionLine = countersAvailable
    ? `Blocked this session: ${sessionBlocked}`
    : "Blocked this session: unavailable";
  const todayLine = countersAvailable
    ? `Blocked today: ${todayBlocked}`
    : "Blocked today: unavailable";

  meta.classList.remove("error");
  meta.textContent = `${siteLine}\n${allowlistLine}\n${sessionLine}\n${todayLine}`;
}

function renderError(error) {
  meta.classList.add("error");
  meta.textContent = error || "Something went wrong";
}

async function loadState() {
  currentTabUrl = await getActiveTabUrl();
  const response = await sendMessage({ type: "GET_STATE", url: currentTabUrl });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  modeSelect.value = response.mode;
  currentDomain = response.domain;
  siteAllowed = response.siteAllowed;
  allowlistCount = response.allowlistCount;
  sessionBlocked = response.sessionBlocked || 0;
  todayBlocked = response.todayBlocked || 0;
  countersAvailable = Boolean(response.countersAvailable);
  render();
}

modeSelect.addEventListener("change", async () => {
  const response = await sendMessage({
    type: "SET_MODE",
    mode: modeSelect.value
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  modeSelect.value = response.mode;
  await loadState();
});

toggleSiteButton.addEventListener("click", async () => {
  const response = await sendMessage({
    type: "TOGGLE_SITE",
    url: currentTabUrl
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  siteAllowed = response.siteAllowed;
  allowlistCount = response.allowlistCount;
  currentDomain = response.domain || currentDomain;
  render();
});

manageAllowlistButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshButton.addEventListener("click", async () => {
  await loadState();
});

loadState().catch((error) => renderError(String(error)));
