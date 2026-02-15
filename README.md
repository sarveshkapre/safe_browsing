# Safe Browsing Extension

A fast, lightweight Chromium Manifest V3 extension that blocks ads and trackers with declarative network rules.

## Why this project exists

Most blockers trade simplicity for maximum coverage. This project keeps a clean core architecture and a small default profile, then lets users opt into a stricter ruleset.

## Key features

- `Standard` mode (default): compact high-impact blocking.
- `Strict` mode: broader blocking rules for aggressive filtering.
- Optional `Annoyances` and `Regional` rulesets (toggle from popup/options).
- Auto cookie-consent handling (tries `Reject/Only necessary` first, then hides overlays).
- Per-site allowlist from popup.
- Dedicated allowlist management page.
- Block counters in popup (`session` and `today`).
- Rule updates from EasyList-style sources.

## Architecture

- Blocking engine: Chromium `declarativeNetRequest` static rulesets.
- Cookie UX layer: `document_start` content script for consent banners.
- Runtime state: background service worker (`mode`, allowlist, counters).
- UI:
  - Popup for mode toggle, current-site allowlist, and counters.
  - Options page for full allowlist management.
- Rule compiler pipeline: `sources -> normalize -> score -> shard -> output`.

## Repository layout

```text
safe_browsing/
├── manifest.json
├── background.js
├── content/
│   ├── cookie_handler.js
│   └── cookie_handler.css
├── popup.html
├── popup.js
├── options.html
├── options.js
├── rules_standard.json
├── rules_strict.json
├── rules_annoyances.json
├── rules_regional.json
├── rules_config.json
├── standard_sources.txt
├── strict_sources.txt
├── annoyances_sources.txt
├── regional_sources.txt
├── tests/
│   ├── rule-quality.test.js
│   └── rules-compiler.test.js
├── scripts/
│   ├── compile_rules.js
│   ├── update_strict_rules.js
│   ├── lib/rules_compiler.js
│   ├── validate.js
│   └── package_extension.sh
├── .github/
│   └── workflows/
│       └── validate.yml
├── CONTRIBUTING.md
└── README.md
```

## Quick start

### 1. Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

### 2. Use it

1. Click the extension icon.
2. Select `Standard` or `Strict`.
3. Toggle optional `Annoyances` / `Regional` filters if needed.
4. Use `Allow ads on this site` for the current domain.
5. Cookie banners are auto-handled when possible.
6. Click `Manage allowlist` to remove/clear allowlisted domains.

## Development workflow

### Validate project files

```bash
npm run validate
```

This checks:
- required files exist
- JSON files are valid
- JavaScript syntax is valid

### Run rule quality tests

```bash
npm run test:quality
```

This verifies:
- rule schema integrity (IDs, domains, resource types)
- standard baseline coverage domains are present
- strict mode adds coverage beyond standard
- allowlist behavior is preserved in evaluation scenarios
- safe first-party domains are not blocked

### Run compiler tests

```bash
npm run test:compiler
```

### Compile rulesets (recommended)

```bash
npm run rules:compile
```

This compiles enabled profiles from `rules_config.json`:
- `standard` -> `rules_standard.json`
- `strict` -> `rules_strict.json`
- `annoyances` -> `rules_annoyances.json` (currently disabled in config)
- `regional` -> `rules_regional.json` (currently disabled in config)

Compiler stages:
- source ingestion (`*.sources.txt`)
- domain normalization and filtering
- heuristic scoring and ranking
- profile-level max-rule selection
- shard report generation in `generated/shards/`

### Refresh strict rules only (backward-compatible)

```bash
npm run rules:update
```

Defaults for strict-only run:
- sources: `strict_sources.txt`
- output: `rules_strict.json`
- cap: from `rules_config.json` (`1500`)

Optional custom run:

```bash
node scripts/update_strict_rules.js --max=2500 --sources=strict_sources.txt --out=rules_strict.json
```

### Build a distributable zip

```bash
npm run build:zip
```

Output is written to `dist/`.

## Release checklist

1. Run `npm run validate`.
2. Run `npm test`.
3. Regenerate rules with `npm run rules:compile` if needed.
4. Update docs/version if behavior changed.
5. Build zip and sanity-test in a fresh browser profile.
6. Tag and publish.

## Permissions and privacy

- `declarativeNetRequest`: apply network blocking rules.
- `declarativeNetRequestFeedback`: read rule matches for counters (dev/unpacked context).
- `storage`: persist mode, allowlist, counters.
- `tabs`: read active tab URL for current-site allowlist action.
- `<all_urls>` host permission is required for global request filtering.

The extension does not send browsing data to external servers.

## Troubleshooting

- Rules not applying: reload extension in `chrome://extensions`.
- Counters not increasing: confirm unpacked/developer install context.
- Site breakage: switch to `Standard` or allowlist the domain.

## Contributing

See `CONTRIBUTING.md`.
