const MODE_STANDARD = "standard";
const MODE_STRICT = "strict";
const STANDARD_RULESET_ID = "standard_rules";
const STRICT_RULESET_ID = "strict_rules";
const ALLOWLIST_RULE_BASE = 100000;
const ALLOWLIST_RULE_MAX = 120000;
const MAX_ALLOWLIST_DOMAINS = 2000;

const SETTINGS_DEFAULTS = {
  mode: MODE_STANDARD,
  allowlist: []
};

const COUNTERS_DEFAULTS = {
  counterDayKey: "",
  todayBlocked: 0
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

let todayBlocked = 0;
let sessionBlocked = 0;
let counterDayKey = "";
let persistTimer = null;

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

    const withoutWww = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return withoutWww;
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
  const mode = stored.mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD;
  const allowlist = sanitizeAllowlist(stored.allowlist);
  return { mode, allowlist };
}

async function setAllowlist(domains) {
  const allowlist = sanitizeAllowlist(domains);
  await chrome.storage.local.set({ allowlist });
  await applyAllowlist(allowlist);
  return allowlist;
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

  const addRules = buildAllowlistRules(domains);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function syncFromStorage() {
  const settings = await getSettings();
  await applyMode(settings.mode);
  await applyAllowlist(settings.allowlist);
}

async function initializeDefaults() {
  const settings = await getSettings();
  const counterState = await chrome.storage.local.get(COUNTERS_DEFAULTS);

  counterDayKey = counterState.counterDayKey || getDayKey();
  todayBlocked = Number.isFinite(counterState.todayBlocked) ? counterState.todayBlocked : 0;
  maybeResetDailyCounter();

  await chrome.storage.local.set({
    ...settings,
    counterDayKey,
    todayBlocked
  });
}

function incrementBlockedCounters() {
  maybeResetDailyCounter();
  todayBlocked += 1;
  sessionBlocked += 1;
  scheduleCounterPersist();
}

function shouldCountMatchedRule(info) {
  const rulesetId = info && info.rule ? info.rule.rulesetId : "";
  return rulesetId === STANDARD_RULESET_ID || rulesetId === STRICT_RULESET_ID;
}

async function handleGetState(url) {
  maybeResetDailyCounter();
  const settings = await getSettings();
  const domain = normalizeDomain(url || "");
  const siteAllowed = domain ? settings.allowlist.includes(domain) : false;

  return {
    mode: settings.mode,
    domain,
    siteAllowed,
    allowlistCount: settings.allowlist.length,
    sessionBlocked,
    todayBlocked,
    countersAvailable: countersAvailable()
  };
}

async function handleSetMode(mode) {
  const normalizedMode = mode === MODE_STRICT ? MODE_STRICT : MODE_STANDARD;
  await chrome.storage.local.set({ mode: normalizedMode });
  await applyMode(normalizedMode);
  return { mode: normalizedMode };
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
      incrementBlockedCounters();
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    if (!message || typeof message !== "object") {
      return { ok: false, error: "Invalid message" };
    }

    if (message.type === "GET_STATE") {
      const state = await handleGetState(message.url);
      return { ok: true, ...state };
    }

    if (message.type === "SET_MODE") {
      const state = await handleSetMode(message.mode);
      return { ok: true, ...state };
    }

    if (message.type === "TOGGLE_SITE") {
      const state = await handleToggleSite(message.url);
      return { ok: !state.error, ...state };
    }

    if (message.type === "GET_ALLOWLIST") {
      const state = await handleGetAllowlist();
      return { ok: true, ...state };
    }

    if (message.type === "REMOVE_ALLOWLIST_DOMAIN") {
      const state = await handleRemoveAllowlistDomain(message.domain);
      return { ok: !state.error, ...state };
    }

    if (message.type === "CLEAR_ALLOWLIST") {
      const state = await handleClearAllowlist();
      return { ok: true, ...state };
    }

    return { ok: false, error: "Unknown message type" };
  };

  run()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));

  return true;
});
