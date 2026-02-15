const modeSelect = document.getElementById("mode");
const toggleSiteButton = document.getElementById("toggle-site");
const pausedToggle = document.getElementById("toggle-paused");
const cookieHandlingToggle = document.getElementById("toggle-cookie-handling");
const xAdsBlockingToggle = document.getElementById("toggle-x-ads-blocking");
const xCompatibilityToggle = document.getElementById("toggle-x-compatibility");
const annoyancesToggle = document.getElementById("toggle-annoyances");
const regionalToggle = document.getElementById("toggle-regional");
const manageAllowlistButton = document.getElementById("manage-allowlist");
const refreshButton = document.getElementById("refresh");
const viewBlockedActivityButton = document.getElementById("view-blocked-activity");
const meta = document.getElementById("meta");

let isApplyingState = false;
let currentTabUrl = "";
let currentDomain = "";
let siteAllowed = false;
let allowlistCount = 0;
let sessionBlocked = 0;
let todayBlocked = 0;
let blockedActivityCount = 0;
let countersAvailable = false;
let paused = false;
let cookieHandlingEnabled = true;
let xAdsBlockingEnabled = true;
let xCompatibilityModeEnabled = true;
let optionalRulesets = {
  annoyances: false,
  regional: false
};

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
  isApplyingState = true;

  modeSelect.value = modeSelect.value || "standard";
  pausedToggle.checked = paused;
  cookieHandlingToggle.checked = cookieHandlingEnabled;
  xAdsBlockingToggle.checked = xAdsBlockingEnabled;
  xCompatibilityToggle.checked = xCompatibilityModeEnabled;
  annoyancesToggle.checked = optionalRulesets.annoyances === true;
  regionalToggle.checked = optionalRulesets.regional === true;

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
  const activityLine = `Blocked activity entries: ${blockedActivityCount}`;
  const pausedLine = `Protection: ${paused ? "paused" : "active"}`;
  const xCompatLine = `X compatibility: ${xCompatibilityModeEnabled ? "on" : "off"}`;

  meta.classList.remove("error");
  meta.textContent = `${pausedLine}\n${xCompatLine}\n${siteLine}\n${allowlistLine}\n${sessionLine}\n${todayLine}\n${activityLine}`;

  isApplyingState = false;
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
  blockedActivityCount = response.blockedActivityCount || 0;
  countersAvailable = Boolean(response.countersAvailable);
  paused = response.paused === true;
  cookieHandlingEnabled = response.cookieHandlingEnabled !== false;
  xAdsBlockingEnabled = response.xAdsBlockingEnabled !== false;
  xCompatibilityModeEnabled = response.xCompatibilityModeEnabled !== false;
  optionalRulesets = response.optionalRulesets || optionalRulesets;

  render();
}

async function setOptionalRuleset(ruleset, enabled) {
  const response = await sendMessage({
    type: "SET_OPTIONAL_RULESET",
    ruleset,
    enabled
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  optionalRulesets = response.optionalRulesets || optionalRulesets;
  render();
}

async function setPaused(nextPaused) {
  const response = await sendMessage({
    type: "SET_PAUSED",
    paused: nextPaused
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  paused = response.paused === true;
  await loadState();
}

async function setCookieHandling(enabled) {
  const response = await sendMessage({
    type: "SET_COOKIE_HANDLING",
    enabled
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  cookieHandlingEnabled = response.cookieHandlingEnabled !== false;
  render();
}

async function setXAdsBlocking(enabled) {
  const response = await sendMessage({
    type: "SET_X_ADS_BLOCKING",
    enabled
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  xAdsBlockingEnabled = response.xAdsBlockingEnabled !== false;
  render();
}

async function setXCompatibilityMode(enabled) {
  const response = await sendMessage({
    type: "SET_X_COMPATIBILITY_MODE",
    enabled
  });

  if (!response.ok) {
    renderError(response.error);
    return;
  }

  xCompatibilityModeEnabled = response.xCompatibilityModeEnabled !== false;
  render();
}

modeSelect.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

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

pausedToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setPaused(pausedToggle.checked);
});

cookieHandlingToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setCookieHandling(cookieHandlingToggle.checked);
});

xAdsBlockingToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setXAdsBlocking(xAdsBlockingToggle.checked);
});

xCompatibilityToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setXCompatibilityMode(xCompatibilityToggle.checked);
});

annoyancesToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setOptionalRuleset("annoyances", annoyancesToggle.checked);
});

regionalToggle.addEventListener("change", async () => {
  if (isApplyingState) {
    return;
  }

  await setOptionalRuleset("regional", regionalToggle.checked);
});

manageAllowlistButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refreshButton.addEventListener("click", async () => {
  await loadState();
});

viewBlockedActivityButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadState().catch((error) => renderError(String(error)));
