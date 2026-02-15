const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { compileProfiles, extractDomainsFromLine, normalizeDomain } = require("../scripts/lib/rules_compiler");

test("normalizeDomain handles basic normalization and rejects invalid", () => {
  assert.equal(normalizeDomain("WWW.DoubleClick.NET"), "doubleclick.net");
  assert.equal(normalizeDomain(".example.com."), "example.com");
  assert.equal(normalizeDomain("localhost"), "");
  assert.equal(normalizeDomain("bad_domain"), "");
});

test("extractDomainsFromLine supports host and adblock formats", () => {
  assert.deepEqual(extractDomainsFromLine("0.0.0.0 ads.example.com"), ["ads.example.com"]);
  assert.deepEqual(extractDomainsFromLine("||tracker.example.net^$script"), ["tracker.example.net"]);
  assert.deepEqual(extractDomainsFromLine("@@||allow.example.com^"), []);
});

test("compileProfiles builds rules and shard report from local fixtures", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "safe-browsing-compiler-"));

  const sourceListPath = path.join(tmpRoot, "sources.txt");
  const sourceAPath = path.join(tmpRoot, "source_a.txt");
  const sourceBPath = path.join(tmpRoot, "source_b.txt");
  const configPath = path.join(tmpRoot, "rules_config.json");

  await fs.writeFile(sourceAPath, [
    "||doubleclick.net^",
    "||tracker.example.net^",
    "||github.com^"
  ].join("\n"), "utf8");

  await fs.writeFile(sourceBPath, [
    "0.0.0.0 tracker.example.net",
    "0.0.0.0 ads.foobar.net",
    "||ads.foobar.net^"
  ].join("\n"), "utf8");

  await fs.writeFile(sourceListPath, ["source_a.txt", "source_b.txt"].join("\n"), "utf8");

  const config = {
    globalExcludeDomains: ["github.com"],
    reportFile: "generated/report.json",
    shardOutputDir: "generated/shards",
    profiles: {
      standard: {
        enabled: true,
        sourcesFile: "sources.txt",
        outputFile: "rules_standard.json",
        maxRules: 3,
        startId: 1,
        shardSize: 2,
        pinnedDomains: ["doubleclick.net"],
        scoring: {
          sourceHitWeight: 10,
          occurrenceWeight: 2,
          occurrenceCap: 10,
          keywordWeight: 5,
          negativeKeywordWeight: 20,
          positiveKeywords: ["ads", "tracker", "doubleclick"],
          negativeKeywords: ["github"]
        }
      }
    }
  };

  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const report = await compileProfiles(configPath, {
    profiles: "standard",
    rootDir: tmpRoot,
    logger: () => {}
  });

  assert.equal(report.profiles.length, 1);
  assert.equal(report.profiles[0].selectedDomains, 3);

  const rulesPath = path.join(tmpRoot, "rules_standard.json");
  const shardPath = path.join(tmpRoot, "generated", "shards", "standard.json");

  const rules = JSON.parse(await fs.readFile(rulesPath, "utf8"));
  assert.equal(rules.length, 3);
  assert.equal(rules[0].condition.urlFilter, "||doubleclick.net^");

  const filters = new Set(rules.map((rule) => rule.condition.urlFilter));
  assert.ok(filters.has("||tracker.example.net^"));
  assert.ok(filters.has("||ads.foobar.net^"));
  assert.ok(!filters.has("||github.com^"));

  const shardReport = JSON.parse(await fs.readFile(shardPath, "utf8"));
  assert.equal(shardReport.shardCount, 2);
  assert.equal(shardReport.shards[0].count, 2);
});
