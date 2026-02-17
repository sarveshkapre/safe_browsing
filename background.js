const MODE_STANDARD = "standard";
const MODE_STRICT = "strict";

const STANDARD_RULESET_ID = "standard_rules";
const STRICT_RULESET_ID = "strict_rules";
const ANNOYANCES_RULESET_ID = "annoyances_rules";
const REGIONAL_RULESET_ID = "regional_rules";

const OPTIONAL_RULESETS = {
  annoyances: ANNOYANCES_RULESET_ID,
  regional: REGIONAL_RULESET_ID
};

const OPTIONAL_RULESET_KEYS = Object.keys(OPTIONAL_RULESETS);

const ALLOWLIST_RULE_BASE = 100000;
const ALLOWLIST_RULE_MAX = 120000;
const MAX_ALLOWLIST_DOMAINS = 2000;
const X_COMPAT_MAIN_RULE_ID = 130000;
const X_COMPAT_SUBRESOURCE_RULE_ID = 130001;
const X_COMPAT_RULE_IDS = [X_COMPAT_MAIN_RULE_ID, X_COMPAT_SUBRESOURCE_RULE_ID];
const X_COMPAT_DOMAINS = ["x.com", "twitter.com"];

const SETTINGS_DEFAULTS = {
  mode: MODE_STANDARD,
  allowlist: [],
  paused: false,
  cookieHandlingEnabled: true,
  xAdsBlockingEnabled: true,
  xCompatibilityModeEnabled: true,
  statsRetentionDays: 30,
  optionalRulesets: {
    annoyances: false,
    regional: false
  }
};

const RULESET_IDS_FOR_STATS = new Set([
  STANDARD_RULESET_ID,
  STRICT_RULESET_ID,
  ANNOYANCES_RULESET_ID,
  REGIONAL_RULESET_ID
]);

const BLOCKED_ACTIVITY_MAX = 1000;
const MIN_STATS_RETENTION_DAYS = 1;
const MAX_STATS_RETENTION_DAYS = 90;
const STATS_DEFAULTS = {
  statsDayKey: "",
  todayBlocked: 0,
  todayXAdsHidden: 0,
  blockedActivity: []
};

let dynamicRulesUpdateQueue = Promise.resolve();
let statsDayKey = "";
let todayBlocked = 0;
let todayXAdsHidden = 0;
let sessionBlocked = 0;
let sessionXAdsHidden = 0;
let blockedActivity = [];
let statsRetentionDays = SETTINGS_DEFAULTS.statsRetentionDays;
let persistStatsTimer = null;

function runDynamicRulesUpdate(task) {
  const run = dynamicRulesUpdateQueue.then(() => task());
  dynamicRulesUpdateQueue = run.catch((error) => {
    console.error("Dynamic rules update failed:", error);
  });
  return run;
}

function normalizeDomain(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  const candidate = input.includes("://") ? input : `https://${input}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname === "localhost") {
      return "";
    }

    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

function normalizeUrl(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString().slice(0, 1200);
  } catch {
    return "";
  }
}

function domainFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) {
      return "";
    }
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return "";
  }
}

function getDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeBlockedActivity(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const out = [];
  for (const entry of input) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const timestamp = Number(entry.timestamp);
    const source = entry.source === "x_dom" ? "x_dom" : "network";
    const blockedDomain = normalizeDomain(entry.blockedDomain || "");
    const pageDomain = normalizeDomain(entry.pageDomain || "");
    const requestUrl = normalizeUrl(entry.requestUrl || "");
    const rulesetId = typeof entry.rulesetId === "string" ? entry.rulesetId.slice(0, 80) : "";
    const resourceType = typeof entry.resourceType === "string" ? entry.resourceType.slice(0, 40) : "";

    if (!Number.isFinite(timestamp) || (!blockedDomain && !requestUrl && !pageDomain)) {
      continue;
    }

    out.push({
      timestamp,
      source,
      blockedDomain,
      pageDomain,
      requestUrl,
      rulesetId,
      resourceType
    });

    if (out.length >= BLOCKED_ACTIVITY_MAX) {
      break;
    }
  }

  out.sort((left, right) => right.timestamp - left.timestamp);
  return out.slice(0, BLOCKED_ACTIVITY_MAX);
}

function pruneBlockedActivityByRetention(entries, retentionDays) {
  const days = sanitizeStatsRetentionDays(retentionDays);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((entry) => Number(entry.timestamp) >= cutoff).slice(0, BLOCKED_ACTIVITY_MAX);
}

function maybeResetDailyStats() {
  const current = getDayKey();
  if (statsDayKey === current) {
    return;
  }

  statsDayKey = current;
  todayBlocked = 0;
  todayXAdsHidden = 0;
  scheduleStatsPersist();
}

function scheduleStatsPersist() {
  if (persistStatsTimer) {
    clearTimeout(persistStatsTimer);
  }

  persistStatsTimer = setTimeout(() => {
    persistStatsTimer = null;
    chrome.storage.local
      .set({
        statsDayKey,
        todayBlocked,
        todayXAdsHidden,
        blockedActivity
      })
      .catch((error) => console.error("Failed to persist stats:", error));
  }, 500);
}

function recordActivityEntry(entry) {
  blockedActivity.unshift(entry);
  blockedActivity = pruneBlockedActivityByRetention(blockedActivity, statsRetentionDays);
  scheduleStatsPersist();
}

function incrementNetworkBlocked(entry) {
  maybeResetDailyStats();
  todayBlocked += 1;
  sessionBlocked += 1;
  recordActivityEntry(entry);
}

function incrementXAdsHidden(entry) {
  maybeResetDailyStats();
  todayXAdsHidden += 1;
  sessionXAdsHidden += 1;
  recordActivityEntry(entry);
}

function sanitizeAllowlist(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set();
  const out = [];

  for (const value of input) {
    const domain = normalizeDomain(value);
    if (!domain || seen.has(domain)) {
      continue;
    }

    seen.add(domain);
    out.push(domain);

    if (out.length >= MAX_ALLOWLIST_DOMAINS) {
      break;
    }
  }

  return out.sort();
}

function sanitizeOptionalRulesets(input) {
  const source = input && typeof input === "object" ? input : {};
  const output = {};

  for (const key of OPTIONAL_RULESET_KEYS) {
    output[key] = source[key] === true;
  }

  return output;
}

function sanitizeCookieHandlingEnabled(input) {
  return input !== false;
}

function sanitizePaused(input) {
  return input === true;
}

function sanitizeXAdsBlockingEnabled(input) {
  return input !== false;
}

function sanitizeXCompatibilityModeEnabled(input) {
  return input !== false;
}

function sanitizeStatsRetentionDays(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return SETTINGS_DEFAULTS.statsRetentionDays;
  }
  return Math.max(MIN_STATS_RETENTION_DAYS, Math.min(MAX_STATS_RETENTION_DAYS, Math.floor(value)));
}

function isNetworkDebugAvailable() {
  return Boolean(chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug);
}

async function getDnrCapacitySnapshot() {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr) {
    return null;
  }

  let availableStaticRules = null;
  if (typeof dnr.getAvailableStaticRuleCount === "function") {
    try {
      availableStaticRules = await dnr.getAvailableStaticRuleCount();
    } catch {
      availableStaticRules = null;
    }
  }

  return {
    availableStaticRules,
    guaranteedMinimumStaticRules: Number.isFinite(dnr.GUARANTEED_MINIMUM_STATIC_RULES)
      ? dnr.GUARANTEED_MINIMUM_STATIC_RULES
      : null,
    maxEnabledStaticRulesets: Number.isFinite(dnr.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS)
      ? dnr.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS
      : null,
    maxDynamicRules: Number.isFinite(dnr.MAX_NUMBER_OF_DYNAMIC_RULES)
      ? dnr.MAX_NUMBER_OF_DYNAMIC_RULES
      : null
  };
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_DEFAULTS);
  return {
    mode: stored.mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD,
    allowlist: sanitizeAllowlist(stored.allowlist),
    paused: sanitizePaused(stored.paused),
    cookieHandlingEnabled: sanitizeCookieHandlingEnabled(stored.cookieHandlingEnabled),
    xAdsBlockingEnabled: sanitizeXAdsBlockingEnabled(stored.xAdsBlockingEnabled),
    xCompatibilityModeEnabled: sanitizeXCompatibilityModeEnabled(stored.xCompatibilityModeEnabled),
    statsRetentionDays: sanitizeStatsRetentionDays(stored.statsRetentionDays),
    optionalRulesets: sanitizeOptionalRulesets(stored.optionalRulesets)
  };
}

async function setAllowlist(domains) {
  const allowlist = sanitizeAllowlist(domains);
  await chrome.storage.local.set({ allowlist });
  await applyAllowlist(allowlist);
  return allowlist;
}

async function setOptionalRulesets(optionalRulesets) {
  const sanitized = sanitizeOptionalRulesets(optionalRulesets);
  await chrome.storage.local.set({ optionalRulesets: sanitized });
  await applyOptionalRulesets(sanitized);
  return sanitized;
}

async function applyMode(mode) {
  const enableRulesetIds = [STANDARD_RULESET_ID];
  const disableRulesetIds = [];

  if (mode === MODE_STRICT) {
    enableRulesetIds.push(STRICT_RULESET_ID);
  } else {
    disableRulesetIds.push(STRICT_RULESET_ID);
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });
}

async function applyPauseState(paused) {
  if (paused) {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [],
      disableRulesetIds: [
        STANDARD_RULESET_ID,
        STRICT_RULESET_ID,
        ANNOYANCES_RULESET_ID,
        REGIONAL_RULESET_ID
      ]
    });
    return;
  }

  const settings = await getSettings();
  await applyMode(settings.mode);
  await applyOptionalRulesets(settings.optionalRulesets);
}

async function applyOptionalRulesets(optionalRulesets) {
  const sanitized = sanitizeOptionalRulesets(optionalRulesets);
  const enableRulesetIds = [];
  const disableRulesetIds = [];

  for (const key of OPTIONAL_RULESET_KEYS) {
    const rulesetId = OPTIONAL_RULESETS[key];
    if (sanitized[key]) {
      enableRulesetIds.push(rulesetId);
    } else {
      disableRulesetIds.push(rulesetId);
    }
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });
}

function buildAllowlistRules(domains) {
  const rules = [];

  for (let i = 0; i < domains.length; i += 1) {
    const domain = domains[i];
    const mainFrameRuleId = ALLOWLIST_RULE_BASE + i * 2;
    const subresourceRuleId = mainFrameRuleId + 1;

    rules.push({
      id: mainFrameRuleId,
      priority: 10000,
      action: { type: "allow" },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame"]
      }
    });

    rules.push({
      id: subresourceRuleId,
      priority: 10000,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: [domain],
        resourceTypes: ["main_frame", "sub_frame"]
      }
    });
  }

  return rules;
}

function buildXCompatibilityRules() {
  return [
    {
      id: X_COMPAT_MAIN_RULE_ID,
      priority: 10001,
      action: { type: "allow" },
      condition: {
        requestDomains: X_COMPAT_DOMAINS,
        resourceTypes: ["main_frame"]
      }
    },
    {
      id: X_COMPAT_SUBRESOURCE_RULE_ID,
      priority: 10001,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: X_COMPAT_DOMAINS,
        resourceTypes: ["main_frame", "sub_frame"]
      }
    }
  ];
}

async function applyAllowlist(domains) {
  await runDynamicRulesUpdate(async () => {
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = dynamicRules
      .map((rule) => rule.id)
      .filter((id) => id >= ALLOWLIST_RULE_BASE && id < ALLOWLIST_RULE_MAX);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: buildAllowlistRules(domains)
    });
  });
}

async function applyXCompatibilityRules(enabled) {
  await runDynamicRulesUpdate(async () => {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: X_COMPAT_RULE_IDS,
      addRules: enabled ? buildXCompatibilityRules() : []
    });
  });
}

async function syncFromStorage() {
  const settings = await getSettings();
  await applyPauseState(settings.paused);
  await applyAllowlist(settings.allowlist);
  await applyXCompatibilityRules(settings.xCompatibilityModeEnabled);
}

async function initializeDefaults() {
  const settings = await getSettings();
  const storedStats = await chrome.storage.local.get(STATS_DEFAULTS);
  statsRetentionDays = settings.statsRetentionDays;

  statsDayKey = typeof storedStats.statsDayKey === "string" ? storedStats.statsDayKey : "";
  todayBlocked = Number.isFinite(storedStats.todayBlocked) ? storedStats.todayBlocked : 0;
  todayXAdsHidden = Number.isFinite(storedStats.todayXAdsHidden) ? storedStats.todayXAdsHidden : 0;
  blockedActivity = pruneBlockedActivityByRetention(
    sanitizeBlockedActivity(storedStats.blockedActivity),
    statsRetentionDays
  );
  maybeResetDailyStats();

  await chrome.storage.local.set(settings);
  await chrome.storage.local.set({
    statsDayKey,
    todayBlocked,
    todayXAdsHidden,
    blockedActivity
  });
  await chrome.storage.local.remove(["counterDayKey"]);
}

function collectTopCounts(items, limit = 8) {
  const map = new Map();

  for (const item of items) {
    const key = item || "";
    if (!key) {
      continue;
    }
    map.set(key, (map.get(key) || 0) + 1);
  }

  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildStatsSummary() {
  return {
    sessionBlocked,
    todayBlocked,
    sessionXAdsHidden,
    todayXAdsHidden,
    topDomains: collectTopCounts(blockedActivity.map((entry) => entry.blockedDomain || entry.pageDomain)),
    topUrls: collectTopCounts(blockedActivity.map((entry) => entry.requestUrl), 12)
  };
}

function handleRuleMatchedDebug(info) {
  const rule = info && info.rule ? info.rule : {};
  const request = info && info.request ? info.request : {};
  const rulesetId = typeof rule.rulesetId === "string" ? rule.rulesetId : "";
  if (!RULESET_IDS_FOR_STATS.has(rulesetId)) {
    return;
  }

  const requestUrl = normalizeUrl(request.url || "");
  const blockedDomain = domainFromUrl(requestUrl);
  const pageUrl = normalizeUrl(request.initiator || request.documentUrl || "");
  const pageDomain = domainFromUrl(pageUrl);
  const resourceType = typeof request.type === "string" ? request.type : "";

  incrementNetworkBlocked({
    timestamp: Date.now(),
    source: "network",
    blockedDomain,
    pageDomain,
    requestUrl,
    rulesetId,
    resourceType
  });
}

async function handleReportXAdHidden(payload) {
  const pageUrl = normalizeUrl(payload && payload.pageUrl ? payload.pageUrl : "");
  const adUrl = normalizeUrl(payload && payload.adUrl ? payload.adUrl : "");
  const pageDomain = domainFromUrl(pageUrl);
  const blockedDomain = domainFromUrl(adUrl) || pageDomain;

  incrementXAdsHidden({
    timestamp: Date.now(),
    source: "x_dom",
    blockedDomain,
    pageDomain,
    requestUrl: adUrl || pageUrl,
    rulesetId: "x_dom_ads",
    resourceType: "dom"
  });
}

async function handleGetBlockedActivity(limitInput) {
  maybeResetDailyStats();
  const limit = Number(limitInput);
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(BLOCKED_ACTIVITY_MAX, Math.floor(limit)))
    : 200;
  const dnrCapacity = await getDnrCapacitySnapshot();

  return {
    blockedActivity: blockedActivity.slice(0, normalizedLimit),
    blockedActivityCount: blockedActivity.length,
    networkDebugAvailable: isNetworkDebugAvailable(),
    dnrCapacity,
    ...buildStatsSummary()
  };
}

async function handleClearBlockedActivity(targetInput) {
  const target = typeof targetInput === "string" ? targetInput : "all";

  if (target === "network") {
    blockedActivity = blockedActivity.filter((entry) => entry.source !== "network");
    sessionBlocked = 0;
    todayBlocked = 0;
  } else if (target === "x_dom") {
    blockedActivity = blockedActivity.filter((entry) => entry.source !== "x_dom");
    sessionXAdsHidden = 0;
    todayXAdsHidden = 0;
  } else {
    blockedActivity = [];
    sessionBlocked = 0;
    sessionXAdsHidden = 0;
    maybeResetDailyStats();
    todayBlocked = 0;
    todayXAdsHidden = 0;
  }

  await chrome.storage.local.set({
    statsDayKey,
    todayBlocked,
    todayXAdsHidden,
    blockedActivity
  });
  return {
    blockedActivity: [],
    blockedActivityCount: 0,
    ...buildStatsSummary()
  };
}

async function handleGetState(url) {
  maybeResetDailyStats();
  const settings = await getSettings();
  const domain = normalizeDomain(url || "");
  const summary = buildStatsSummary();
  const dnrCapacity = await getDnrCapacitySnapshot();

  return {
    mode: settings.mode,
    paused: settings.paused,
    optionalRulesets: settings.optionalRulesets,
    cookieHandlingEnabled: settings.cookieHandlingEnabled,
    xAdsBlockingEnabled: settings.xAdsBlockingEnabled,
    xCompatibilityModeEnabled: settings.xCompatibilityModeEnabled,
    statsRetentionDays: settings.statsRetentionDays,
    domain,
    siteAllowed: domain ? settings.allowlist.includes(domain) : false,
    allowlistCount: settings.allowlist.length,
    sessionBlocked: summary.sessionBlocked,
    todayBlocked: summary.todayBlocked,
    sessionXAdsHidden: summary.sessionXAdsHidden,
    todayXAdsHidden: summary.todayXAdsHidden,
    blockedActivityCount: blockedActivity.length,
    topBlockedDomain: Array.isArray(summary.topDomains) && summary.topDomains.length
      ? summary.topDomains[0].value
      : "",
    networkDebugAvailable: isNetworkDebugAvailable(),
    dnrCapacity
  };
}

async function handleSetMode(mode) {
  const normalizedMode = mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD;
  const settings = await getSettings();
  await chrome.storage.local.set({ mode: normalizedMode });
  if (!settings.paused) {
    await applyMode(normalizedMode);
  }
  return { mode: normalizedMode };
}

async function handleSetPaused(pausedInput) {
  const paused = sanitizePaused(pausedInput);
  await chrome.storage.local.set({ paused });
  await applyPauseState(paused);
  return { paused };
}

async function handleSetCookieHandling(enabled) {
  const cookieHandlingEnabled = sanitizeCookieHandlingEnabled(enabled);
  await chrome.storage.local.set({ cookieHandlingEnabled });
  return { cookieHandlingEnabled };
}

async function handleSetXAdsBlocking(enabled) {
  const xAdsBlockingEnabled = sanitizeXAdsBlockingEnabled(enabled);
  await chrome.storage.local.set({ xAdsBlockingEnabled });
  return { xAdsBlockingEnabled };
}

async function handleSetXCompatibilityMode(enabled) {
  const xCompatibilityModeEnabled = sanitizeXCompatibilityModeEnabled(enabled);
  await chrome.storage.local.set({ xCompatibilityModeEnabled });
  await applyXCompatibilityRules(xCompatibilityModeEnabled);
  return { xCompatibilityModeEnabled };
}

async function handleSetStatsRetentionDays(daysInput) {
  const nextRetentionDays = sanitizeStatsRetentionDays(daysInput);
  statsRetentionDays = nextRetentionDays;
  blockedActivity = pruneBlockedActivityByRetention(blockedActivity, statsRetentionDays);
  scheduleStatsPersist();
  await chrome.storage.local.set({ statsRetentionDays });
  return { statsRetentionDays };
}

async function handleSetOptionalRuleset(ruleset, enabled) {
  if (!OPTIONAL_RULESETS[ruleset]) {
    return { optionalRulesets: SETTINGS_DEFAULTS.optionalRulesets, error: "Unknown ruleset" };
  }

  const settings = await getSettings();
  const next = {
    ...settings.optionalRulesets,
    [ruleset]: enabled === true
  };

  let optionalRulesets;
  if (settings.paused) {
    optionalRulesets = sanitizeOptionalRulesets(next);
    await chrome.storage.local.set({ optionalRulesets });
  } else {
    optionalRulesets = await setOptionalRulesets(next);
  }

  return { optionalRulesets, error: "" };
}

async function handleToggleSite(url) {
  const domain = normalizeDomain(url || "");
  if (!domain) {
    return {
      domain: "",
      siteAllowed: false,
      allowlistCount: 0,
      error: "Unsupported tab URL"
    };
  }

  const settings = await getSettings();
  const set = new Set(settings.allowlist);

  if (set.has(domain)) {
    set.delete(domain);
  } else {
    set.add(domain);
  }

  const allowlist = await setAllowlist(Array.from(set));
  return {
    domain,
    siteAllowed: allowlist.includes(domain),
    allowlistCount: allowlist.length,
    error: ""
  };
}

async function handleGetAllowlist() {
  const settings = await getSettings();
  return {
    allowlist: settings.allowlist,
    allowlistCount: settings.allowlist.length
  };
}

async function handleGetRulesetSettings() {
  const settings = await getSettings();
  return {
    mode: settings.mode,
    paused: settings.paused,
    optionalRulesets: settings.optionalRulesets,
    cookieHandlingEnabled: settings.cookieHandlingEnabled,
    xAdsBlockingEnabled: settings.xAdsBlockingEnabled,
    xCompatibilityModeEnabled: settings.xCompatibilityModeEnabled,
    statsRetentionDays: settings.statsRetentionDays
  };
}

async function handleRemoveAllowlistDomain(domainInput) {
  const domain = normalizeDomain(domainInput || "");
  if (!domain) {
    return { allowlist: [], allowlistCount: 0, error: "Invalid domain" };
  }

  const settings = await getSettings();
  const allowlist = await setAllowlist(settings.allowlist.filter((item) => item !== domain));
  return { allowlist, allowlistCount: allowlist.length, error: "" };
}

async function handleClearAllowlist() {
  const allowlist = await setAllowlist([]);
  return { allowlist, allowlistCount: allowlist.length };
}

chrome.runtime.onInstalled.addListener(() => {
  initializeDefaults()
    .then(syncFromStorage)
    .catch((error) => console.error("Initialization failed:", error));
});

chrome.runtime.onStartup.addListener(() => {
  initializeDefaults()
    .then(syncFromStorage)
    .catch((error) => console.error("Startup sync failed:", error));
});

if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(handleRuleMatchedDebug);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (!message || typeof message !== "object") {
      return { ok: false, error: "Invalid message" };
    }

    if (message.type === "GET_STATE") {
      return { ok: true, ...(await handleGetState(message.url)) };
    }

    if (message.type === "SET_MODE") {
      return { ok: true, ...(await handleSetMode(message.mode)) };
    }

    if (message.type === "SET_PAUSED") {
      return { ok: true, ...(await handleSetPaused(message.paused)) };
    }

    if (message.type === "SET_COOKIE_HANDLING") {
      return { ok: true, ...(await handleSetCookieHandling(message.enabled)) };
    }

    if (message.type === "SET_X_ADS_BLOCKING") {
      return { ok: true, ...(await handleSetXAdsBlocking(message.enabled)) };
    }

    if (message.type === "SET_X_COMPATIBILITY_MODE") {
      return { ok: true, ...(await handleSetXCompatibilityMode(message.enabled)) };
    }

    if (message.type === "SET_STATS_RETENTION_DAYS") {
      return { ok: true, ...(await handleSetStatsRetentionDays(message.days)) };
    }

    if (message.type === "SET_OPTIONAL_RULESET") {
      const state = await handleSetOptionalRuleset(message.ruleset, message.enabled);
      return { ok: !state.error, ...state };
    }

    if (message.type === "TOGGLE_SITE") {
      const state = await handleToggleSite(message.url);
      return { ok: !state.error, ...state };
    }

    if (message.type === "GET_ALLOWLIST") {
      return { ok: true, ...(await handleGetAllowlist()) };
    }

    if (message.type === "GET_BLOCKED_ACTIVITY") {
      return { ok: true, ...(await handleGetBlockedActivity(message.limit)) };
    }

    if (message.type === "CLEAR_BLOCKED_ACTIVITY") {
      return { ok: true, ...(await handleClearBlockedActivity(message.target)) };
    }

    if (message.type === "REPORT_X_AD_HIDDEN") {
      await handleReportXAdHidden(message);
      return { ok: true };
    }

    if (message.type === "GET_RULESET_SETTINGS") {
      return { ok: true, ...(await handleGetRulesetSettings()) };
    }

    if (message.type === "REMOVE_ALLOWLIST_DOMAIN") {
      const state = await handleRemoveAllowlistDomain(message.domain);
      return { ok: !state.error, ...state };
    }

    if (message.type === "CLEAR_ALLOWLIST") {
      return { ok: true, ...(await handleClearAllowlist()) };
    }

    return { ok: false, error: "Unknown message type" };
  };

  run()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
