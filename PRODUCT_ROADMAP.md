# Product Roadmap

## Product Goal
- Ship a fast, privacy-first Chromium extension that blocks ads and tracking with local-only controls and diagnostics.

## Definition Of Done
- Core feature set delivered for primary workflows.
- UI/UX polished for repeated real usage.
- No open critical reliability issues.
- Verification commands pass and are documented.
- Documentation is current and complete.

## Milestones
- M1 Foundation
- M2 Core Features
- M3 Bug Fixing And Refactor
- M4 UI/UX Improvement
- M5 Stabilization And Release Readiness

## Current Milestone
- M3 Bug Fixing And Refactor

## Brainstorming Queue
- Keep a broad queue of aligned candidates across features, bugs, refactor, UI/UX, docs, and test hardening.

## Pending Features
- Debug-feedback opt-in toggle and policy-safe fallback UX.
- Advanced stats trends (24h/7d) from local data only.
- X selector resilience improvements from fixture-driven checks.

## Delivered Features
- 2026-02-17: detailed local stats with domain/url/source entries.
- 2026-02-17: retention controls + pruning + selective clear + export.
- 2026-02-17: DNR capacity/debug diagnostics in popup and options.

## Risks And Blockers
- Platform variance in `declarativeNetRequestFeedback` behavior.
- Frequent X DOM changes can degrade ad detection precision.
