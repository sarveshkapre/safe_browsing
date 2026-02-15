#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCES_FILE = path.join(ROOT, "strict_sources.txt");
const DEFAULT_OUTPUT_FILE = path.join(ROOT, "rules_strict.json");
const RULE_START_ID = 1001;
const DEFAULT_MAX_RULES = 1500;
const RESOURCE_TYPES = [
  "script",
  "image",
  "sub_frame",
  "xmlhttprequest",
  "media",
  "ping",
  "font",
  "stylesheet"
];

function parseArgs(argv) {
  const config = {
    maxRules: DEFAULT_MAX_RULES,
    sourcesFile: DEFAULT_SOURCES_FILE,
    outputFile: DEFAULT_OUTPUT_FILE
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--max=")) {
      const value = Number.parseInt(arg.slice("--max=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        config.maxRules = value;
      }
      return;
    }

    if (arg.startsWith("--sources=")) {
      config.sourcesFile = path.resolve(ROOT, arg.slice("--sources=".length));
      return;
    }

    if (arg.startsWith("--out=")) {
      config.outputFile = path.resolve(ROOT, arg.slice("--out=".length));
    }
  });

  return config;
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
          "user-agent": "safe-browsing-rules-updater/1.0"
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
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve(body);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Timeout while fetching ${url}`));
    });

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

  let domain = value.trim().toLowerCase();
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
  const line = rawLine.trim();
  if (!line) {
    return [];
  }

  if (line.startsWith("!") || line.startsWith("[") || line.startsWith("#") || line.startsWith("@@")) {
    return [];
  }

  if (line.includes("##") || line.includes("#@#") || line.includes("#?#")) {
    return [];
  }

  const domains = [];

  const hostMatch = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+([^\s#]+)$/i);
  if (hostMatch) {
    const domain = normalizeDomain(hostMatch[1]);
    if (domain) {
      domains.push(domain);
    }
    return domains;
  }

  const adblockDomainMatch = line.match(/^\|\|([a-z0-9.-]+\.[a-z]{2,})(?:\^|\/|$)/i);
  if (adblockDomainMatch) {
    const domain = normalizeDomain(adblockDomainMatch[1]);
    if (domain) {
      domains.push(domain);
    }
    return domains;
  }

  const plainDomainMatch = line.match(/^([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (plainDomainMatch) {
    const domain = normalizeDomain(plainDomainMatch[1]);
    if (domain) {
      domains.push(domain);
    }
  }

  return domains;
}

function buildRules(domains) {
  return domains.map((domain, index) => ({
    id: RULE_START_ID + index,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes: RESOURCE_TYPES
    }
  }));
}

async function readSources(sourcesFile) {
  const data = await fs.readFile(sourcesFile, "utf8");
  return data
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const sourceUrls = await readSources(config.sourcesFile);

  if (!sourceUrls.length) {
    throw new Error(`No source URLs found in ${config.sourcesFile}`);
  }

  const domainSet = new Set();

  for (const sourceUrl of sourceUrls) {
    process.stdout.write(`Fetching ${sourceUrl}\n`);
    const body = await fetchText(sourceUrl);
    const lines = body.split(/\r?\n/);

    for (const line of lines) {
      const found = extractDomainsFromLine(line);
      found.forEach((domain) => domainSet.add(domain));
    }

    process.stdout.write(`Collected domains so far: ${domainSet.size}\n`);
  }

  const collectedDomains = Array.from(domainSet);
  const selectedDomains = collectedDomains.slice(0, config.maxRules);
  const rules = buildRules(selectedDomains);
  const output = `${JSON.stringify(rules, null, 2)}\n`;

  await fs.writeFile(config.outputFile, output, "utf8");

  process.stdout.write(`Wrote ${rules.length} strict rules to ${config.outputFile}\n`);
  if (collectedDomains.length > selectedDomains.length) {
    process.stdout.write(
      `Truncated ${collectedDomains.length - selectedDomains.length} domains due to --max=${config.maxRules}\n`
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
