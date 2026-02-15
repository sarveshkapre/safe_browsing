#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const jsonFiles = [
  "manifest.json",
  "rules_config.json",
  "rules_standard.json",
  "rules_strict.json",
  "rules_annoyances.json",
  "rules_regional.json",
  "package.json"
];

const jsFiles = [
  "background.js",
  "content/cookie_handler.js",
  "content/x_ads_handler.js",
  "popup.js",
  "options.js",
  "scripts/compile_rules.js",
  "scripts/lib/rules_compiler.js",
  "scripts/update_strict_rules.js",
  "scripts/validate.js",
  "tests/rule-quality.test.js",
  "tests/rules-compiler.test.js"
];

const mustExist = [
  "README.md",
  "CONTRIBUTING.md",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
  "scripts/generate_icons.py",
  "tests/rule-quality.test.js",
  "tests/rules-compiler.test.js",
  "content/cookie_handler.js",
  "content/cookie_handler.css",
  "content/x_ads_handler.js",
  "rules_config.json",
  "standard_sources.txt",
  "strict_sources.txt",
  "annoyances_sources.txt",
  "regional_sources.txt",
  "rules_annoyances.json",
  "rules_regional.json",
  ".github/workflows/validate.yml",
  "scripts/package_extension.sh"
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function checkExists(relPath) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing required file: ${relPath}`);
  }
}

function checkJson(relPath) {
  const fullPath = path.join(ROOT, relPath);
  try {
    const raw = fs.readFileSync(fullPath, "utf8");
    JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON in ${relPath}: ${error.message}`);
  }
}

function checkJsSyntax(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const result = spawnSync(process.execPath, ["--check", fullPath], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    fail(`Syntax check failed for ${relPath}: ${(result.stderr || result.stdout).trim()}`);
  }
}

function run() {
  mustExist.forEach(checkExists);
  jsonFiles.forEach(checkJson);
  jsFiles.forEach(checkJsSyntax);

  if (process.exitCode) {
    process.exit(process.exitCode);
  }

  console.log("Validation passed.");
}

run();
