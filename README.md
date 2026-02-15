# Safe Browsing (Chromium Ad Blocker)

Fast, lightweight Manifest V3 ad blocker with two rule modes, per-site allowlist support, and block counters.

## Features

- `Standard` mode (default): compact, high-impact blocking list.
- `Strict` mode: additional aggressive blocking list.
- Per-site allowlist from popup (allow ads on current site).
- Allowlist management page (view/remove/clear sites).
- Block counters in popup (`session` and `today`).
- Blocking uses `declarativeNetRequest` rules in Chromium's native request path.

## Project files

- `manifest.json`: extension configuration.
- `rules_standard.json`: standard rule set.
- `rules_strict.json`: strict add-on rule set.
- `background.js`: mode, allowlist, and block counter state sync.
- `popup.html`, `popup.js`: extension popup controls.
- `options.html`, `options.js`: allowlist management page.
- `strict_sources.txt`: strict rules source URLs.
- `scripts/update_strict_rules.js`: strict rules generator.

## Load in Chrome/Chromium

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `/Users/sarvesh/code/safe_browsing`.

## Use

1. Click the extension icon.
2. Choose `Standard` or `Strict`.
3. Use `Allow ads on this site` to toggle allowlist for the current tab domain.
4. Click `Manage allowlist` to remove or clear entries.
5. Check popup stats for blocked request counters.

## Rebuild strict rules automatically

Run:

```bash
node scripts/update_strict_rules.js
```

Default output is `1500` strict rules for a good speed/coverage balance.

Optional flags:

```bash
node scripts/update_strict_rules.js --max=5000
node scripts/update_strict_rules.js --sources=strict_sources.txt --out=rules_strict.json
```

Then reload the extension in `chrome://extensions`.

## Notes

- Counters use `declarativeNetRequestFeedback` (`onRuleMatchedDebug`). They work for unpacked development installs.
