const pausedToggle = document.getElementById("toggle-paused");
const cookieHandlingToggle = document.getElementById("toggle-cookie-handling");
const xAdsBlockingToggle = document.getElementById("toggle-x-ads-blocking");
const xCompatibilityToggle = document.getElementById("toggle-x-compatibility");
const statsRetentionInput = document.getElementById("stats-retention-days");
const annoyancesToggle = document.getElementById("toggle-annoyances");
const regionalToggle = document.getElementById("toggle-regional");
const rulesetStatus = document.getElementById("ruleset-status");

const refreshButton = document.getElementById("refresh");
const clearAllButton = document.getElementById("clear-all");
const status = document.getElementById("status");
const allowlistContainer = document.getElementById("allowlist");
const activityRefreshButton = document.getElementById("activity-refresh");
const activityClearButton = document.getElementById("activity-clear");
const activityClearNetworkButton = document.getElementById("activity-clear-network");
const activityClearXButton = document.getElementById("activity-clear-x");
const activityStatus = document.getElementById("activity-status");
const topDomainsContainer = document.getElementById("activity-top-domains");
const topUrlsContainer = document.getElementById("activity-top-urls");
const blockedActivityContainer = document.getElementById("blocked-activity");
const activitySourceFilter = document.getElementById("activity-source-filter");
const activitySearchInput = document.getElementById("activity-search");

let isApplyingRulesetState = false;
let detailedEntries = [];
let latestStatsMeta = {
  blockedCount: 0,
  todayBlocked: 0,
  sessionBlocked: 0,
  todayXAdsHidden: 0,
  sessionXAdsHidden: 0
};

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
  xCompatibilityModeEnabled,
  statsRetentionDays
) {
  isApplyingRulesetState = true;
  pausedToggle.checked = paused === true;
  cookieHandlingToggle.checked = cookieHandlingEnabled !== false;
  xAdsBlockingToggle.checked = xAdsBlockingEnabled !== false;
  xCompatibilityToggle.checked = xCompatibilityModeEnabled !== false;
  statsRetentionInput.value = String(statsRetentionDays);
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
  const statsRetentionDays = Number.isFinite(response.statsRetentionDays)
    ? response.statsRetentionDays
    : 30;

  applyRulesetUI(
    optionalRulesets,
    paused,
    cookieHandlingEnabled,
    xAdsBlockingEnabled,
    xCompatibilityModeEnabled,
    statsRetentionDays
  );
  setRulesetStatus(
    `Protection: ${paused ? "paused" : "active"} | Cookie: ${cookieHandlingEnabled ? "on" : "off"} | X ads: ${xAdsBlockingEnabled ? "on" : "off"} | X compat: ${xCompatibilityModeEnabled ? "on" : "off"} | Retention: ${statsRetentionDays}d | Annoyances: ${optionalRulesets.annoyances ? "on" : "off"} | Regional: ${optionalRulesets.regional ? "on" : "off"}`,
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

async function setStatsRetentionDays(days) {
  const response = await sendMessage({
    type: "SET_STATS_RETENTION_DAYS",
    days
  });

  if (!response.ok) {
    setRulesetStatus(response.error || "Failed to update stats retention", true);
    return;
  }

  await loadRulesetSettings();
  await loadBlockedActivity();
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

function filterEntries(entries) {
  const source = activitySourceFilter.value || "all";
  const query = String(activitySearchInput.value || "").trim().toLowerCase();

  return entries.filter((entry) => {
    if (source !== "all" && entry.source !== source) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      entry.blockedDomain,
      entry.pageDomain,
      entry.requestUrl,
      entry.rulesetId
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function renderDetailedStats() {
  const filtered = filterEntries(detailedEntries);
  renderBlockedActivity(filtered);

  setActivityStatus(
    `Entries: ${latestStatsMeta.blockedCount} (${filtered.length} shown) | Network blocked (today/session): ${latestStatsMeta.todayBlocked}/${latestStatsMeta.sessionBlocked} | X ads hidden (today/session): ${latestStatsMeta.todayXAdsHidden}/${latestStatsMeta.sessionXAdsHidden}`,
    false
  );
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
  detailedEntries = entries;
  renderTopCounts(topDomainsContainer, topDomains, "No domains yet.");
  renderTopCounts(topUrlsContainer, topUrls, "No URLs yet.");

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

  latestStatsMeta = {
    blockedCount,
    todayBlocked,
    sessionBlocked,
    todayXAdsHidden,
    sessionXAdsHidden
  };

  renderDetailedStats();
  setActivityStatus(`${activityStatus.textContent} | ${dnrLine}`, false);
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

statsRetentionInput.addEventListener("change", async () => {
  if (isApplyingRulesetState) {
    return;
  }

  const next = Number(statsRetentionInput.value);
  await setStatsRetentionDays(next);
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
  const response = await sendMessage({ type: "CLEAR_BLOCKED_ACTIVITY", target: "all" });

  if (!response.ok) {
    setActivityStatus(response.error || "Failed to clear stats", true);
    return;
  }

  await loadBlockedActivity();
});

activityClearNetworkButton.addEventListener("click", async () => {
  const response = await sendMessage({ type: "CLEAR_BLOCKED_ACTIVITY", target: "network" });

  if (!response.ok) {
    setActivityStatus(response.error || "Failed to clear network stats", true);
    return;
  }

  await loadBlockedActivity();
});

activityClearXButton.addEventListener("click", async () => {
  const response = await sendMessage({ type: "CLEAR_BLOCKED_ACTIVITY", target: "x_dom" });

  if (!response.ok) {
    setActivityStatus(response.error || "Failed to clear X DOM stats", true);
    return;
  }

  await loadBlockedActivity();
});

activitySourceFilter.addEventListener("change", renderDetailedStats);
activitySearchInput.addEventListener("input", renderDetailedStats);

Promise.all([loadRulesetSettings(), loadAllowlist(), loadBlockedActivity()]).catch((error) => {
  setStatus(String(error), true);
  setRulesetStatus(String(error), true);
  setActivityStatus(String(error), true);
});
