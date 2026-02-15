#!/usr/bin/env node

const path = require("path");
const { compileProfiles } = require("./lib/rules_compiler");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG_FILE = path.join(ROOT, "rules_config.json");

function parseArgs(argv) {
  const options = {
    config: DEFAULT_CONFIG_FILE,
    maxRules: null,
    sourcesFile: null,
    outputFile: null,
    dryRun: false
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith("--config=")) {
      options.config = path.resolve(ROOT, arg.slice("--config=".length));
      continue;
    }

    if (arg.startsWith("--max=")) {
      const value = Number.parseInt(arg.slice("--max=".length), 10);
      if (Number.isFinite(value) && value > 0) {
        options.maxRules = value;
      }
      continue;
    }

    if (arg.startsWith("--sources=")) {
      options.sourcesFile = arg.slice("--sources=".length);
      continue;
    }

    if (arg.startsWith("--out=")) {
      options.outputFile = arg.slice("--out=".length);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const strictOverride = {};

  if (options.maxRules) {
    strictOverride.maxRules = options.maxRules;
  }

  if (options.sourcesFile) {
    strictOverride.sourcesFile = options.sourcesFile;
  }

  if (options.outputFile) {
    strictOverride.outputFile = options.outputFile;
  }

  const report = await compileProfiles(options.config, {
    profiles: "strict",
    dryRun: options.dryRun,
    profileOverrides: {
      strict: strictOverride
    },
    logger: (message) => process.stdout.write(`${message}\n`)
  });

  const strict = report.profiles[0];
  if (!strict) {
    throw new Error("Strict profile compilation did not run");
  }

  process.stdout.write(
    `Wrote ${strict.selectedDomains} strict rules to ${strict.outputFile}\n`
  );

  const truncatedCount = Math.max(0, strict.candidateDomains - strict.selectedDomains);
  if (truncatedCount > 0) {
    process.stdout.write(
      `Truncated ${truncatedCount} domains due to --max=${strict.maxRules}\n`
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
