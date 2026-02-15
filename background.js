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
  optionalRulesets: {
    annoyances: false,
    regional: false
  }
};

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

let dynamicRulesUpdateQueue = Promise.resolve();

function runDynamicRulesUpdate(task) {
  dynamicRulesUpdateQueue = dynamicRulesUpdateQueue
    .then(task)
    .catch((error) => {
      console.error("Dynamic rules update failed:", error);
      throw error;
    });

  return dynamicRulesUpdateQueue;
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

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_DEFAULTS);
  return {
    mode: stored.mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD,
    allowlist: sanitizeAllowlist(stored.allowlist),
    paused: sanitizePaused(stored.paused),
    cookieHandlingEnabled: sanitizeCookieHandlingEnabled(stored.cookieHandlingEnabled),
    xAdsBlockingEnabled: sanitizeXAdsBlockingEnabled(stored.xAdsBlockingEnabled),
    xCompatibilityModeEnabled: sanitizeXCompatibilityModeEnabled(stored.xCompatibilityModeEnabled),
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
        initiatorDomains: [domain],
        resourceTypes: SUBRESOURCE_TYPES
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
        initiatorDomains: X_COMPAT_DOMAINS,
        resourceTypes: SUBRESOURCE_TYPES
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
  await chrome.storage.local.set(settings);
  await chrome.storage.local.remove(["counterDayKey", "todayBlocked", "blockedActivity"]);
}

async function handleGetState(url) {
  const settings = await getSettings();
  const domain = normalizeDomain(url || "");

  return {
    mode: settings.mode,
    paused: settings.paused,
    optionalRulesets: settings.optionalRulesets,
    cookieHandlingEnabled: settings.cookieHandlingEnabled,
    xAdsBlockingEnabled: settings.xAdsBlockingEnabled,
    xCompatibilityModeEnabled: settings.xCompatibilityModeEnabled,
    domain,
    siteAllowed: domain ? settings.allowlist.includes(domain) : false,
    allowlistCount: settings.allowlist.length
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
    xCompatibilityModeEnabled: settings.xCompatibilityModeEnabled
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
