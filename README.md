# Safe Browsing Extension

A fast, lightweight Chromium Manifest V3 extension that blocks ads and trackers with declarative network rules.

## Why this project exists

Most blockers trade simplicity for maximum coverage. This project keeps a clean core architecture and a small default profile, then lets users opt into a stricter ruleset.

## Key features

- `Standard` mode (default): compact high-impact blocking.
- `Strict` mode: broader blocking rules for aggressive filtering.
- Per-site allowlist from popup.
- Dedicated allowlist management page.
- Block counters in popup (`session` and `today`).
- Rule updates from EasyList-style sources.

## Architecture

- Blocking engine: Chromium `declarativeNetRequest` static rulesets.
- Runtime state: background service worker (`mode`, allowlist, counters).
- UI:
  - Popup for mode toggle, current-site allowlist, and counters.
  - Options page for full allowlist management.
- Rule generation: Node script that converts list sources into extension-compatible strict rules.

## Repository layout

```text
safe_browsing/
├── manifest.json
├── background.js
├── popup.html
├── popup.js
├── options.html
├── options.js
├── rules_standard.json
├── rules_strict.json
├── strict_sources.txt
├── tests/
│   └── rule-quality.test.js
├── scripts/
│   ├── update_strict_rules.js
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
3. Use `Allow ads on this site` for the current domain.
4. Click `Manage allowlist` to remove/clear allowlisted domains.

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

### Refresh strict rules

```bash
npm run rules:update
```

Defaults:
- sources: `strict_sources.txt`
- output: `rules_strict.json`
- cap: `1500` strict rules (speed/coverage balance)

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
2. Run `npm run test:quality`.
3. Regenerate strict rules if needed.
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
