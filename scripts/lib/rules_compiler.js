const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const https = require("https");

const DEFAULT_RESOURCE_TYPES = [
  "script",
  "image",
  "sub_frame",
  "xmlhttprequest",
  "media",
  "ping",
  "font",
  "stylesheet"
];

function resolvePath(rootDir, value) {
  if (!value) {
    return "";
  }

  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error(`Too many redirects: ${url}`));
      return;
    }

    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;

    const req = client.get(
      parsed,
      {
        headers: {
          "user-agent": "safe-browsing-rules-compiler/1.0"
        },
        timeout: 20000
      },
      (res) => {
        const status = res.statusCode || 0;

        if (status >= 300 && status < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, parsed).toString();
          res.resume();
          fetchText(redirectUrl, redirects + 1).then(resolve).catch(reject);
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} while fetching ${url}`));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      }
    );

    req.on("timeout", () => req.destroy(new Error(`Timeout while fetching ${url}`)));
    req.on("error", reject);
  });
}

function isValidDomain(domain) {
  if (!domain || domain.length > 253) {
    return false;
  }

  if (!/^[a-z0-9.-]+$/.test(domain)) {
    return false;
  }

  if (!domain.includes(".")) {
    return false;
  }

  if (domain.includes("..") || domain.startsWith(".") || domain.endsWith(".")) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return false;
  }

  for (const label of labels) {
    if (!label || label.length > 63) {
      return false;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return false;
    }
  }

  const tld = labels[labels.length - 1];
  return /^[a-z]{2,}$/.test(tld);
}

function normalizeDomain(value) {
  if (!value) {
    return "";
  }

  let domain = String(value).trim().toLowerCase();
  if (!domain) {
    return "";
  }

  if (domain.startsWith("*")) {
    return "";
  }

  if (domain.startsWith("www.")) {
    domain = domain.slice(4);
  }

  if (domain.startsWith(".")) {
    domain = domain.slice(1);
  }

  if (domain.endsWith(".")) {
    domain = domain.slice(0, -1);
  }

  if (!isValidDomain(domain)) {
    return "";
  }

  if (
    domain === "localhost" ||
    domain.endsWith(".localhost") ||
    domain.endsWith(".local")
  ) {
    return "";
  }

  return domain;
}

function extractDomainsFromLine(rawLine) {
  const line = String(rawLine || "").trim();
  if (!line) {
    return [];
  }

  if (line.startsWith("!") || line.startsWith("[") || line.startsWith("#") || line.startsWith("@@")) {
    return [];
  }

  if (line.includes("##") || line.includes("#@#") || line.includes("#?#")) {
    return [];
  }

  const hostMatch = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+([^\s#]+)$/i);
  if (hostMatch) {
    const domain = normalizeDomain(hostMatch[1]);
    return domain ? [domain] : [];
  }

  const adblockDomainMatch = line.match(/^\|\|([a-z0-9.-]+\.[a-z]{2,})(?:\^|\/|$)/i);
  if (adblockDomainMatch) {
    const domain = normalizeDomain(adblockDomainMatch[1]);
    return domain ? [domain] : [];
  }

  const plainDomainMatch = line.match(/^([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (plainDomainMatch) {
    const domain = normalizeDomain(plainDomainMatch[1]);
    return domain ? [domain] : [];
  }

  return [];
}

async function readSourceList(sourcesFile) {
  const raw = await fs.readFile(sourcesFile, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function readSourceContent(sourceRef, rootDir) {
  if (isHttpUrl(sourceRef)) {
    return fetchText(sourceRef);
  }

  const sourcePath = resolvePath(rootDir, sourceRef);
  return fs.readFile(sourcePath, "utf8");
}

function buildKeywordSets(scoringConfig) {
  const positive = new Set((scoringConfig.positiveKeywords || []).map((value) => String(value).toLowerCase()));
  const negative = new Set((scoringConfig.negativeKeywords || []).map((value) => String(value).toLowerCase()));
  return { positive, negative };
}

function scoreDomain(domain, stats, scoringConfig) {
  const sourceHitWeight = Number(scoringConfig.sourceHitWeight || 30);
  const occurrenceWeight = Number(scoringConfig.occurrenceWeight || 2);
  const occurrenceCap = Number(scoringConfig.occurrenceCap || 10);
  const keywordWeight = Number(scoringConfig.keywordWeight || 6);
  const negativeKeywordWeight = Number(scoringConfig.negativeKeywordWeight || 20);

  const tokens = domain.split(/[^a-z0-9]+/).filter(Boolean);
  const tokenSet = new Set(tokens);
  const { positive, negative } = buildKeywordSets(scoringConfig);

  let keywordHits = 0;
  for (const token of positive) {
    if (tokenSet.has(token)) {
      keywordHits += 1;
    }
  }

  let negativeKeywordHits = 0;
  for (const token of negative) {
    if (tokenSet.has(token)) {
      negativeKeywordHits += 1;
    }
  }

  let score = 0;
  score += stats.sources.size * sourceHitWeight;
  score += Math.min(stats.occurrences, occurrenceCap) * occurrenceWeight;
  score += keywordHits * keywordWeight;
  score -= negativeKeywordHits * negativeKeywordWeight;

  return {
    score,
    keywordHits,
    negativeKeywordHits
  };
}

function rankDomains(domainStats, scoringConfig) {
  const ranked = [];

  for (const [domain, stats] of domainStats.entries()) {
    const scoreInfo = scoreDomain(domain, stats, scoringConfig);
    ranked.push({
      domain,
      score: scoreInfo.score,
      keywordHits: scoreInfo.keywordHits,
      negativeKeywordHits: scoreInfo.negativeKeywordHits,
      occurrences: stats.occurrences,
      sourceHits: stats.sources.size
    });
  }

  ranked.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    if (left.sourceHits !== right.sourceHits) {
      return right.sourceHits - left.sourceHits;
    }
    if (left.occurrences !== right.occurrences) {
      return right.occurrences - left.occurrences;
    }
    return left.domain.localeCompare(right.domain);
  });

  return ranked;
}

function selectDomains(ranked, profileConfig, globalExcluded) {
  const maxRules = Number(profileConfig.maxRules || 0);
  const profileExcluded = new Set((profileConfig.excludeDomains || []).map(normalizeDomain).filter(Boolean));
  const pinned = (profileConfig.pinnedDomains || []).map(normalizeDomain).filter(Boolean);

  const seen = new Set();
  const selected = [];

  const maybeAdd = (domain) => {
    if (!domain || seen.has(domain)) {
      return;
    }

    if (globalExcluded.has(domain) || profileExcluded.has(domain)) {
      return;
    }

    seen.add(domain);
    selected.push(domain);
  };

  for (const domain of pinned) {
    maybeAdd(domain);
    if (maxRules && selected.length >= maxRules) {
      return selected;
    }
  }

  for (const item of ranked) {
    maybeAdd(item.domain);
    if (maxRules && selected.length >= maxRules) {
      break;
    }
  }

  return selected;
}

function buildRules(domains, startId, resourceTypes) {
  return domains.map((domain, index) => ({
    id: startId + index,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes
    }
  }));
}

function buildShards(domains, shardSize) {
  if (!shardSize || shardSize <= 0) {
    return [];
  }

  const shards = [];
  for (let index = 0; index < domains.length; index += shardSize) {
    const slice = domains.slice(index, index + shardSize);
    shards.push({
      shard: shards.length + 1,
      count: slice.length,
      domains: slice
    });
  }

  return shards;
}

async function compileProfile(profileName, profileConfig, context) {
  const enabled = profileConfig.enabled !== false;
  if (!enabled) {
    return {
      profile: profileName,
      enabled: false,
      skipped: true
    };
  }

  const rootDir = context.rootDir;
  const sourceListFile = resolvePath(rootDir, profileConfig.sourcesFile);
  const outputFile = resolvePath(rootDir, profileConfig.outputFile);
  const reportRoot = resolvePath(rootDir, context.shardOutputDir || "generated/shards");
  const shardReportFile = path.join(reportRoot, `${profileName}.json`);

  const sourceRefs = profileConfig.sources || [];
  const sourceListRefs = profileConfig.sourcesFile ? await readSourceList(sourceListFile) : [];
  const allSources = [...sourceListRefs, ...sourceRefs];

  if (!allSources.length) {
    throw new Error(`No sources configured for profile: ${profileName}`);
  }

  const domainStats = new Map();
  const excluded = context.globalExcluded;
  const profileExcluded = new Set((profileConfig.excludeDomains || []).map(normalizeDomain).filter(Boolean));

  for (const sourceRef of allSources) {
    context.logger(`Profile ${profileName}: reading ${sourceRef}`);
    const body = await readSourceContent(sourceRef, rootDir);
    const lines = body.split(/\r?\n/);

    for (const line of lines) {
      const domains = extractDomainsFromLine(line);
      for (const domain of domains) {
        if (!domain || excluded.has(domain) || profileExcluded.has(domain)) {
          continue;
        }

        const stats = domainStats.get(domain) || {
          occurrences: 0,
          sources: new Set()
        };

        stats.occurrences += 1;
        stats.sources.add(sourceRef);
        domainStats.set(domain, stats);
      }
    }
  }

  const scoringConfig = profileConfig.scoring || {};
  const ranked = rankDomains(domainStats, scoringConfig);

  const selected = selectDomains(ranked, profileConfig, excluded);
  const resourceTypes = profileConfig.resourceTypes || DEFAULT_RESOURCE_TYPES;
  const startId = Number(profileConfig.startId || 1);
  const rules = buildRules(selected, startId, resourceTypes);

  const shardSize = Number(profileConfig.shardSize || 0);
  const shards = buildShards(selected, shardSize);

  const summary = {
    profile: profileName,
    enabled: true,
    sourceCount: allSources.length,
    candidateDomains: ranked.length,
    selectedDomains: selected.length,
    outputFile,
    shardFile: shardReportFile,
    shardCount: shards.length,
    maxRules: Number(profileConfig.maxRules || 0)
  };

  if (!context.dryRun) {
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, `${JSON.stringify(rules, null, 2)}\n`, "utf8");

    await fs.mkdir(reportRoot, { recursive: true });
    await fs.writeFile(
      shardReportFile,
      `${JSON.stringify({
        profile: profileName,
        generatedAt: new Date().toISOString(),
        shardSize,
        shardCount: shards.length,
        shards
      }, null, 2)}\n`,
      "utf8"
    );
  }

  return summary;
}

function parseProfileSelection(profilesArg, configProfiles) {
  if (!profilesArg || profilesArg === "all") {
    return Object.keys(configProfiles).filter((name) => configProfiles[name].enabled !== false);
  }

  const names = profilesArg
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const unknown = names.filter((name) => !configProfiles[name]);
  if (unknown.length) {
    throw new Error(`Unknown profile(s): ${unknown.join(", ")}`);
  }

  return names;
}

function mergeProfileOverrides(profileConfig, override) {
  if (!override) {
    return profileConfig;
  }

  return {
    ...profileConfig,
    ...override
  };
}

async function compileProfiles(configPath, options = {}) {
  const absoluteConfigPath = path.resolve(configPath);
  const configRaw = await fs.readFile(absoluteConfigPath, "utf8");
  const config = JSON.parse(configRaw);

  const rootDir = options.rootDir || path.dirname(absoluteConfigPath);
  const logger = typeof options.logger === "function" ? options.logger : () => {};
  const dryRun = Boolean(options.dryRun);
  const profiles = parseProfileSelection(options.profiles || "all", config.profiles || {});

  const globalExcluded = new Set(
    (config.globalExcludeDomains || []).map(normalizeDomain).filter(Boolean)
  );

  const summaries = [];

  for (const profileName of profiles) {
    const profileConfig = config.profiles[profileName];
    const override = options.profileOverrides ? options.profileOverrides[profileName] : null;
    const mergedProfile = mergeProfileOverrides(profileConfig, override);

    const summary = await compileProfile(profileName, mergedProfile, {
      rootDir,
      dryRun,
      logger,
      globalExcluded,
      shardOutputDir: config.shardOutputDir || "generated/shards"
    });

    summaries.push(summary);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    profiles: summaries
  };

  const reportFile = config.reportFile ? resolvePath(rootDir, config.reportFile) : "";
  if (reportFile && !dryRun) {
    await fs.mkdir(path.dirname(reportFile), { recursive: true });
    await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

module.exports = {
  compileProfiles,
  extractDomainsFromLine,
  normalizeDomain,
  rankDomains,
  scoreDomain
};
