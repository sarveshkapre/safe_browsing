#!/usr/bin/env node

const path = require("path");
const { compileProfiles } = require("./lib/rules_compiler");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "rules_config.json");

function setOverride(overrides, profile, key, value) {
  if (!profile) {
    throw new Error(`Missing profile for override ${key}`);
  }

  const current = overrides[profile] || {};
  current[key] = value;
  overrides[profile] = current;
}

function parseArgs(argv) {
  const options = {
    profiles: "all",
    config: DEFAULT_CONFIG_FILE,
    dryRun: false,
    profileOverrides: {}
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profiles = arg.slice("--profile=".length).trim() || "all";
      continue;
    }

    if (arg.startsWith("--config=")) {
      options.config = path.resolve(ROOT, arg.slice("--config=".length));
      continue;
    }

    if (arg.startsWith("--max=")) {
      const raw = arg.slice("--max=".length);
      if (raw.includes(":")) {
        const [profile, value] = raw.split(":", 2);
        const maxRules = Number.parseInt(value, 10);
        if (Number.isFinite(maxRules) && maxRules > 0) {
          setOverride(options.profileOverrides, profile, "maxRules", maxRules);
        }
      } else {
        const maxRules = Number.parseInt(raw, 10);
        if (Number.isFinite(maxRules) && maxRules > 0) {
          if (options.profiles.includes(",") || options.profiles === "all") {
            throw new Error("--max=<n> requires a single --profile value");
          }
          setOverride(options.profileOverrides, options.profiles, "maxRules", maxRules);
        }
      }
      continue;
    }

    if (arg.startsWith("--sources=")) {
      const raw = arg.slice("--sources=".length);
      if (raw.includes(":")) {
        const [profile, value] = raw.split(":", 2);
        setOverride(options.profileOverrides, profile, "sourcesFile", value);
      } else {
        if (options.profiles.includes(",") || options.profiles === "all") {
          throw new Error("--sources=<path> requires a single --profile value");
        }
        setOverride(options.profileOverrides, options.profiles, "sourcesFile", raw);
      }
      continue;
    }

    if (arg.startsWith("--out=")) {
      const raw = arg.slice("--out=".length);
      if (raw.includes(":")) {
        const [profile, value] = raw.split(":", 2);
        setOverride(options.profileOverrides, profile, "outputFile", value);
      } else {
        if (options.profiles.includes(",") || options.profiles === "all") {
          throw new Error("--out=<path> requires a single --profile value");
        }
        setOverride(options.profileOverrides, options.profiles, "outputFile", raw);
      }
      continue;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const report = await compileProfiles(options.config, {
    profiles: options.profiles,
    dryRun: options.dryRun,
    profileOverrides: options.profileOverrides,
    logger: (message) => process.stdout.write(`${message}\n`)
  });

  for (const profile of report.profiles) {
    if (profile.skipped) {
      process.stdout.write(`Skipped ${profile.profile}\n`);
      continue;
    }

    process.stdout.write(
      `Compiled ${profile.profile}: selected ${profile.selectedDomains}/${profile.maxRules || profile.selectedDomains} domains (${profile.candidateDomains} candidates) -> ${profile.outputFile}\n`
    );

    if (profile.shardCount) {
      process.stdout.write(`Shard report: ${profile.shardFile} (${profile.shardCount} shards)\n`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
