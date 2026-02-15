const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const STANDARD_RULES_PATH = path.join(ROOT, "rules_standard.json");
const STRICT_RULES_PATH = path.join(ROOT, "rules_strict.json");

const REQUIRED_STANDARD_DOMAINS = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "taboola.com",
  "outbrain.com"
];

const SAFE_DOMAINS = [
  "google.com",
  "github.com",
  "openai.com",
  "wikipedia.org",
  "mozilla.org"
];

const EXPECTED_RESOURCE_TYPES = [
  "font",
  "image",
  "media",
  "ping",
  "script",
  "stylesheet",
  "sub_frame",
  "xmlhttprequest"
].sort();

const SUBRESOURCE_TYPES = new Set([
  "sub_frame",
  "script",
  "image",
  "xmlhttprequest",
  "media",
  "font",
  "stylesheet",
  "ping",
  "other"
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeHostname(hostname) {
  if (!hostname) {
    return "";
  }

  const lower = hostname.toLowerCase();
  return lower.startsWith("www.") ? lower.slice(4) : lower;
}

function domainMatches(domain, candidate) {
  return domain === candidate || domain.endsWith(`.${candidate}`);
}

function parseDomainFromRule(rule, sourceName) {
  assert.equal(rule.action.type, "block", `${sourceName}: action.type must be block`);

  const condition = rule.condition || {};
  const urlFilter = String(condition.urlFilter || "");
  const match = urlFilter.match(/^\|\|([a-z0-9.-]+)\^$/i);
  assert.ok(match, `${sourceName}: invalid urlFilter format ${urlFilter}`);

  const resourceTypes = Array.isArray(condition.resourceTypes) ? condition.resourceTypes : [];
  const normalizedTypes = [...new Set(resourceTypes)].sort();
  assert.deepEqual(
    normalizedTypes,
    EXPECTED_RESOURCE_TYPES,
    `${sourceName}: invalid resourceTypes for ${urlFilter}`
  );

  const domain = normalizeHostname(match[1]);
  assert.ok(domain.includes("."), `${sourceName}: invalid domain ${domain}`);
  assert.ok(!domain.includes(".."), `${sourceName}: invalid domain ${domain}`);
  return domain;
}

function analyzeRules(rules, sourceName) {
  assert.ok(Array.isArray(rules), `${sourceName}: rules must be an array`);
  assert.ok(rules.length > 0, `${sourceName}: rules array must not be empty`);

  const seenIds = new Set();
  const domainSet = new Set();

  for (const rule of rules) {
    assert.equal(typeof rule.id, "number", `${sourceName}: rule.id must be number`);
    assert.ok(!seenIds.has(rule.id), `${sourceName}: duplicate rule id ${rule.id}`);
    seenIds.add(rule.id);

    const domain = parseDomainFromRule(rule, sourceName);
    domainSet.add(domain);
  }

  return {
    ids: seenIds,
    domains: domainSet
  };
}

function getDomainFromUrl(url) {
  const parsed = new URL(url);
  return normalizeHostname(parsed.hostname);
}

function isAllowlisted(domain, allowlist) {
  return allowlist.some((candidate) => domainMatches(domain, candidate));
}

function shouldBlockRequest({ mode, requestUrl, resourceType, initiatorUrl, allowlistDomains }) {
  const requestDomain = getDomainFromUrl(requestUrl);
  const allowlist = allowlistDomains.map(normalizeHostname).filter(Boolean);

  if (resourceType === "main_frame" && isAllowlisted(requestDomain, allowlist)) {
    return false;
  }

  if (SUBRESOURCE_TYPES.has(resourceType) && initiatorUrl) {
    const initiatorDomain = getDomainFromUrl(initiatorUrl);
    if (isAllowlisted(initiatorDomain, allowlist)) {
      return false;
    }
  }

  const candidateDomains = mode === "strict" ? ALL_BLOCKED_DOMAINS : STANDARD.domains;
  for (const blockedDomain of candidateDomains) {
    if (domainMatches(requestDomain, blockedDomain)) {
      return true;
    }
  }

  return false;
}

const standardRules = readJson(STANDARD_RULES_PATH);
const strictRules = readJson(STRICT_RULES_PATH);

const STANDARD = analyzeRules(standardRules, "rules_standard.json");
const STRICT = analyzeRules(strictRules, "rules_strict.json");

const ALL_BLOCKED_DOMAINS = new Set([...STANDARD.domains, ...STRICT.domains]);
const STRICT_ONLY_DOMAIN = [...STRICT.domains].find((domain) => !STANDARD.domains.has(domain));

test("standard rules include core ad domains", () => {
  for (const domain of REQUIRED_STANDARD_DOMAINS) {
    assert.ok(STANDARD.domains.has(domain), `missing standard domain: ${domain}`);
  }
});

test("strict rules materially expand coverage", () => {
  assert.ok(STRICT.domains.size >= 1000, "strict rules should contain at least 1000 domains");
  assert.ok(STRICT_ONLY_DOMAIN, "strict rules must include at least one strict-only domain");
});

test("safe first-party domains are not blocked", () => {
  for (const domain of SAFE_DOMAINS) {
    assert.ok(!ALL_BLOCKED_DOMAINS.has(domain), `safe domain is blocked: ${domain}`);
  }
});

test("strict mode blocks at least one domain not blocked by standard", () => {
  assert.ok(STRICT_ONLY_DOMAIN, "no strict-only domain found");

  const standardDecision = shouldBlockRequest({
    mode: "standard",
    requestUrl: `https://cdn.${STRICT_ONLY_DOMAIN}/asset.js`,
    resourceType: "script",
    initiatorUrl: "https://news.example.com/article",
    allowlistDomains: []
  });

  const strictDecision = shouldBlockRequest({
    mode: "strict",
    requestUrl: `https://cdn.${STRICT_ONLY_DOMAIN}/asset.js`,
    resourceType: "script",
    initiatorUrl: "https://news.example.com/article",
    allowlistDomains: []
  });

  assert.equal(standardDecision, false, "strict-only domain unexpectedly blocked in standard");
  assert.equal(strictDecision, true, "strict-only domain should be blocked in strict mode");
});

test("allowlist bypasses blocked subresource requests from allowlisted initiator", () => {
  const blockedWithoutAllowlist = shouldBlockRequest({
    mode: "standard",
    requestUrl: "https://ads.doubleclick.net/pagead/ad.js",
    resourceType: "script",
    initiatorUrl: "https://news.example.com/story",
    allowlistDomains: []
  });

  const allowedWithAllowlist = shouldBlockRequest({
    mode: "standard",
    requestUrl: "https://ads.doubleclick.net/pagead/ad.js",
    resourceType: "script",
    initiatorUrl: "https://news.example.com/story",
    allowlistDomains: ["example.com"]
  });

  assert.equal(blockedWithoutAllowlist, true, "request should be blocked without allowlist");
  assert.equal(allowedWithAllowlist, false, "request should bypass blocking with allowlist");
});

test("allowlisted main frame is not blocked", () => {
  const isBlocked = shouldBlockRequest({
    mode: "standard",
    requestUrl: "https://sub.example.com/",
    resourceType: "main_frame",
    initiatorUrl: "",
    allowlistDomains: ["example.com"]
  });

  assert.equal(isBlocked, false, "allowlisted main_frame should not be blocked");
});
