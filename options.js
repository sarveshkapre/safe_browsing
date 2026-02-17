const pausedToggle = document.getElementById("toggle-paused");
const cookieHandlingToggle = document.getElementById("toggle-cookie-handling");
const xAdsBlockingToggle = document.getElementById("toggle-x-ads-blocking");
const xCompatibilityToggle = document.getElementById("toggle-x-compatibility");
const annoyancesToggle = document.getElementById("toggle-annoyances");
const regionalToggle = document.getElementById("toggle-regional");
const rulesetStatus = document.getElementById("ruleset-status");

const refreshButton = document.getElementById("refresh");
const clearAllButton = document.getElementById("clear-all");
const status = document.getElementById("status");
const allowlistContainer = document.getElementById("allowlist");
const activityRefreshButton = document.getElementById("activity-refresh");
const activityClearButton = document.getElementById("activity-clear");
const activityStatus = document.getElementById("activity-status");
const topDomainsContainer = document.getElementById("activity-top-domains");
const topUrlsContainer = document.getElementById("activity-top-urls");
const blockedActivityContainer = document.getElementById("blocked-activity");

let isApplyingRulesetState = false;

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

function setStatus(text, isError) {
  status.textContent = text;
  status.className = isError ? "sub error" : "sub";
}

function setRulesetStatus(text, isError) {
  rulesetStatus.textContent = text;
  rulesetStatus.className = isError ? "sub error" : "sub";
}

function setActivityStatus(text, isError) {
  activityStatus.textContent = text;
  activityStatus.className = isError ? "sub error" : "sub";
}

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "Unknown time";
  }

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Unknown time";
  }
}

function applyRulesetUI(
  optionalRulesets,
  paused,
  cookieHandlingEnabled,
  xAdsBlockingEnabled,
  xCompatibilityModeEnabled
) {
  isApplyingRulesetState = true;
  pausedToggle.checked = paused === true;
  cookieHandlingToggle.checked = cookieHandlingEnabled !== false;
  xAdsBlockingToggle.checked = xAdsBlockingEnabled !== false;
  xCompatibilityToggle.checked = xCompatibilityModeEnabled !== false;
  annoyancesToggle.checked = optionalRulesets.annoyances === true;
  regionalToggle.checked = optionalRulesets.regional === true;
  isApplyingRulesetState = false;
}

async function loadRulesetSettings() {
  const response = await sendMessage({ type: "GET_RULESET_SETTINGS" });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to load rulesets", true);
    return;
  }

  const optionalRulesets = response.optionalRulesets || {
    annoyances: false,
    regional: false
  };
  const paused = response.paused === true;
  const cookieHandlingEnabled = response.cookieHandlingEnabled !== false;
  const xAdsBlockingEnabled = response.xAdsBlockingEnabled !== false;
  const xCompatibilityModeEnabled = response.xCompatibilityModeEnabled !== false;

  applyRulesetUI(
    optionalRulesets,
    paused,
    cookieHandlingEnabled,
    xAdsBlockingEnabled,
    xCompatibilityModeEnabled
  );
  setRulesetStatus(
    `Protection: ${paused ? "paused" : "active"} | Cookie: ${cookieHandlingEnabled ? "on" : "off"} | X ads: ${xAdsBlockingEnabled ? "on" : "off"} | X compat: ${xCompatibilityModeEnabled ? "on" : "off"} | Annoyances: ${optionalRulesets.annoyances ? "on" : "off"} | Regional: ${optionalRulesets.regional ? "on" : "off"}`,
    false
  );
}

async function setOptionalRuleset(ruleset, enabled) {
  const response = await sendMessage({
    type: "SET_OPTIONAL_RULESET",
    ruleset,
    enabled
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update ruleset", true);
    return;
  }

  await loadRulesetSettings();
}

async function setCookieHandling(enabled) {
  const response = await sendMessage({
    type: "SET_COOKIE_HANDLING",
    enabled
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update cookie handling", true);
    return;
  }

  await loadRulesetSettings();
}

async function setPaused(paused) {
  const response = await sendMessage({
    type: "SET_PAUSED",
    paused
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update protection pause", true);
    return;
  }

  await loadRulesetSettings();
}

async function setXAdsBlocking(enabled) {
  const response = await sendMessage({
    type: "SET_X_ADS_BLOCKING",
    enabled
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update X ad blocking", true);
    return;
  }

  await loadRulesetSettings();
}

async function setXCompatibilityMode(enabled) {
  const response = await sendMessage({
    type: "SET_X_COMPATIBILITY_MODE",
    enabled
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update X compatibility mode", true);
    return;
  }

  await loadRulesetSettings();
}

async function removeDomain(domain) {
  const response = await sendMessage({
    type: "REMOVE_ALLOWLIST_DOMAIN",
    domain
  });

  if (!response.ok) {
    setStatus(response.error || "Failed to remove domain", true);
    return;
  }

  setStatus(`Allowlisted sites: ${response.allowlistCount}`, false);
  await loadAllowlist();
}

function renderAllowlist(domains) {
  allowlistContainer.innerHTML = "";

  if (!domains.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No allowlisted sites.";
    allowlistContainer.appendChild(empty);
    return;
  }

  domains.forEach((domain) => {
    const row = document.createElement("li");

    const domainSpan = document.createElement("span");
    domainSpan.className = "domain";
    domainSpan.textContent = domain;

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      removeDomain(domain).catch((error) => setStatus(String(error), true));
    });

    row.appendChild(domainSpan);
    row.appendChild(removeButton);
    allowlistContainer.appendChild(row);
  });
}

function renderTopCounts(container, rows, emptyText) {
  container.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  rows.forEach((item) => {
    const row = document.createElement("li");
    const value = document.createElement("span");
    value.className = "domain";
    value.textContent = item.value || "unknown";

    const count = document.createElement("span");
    count.textContent = String(item.count || 0);

    row.appendChild(value);
    row.appendChild(count);
    container.appendChild(row);
  });
}

function renderBlockedActivity(entries) {
  blockedActivityContainer.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No blocked activity yet.";
    blockedActivityContainer.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "activity-item";

    const blockedDomain = entry.blockedDomain || "unknown-domain";
    const main = document.createElement("div");
    main.className = "activity-main";
    main.textContent = `${blockedDomain} (${entry.source || "network"})`;

    const pageDomain = entry.pageDomain || "unknown-site";
    const requestUrl = entry.requestUrl || "n/a";
    const resourceType = entry.resourceType || "other";
    const rulesetId = entry.rulesetId || "unknown";
    const time = formatTime(Number(entry.timestamp));

    const meta = document.createElement("div");
    meta.className = "activity-meta";
    meta.textContent = `site: ${pageDomain} | type: ${resourceType} | ruleset: ${rulesetId} | url: ${requestUrl} | ${time}`;

    item.appendChild(main);
    item.appendChild(meta);
    blockedActivityContainer.appendChild(item);
  });
}

async function loadBlockedActivity() {
  const response = await sendMessage({ type: "GET_BLOCKED_ACTIVITY", limit: 200 });

  if (!response.ok) {
    setActivityStatus(response.error || "Failed to load detailed stats", true);
    return;
  }

  const entries = Array.isArray(response.blockedActivity) ? response.blockedActivity : [];
  const topDomains = Array.isArray(response.topDomains) ? response.topDomains : [];
  const topUrls = Array.isArray(response.topUrls) ? response.topUrls : [];
  renderTopCounts(topDomainsContainer, topDomains, "No domains yet.");
  renderTopCounts(topUrlsContainer, topUrls, "No URLs yet.");
  renderBlockedActivity(entries);

  const blockedCount = Number.isFinite(response.blockedActivityCount) ? response.blockedActivityCount : 0;
  const todayBlocked = Number.isFinite(response.todayBlocked) ? response.todayBlocked : 0;
  const todayXAdsHidden = Number.isFinite(response.todayXAdsHidden) ? response.todayXAdsHidden : 0;
  const sessionBlocked = Number.isFinite(response.sessionBlocked) ? response.sessionBlocked : 0;
  const sessionXAdsHidden = Number.isFinite(response.sessionXAdsHidden)
    ? response.sessionXAdsHidden
    : 0;
  const dnrCapacity = response.dnrCapacity && typeof response.dnrCapacity === "object"
    ? response.dnrCapacity
    : null;
  const dnrLine = dnrCapacity && Number.isFinite(dnrCapacity.availableStaticRules)
    ? `DNR available static rules: ${dnrCapacity.availableStaticRules}`
    : "DNR available static rules: unavailable";

  setActivityStatus(
    `Entries: ${blockedCount} | Network blocked (today/session): ${todayBlocked}/${sessionBlocked} | X ads hidden (today/session): ${todayXAdsHidden}/${sessionXAdsHidden} | ${dnrLine}`,
    false
  );
}

async function loadAllowlist() {
  const response = await sendMessage({ type: "GET_ALLOWLIST" });

  if (!response.ok) {
    setStatus(response.error || "Failed to load allowlist", true);
    return;
  }

  renderAllowlist(response.allowlist || []);
  setStatus(`Allowlisted sites: ${response.allowlistCount || 0}`, false);
}

pausedToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setPaused(pausedToggle.checked);
});

cookieHandlingToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setCookieHandling(cookieHandlingToggle.checked);
});

xAdsBlockingToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setXAdsBlocking(xAdsBlockingToggle.checked);
});

xCompatibilityToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setXCompatibilityMode(xCompatibilityToggle.checked);
});

annoyancesToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setOptionalRuleset("annoyances", annoyancesToggle.checked);
});

regionalToggle.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  await setOptionalRuleset("regional", regionalToggle.checked);
});

refreshButton.addEventListener("click", () => {
  loadAllowlist().catch((error) => setStatus(String(error), true));
});

clearAllButton.addEventListener("click", async () => {
  const response = await sendMessage({ type: "CLEAR_ALLOWLIST" });

  if (!response.ok) {
    setStatus(response.error || "Failed to clear allowlist", true);
    return;
  }

  await loadAllowlist();
});

activityRefreshButton.addEventListener("click", () => {
  loadBlockedActivity().catch((error) => setActivityStatus(String(error), true));
});

activityClearButton.addEventListener("click", async () => {
  const response = await sendMessage({ type: "CLEAR_BLOCKED_ACTIVITY" });

  if (!response.ok) {
    setActivityStatus(response.error || "Failed to clear stats", true);
    return;
  }

  await loadBlockedActivity();
});

Promise.all([loadRulesetSettings(), loadAllowlist(), loadBlockedActivity()]).catch((error) => {
  setStatus(String(error), true);
  setRulesetStatus(String(error), true);
  setActivityStatus(String(error), true);
});
