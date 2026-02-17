# Project Memory

## Objective
- Deliver a privacy-first Chromium extension that blocks ads quickly while remaining lightweight and transparent.

## Architecture Snapshot
- `background.js`: state, DNR ruleset control, allowlist dynamic rules, local stats aggregation.
- `content/cookie_handler.js`: cookie/consent banner handling.
- `content/x_ads_handler.js`: X/Twitter DOM ad hiding and local event reporting.
- `popup.*`: fast controls and summary diagnostics.
- `options.*`: allowlist and detailed local stats workflows.

## Open Problems
- Optional: make network-debug stats opt-in while keeping X DOM stats always available.
- Optional: provide rolling-24h counters in addition to day/session counters.

## Product Phase
- Current phase: M3 Bug Fixing And Refactor
- Session checkpoint question: Are we in a good product phase yet?
- Exit criteria template: parity on core workflows, reliable UX, stable verification, and clear differentiators.

## Brainstorming And Goal Alignment
- 2026-02-17T00:00:00Z | Candidates: retention controls, selective clear, export, diagnostics, filtering/sort | Top picks: diagnostics + actionable stats UX | Why aligned: user asked for detailed blocked URL/domain counts and operational transparency | De-prioritized: cloud sync and remote telemetry | Drift checks: all additions remain local-only.

## Session Notes
- 2026-02-17T00:00:00Z | Goal: ship 10 incremental improvements and push to `main` | Success criteria: 10 commits, all pushed, docs aligned, verification logged | Non-goals: backend service, remote storage.
- Decisions: prioritize local-only observability and controls over broad new blockers.

## Recent Decisions
- 2026-02-17 | Added DNR capacity diagnostics to popup/options | Helps explain filtering headroom and runtime limits | Evidence: UI values from `getAvailableStaticRuleCount()` | Commit: `16618c4` | Confidence: high | Trust: trusted
- 2026-02-17 | Added configurable stats retention with auto-pruning | Keeps detailed logs bounded and user-controlled | Evidence: retention setting + prune logic in `background.js` | Commit: `f08f8dc` | Confidence: high | Trust: trusted
- 2026-02-17 | Added detailed stats filter/sort/export/selective clear UX | Makes local stats practical at scale | Evidence: options controls and handlers | Commits: `b4b2257`, `b26730c`, `8c36a84`, `d8ba30a` | Confidence: high | Trust: trusted
- 2026-02-17 | Added feedback-availability diagnostics | Prevents silent confusion when debug matches are unavailable | Evidence: popup/options status line | Commit: `f2e8681` | Confidence: high | Trust: trusted

## Mistakes And Fixes
- 2026-02-17 | Invalid `allowAllRequests` resource types caused init failure | Root cause: used unsupported resource types for `allowAllRequests` | Fix: restricted to `main_frame`/`sub_frame` | Prevention rule: validate DNR action-specific schema when changing dynamic rules | Commit: `8ff9dab` | Confidence: high

## Known Risks
- `declarativeNetRequestFeedback` behavior can differ between unpacked/dev and store environments.
- DOM-based X ad identification may drift as X markup evolves.

## Next Prioritized Tasks
- [ ] Add optional opt-in toggle for network debug feedback counters.
- [ ] Add compact per-domain trend chart (local-only).
- [ ] Expand X selectors safely using fixture snapshots.

## Verification Evidence
- 2026-02-17 | `npm run validate` | `Validation passed.` | pass
- 2026-02-17 | `npm test` | `test:quality pass 6/6; test:compiler pass 3/3` | pass

## Historical Summary
- Older session details are compacted into commit history and incident log.
