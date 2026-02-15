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

const SETTINGS_DEFAULTS = {
  mode: MODE_STANDARD,
  allowlist: [],
  cookieHandlingEnabled: true,
  xAdsHidingEnabled: true,
  optionalRulesets: {
    annoyances: false,
    regional: false
  }
};

const COUNTERS_DEFAULTS = {
  counterDayKey: "",
  todayBlocked: 0
};

const BLOCKED_ACTIVITY_DEFAULTS = {
  blockedActivity: []
};

const BLOCKED_ACTIVITY_MAX = 200;

const SUBRESOURCE_TYPES = [
  "sub_frame",
  "script",
  "image",
  "xmlhttprequest",
  "media",
  "font",
  "stylesheet",
  "ping",
  "other"
];

let todayBlocked = 0;
let sessionBlocked = 0;
let counterDayKey = "";
let persistTimer = null;
let blockedActivity = [];
let blockedActivityPersistTimer = null;

function getDayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scheduleCounterPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    chrome.storage.local
      .set({ counterDayKey, todayBlocked })
      .catch((error) => console.error("Failed to persist counters:", error));
  }, 500);
}

function scheduleBlockedActivityPersist() {
  if (blockedActivityPersistTimer) {
    clearTimeout(blockedActivityPersistTimer);
  }

  blockedActivityPersistTimer = setTimeout(() => {
    blockedActivityPersistTimer = null;
    chrome.storage.local
      .set({ blockedActivity })
      .catch((error) => console.error("Failed to persist blocked activity:", error));
  }, 700);
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

function sanitizeBlockedActivity(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const out = [];
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const timestamp = Number(item.timestamp);
    const blockedDomain = normalizeDomain(item.blockedDomain || "");
    const pageDomain = normalizeDomain(item.pageDomain || "");
    const requestUrl = typeof item.requestUrl === "string" ? item.requestUrl : "";
    const rulesetId = typeof item.rulesetId === "string" ? item.rulesetId : "";
    const resourceType = typeof item.resourceType === "string" ? item.resourceType : "";

    if (!Number.isFinite(timestamp) || (!blockedDomain && !requestUrl)) {
      continue;
    }

    out.push({
      timestamp,
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

function sanitizeXAdsHidingEnabled(input) {
  return input !== false;
}

function countersAvailable() {
  return Boolean(chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug);
}

function maybeResetDailyCounter() {
  const todayKey = getDayKey();
  if (counterDayKey !== todayKey) {
    counterDayKey = todayKey;
    todayBlocked = 0;
    scheduleCounterPersist();
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_DEFAULTS);
  return {
    mode: stored.mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD,
    allowlist: sanitizeAllowlist(stored.allowlist),
    cookieHandlingEnabled: sanitizeCookieHandlingEnabled(stored.cookieHandlingEnabled),
    xAdsHidingEnabled: sanitizeXAdsHidingEnabled(stored.xAdsHidingEnabled),
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
        initiatorDomains: [domain],
        resourceTypes: SUBRESOURCE_TYPES
      }
    });
  }

  return rules;
}

async function applyAllowlist(domains) {
  const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = dynamicRules
    .map((rule) => rule.id)
    .filter((id) => id >= ALLOWLIST_RULE_BASE && id < ALLOWLIST_RULE_MAX);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: buildAllowlistRules(domains)
  });
}

async function syncFromStorage() {
  const settings = await getSettings();
  await applyMode(settings.mode);
  await applyOptionalRulesets(settings.optionalRulesets);
  await applyAllowlist(settings.allowlist);
}

async function initializeDefaults() {
  const settings = await getSettings();
  const counterState = await chrome.storage.local.get(COUNTERS_DEFAULTS);
  const blockedActivityState = await chrome.storage.local.get(BLOCKED_ACTIVITY_DEFAULTS);

  counterDayKey = counterState.counterDayKey || getDayKey();
  todayBlocked = Number.isFinite(counterState.todayBlocked) ? counterState.todayBlocked : 0;
  blockedActivity = sanitizeBlockedActivity(blockedActivityState.blockedActivity);
  maybeResetDailyCounter();

  await chrome.storage.local.set({
    ...settings,
    counterDayKey,
    todayBlocked,
    blockedActivity
  });
}

function recordBlockedActivity(info) {
  const request = info && info.request ? info.request : {};
  const rule = info && info.rule ? info.rule : {};

  const requestUrl = typeof request.url === "string" ? request.url : "";
  const blockedDomain = domainFromUrl(requestUrl);
  if (!blockedDomain) {
    return;
  }

  const pageDomain = domainFromUrl(request.initiator || request.documentUrl || "");
  const rulesetId = typeof rule.rulesetId === "string" ? rule.rulesetId : "";
  const resourceType = typeof request.type === "string" ? request.type : "";

  blockedActivity.unshift({
    timestamp: Date.now(),
    blockedDomain,
    pageDomain,
    requestUrl,
    rulesetId,
    resourceType
  });

  if (blockedActivity.length > BLOCKED_ACTIVITY_MAX) {
    blockedActivity = blockedActivity.slice(0, BLOCKED_ACTIVITY_MAX);
  }

  scheduleBlockedActivityPersist();
}

function incrementBlockedCounters(info) {
  maybeResetDailyCounter();
  todayBlocked += 1;
  sessionBlocked += 1;
  scheduleCounterPersist();
  recordBlockedActivity(info);
}

function shouldCountMatchedRule(info) {
  const rulesetId = info && info.rule ? info.rule.rulesetId : "";
  return [
    STANDARD_RULESET_ID,
    STRICT_RULESET_ID,
    ANNOYANCES_RULESET_ID,
    REGIONAL_RULESET_ID
  ].includes(rulesetId);
}

async function handleGetState(url) {
  maybeResetDailyCounter();
  const settings = await getSettings();
  const domain = normalizeDomain(url || "");

  return {
    mode: settings.mode,
    optionalRulesets: settings.optionalRulesets,
    cookieHandlingEnabled: settings.cookieHandlingEnabled,
    xAdsHidingEnabled: settings.xAdsHidingEnabled,
    domain,
    siteAllowed: domain ? settings.allowlist.includes(domain) : false,
    allowlistCount: settings.allowlist.length,
    sessionBlocked,
    todayBlocked,
    blockedActivityCount: blockedActivity.length,
    countersAvailable: countersAvailable()
  };
}

async function handleSetMode(mode) {
  const normalizedMode = mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD;
  await chrome.storage.local.set({ mode: normalizedMode });
  await applyMode(normalizedMode);
  return { mode: normalizedMode };
}

async function handleSetCookieHandling(enabled) {
  const cookieHandlingEnabled = sanitizeCookieHandlingEnabled(enabled);
  await chrome.storage.local.set({ cookieHandlingEnabled });
  return { cookieHandlingEnabled };
}

async function handleSetXAdsHiding(enabled) {
  const xAdsHidingEnabled = sanitizeXAdsHidingEnabled(enabled);
  await chrome.storage.local.set({ xAdsHidingEnabled });
  return { xAdsHidingEnabled };
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

  const optionalRulesets = await setOptionalRulesets(next);
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

async function handleGetBlockedActivity(limitInput) {
  const limit = Number(limitInput);
  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(BLOCKED_ACTIVITY_MAX, Math.floor(limit)))
    : 100;

  return {
    blockedActivity: blockedActivity.slice(0, normalizedLimit),
    blockedActivityCount: blockedActivity.length
  };
}

async function handleClearBlockedActivity() {
  blockedActivity = [];
  await chrome.storage.local.set({ blockedActivity });
  return {
    blockedActivity,
    blockedActivityCount: 0
  };
}

async function handleGetRulesetSettings() {
  const settings = await getSettings();
  return {
    mode: settings.mode,
    optionalRulesets: settings.optionalRulesets,
    cookieHandlingEnabled: settings.cookieHandlingEnabled,
    xAdsHidingEnabled: settings.xAdsHidingEnabled
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

if (countersAvailable()) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (shouldCountMatchedRule(info)) {
      incrementBlockedCounters(info);
    }
  });
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

    if (message.type === "SET_COOKIE_HANDLING") {
      return { ok: true, ...(await handleSetCookieHandling(message.enabled)) };
    }

    if (message.type === "SET_X_ADS_HIDING") {
      return { ok: true, ...(await handleSetXAdsHiding(message.enabled)) };
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
      return { ok: true, ...(await handleClearBlockedActivity()) };
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
