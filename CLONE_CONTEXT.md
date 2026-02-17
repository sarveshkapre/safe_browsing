# Clone Context

Use this file as the first read in every new session for this repository.

## Goal
- Current goal: Ship a privacy-first ad blocking extension with strong local-only diagnostics.
- Why this matters now: Users need confidence in what is blocked without sending data off-device.

## Expected Outcome
- What should be true after this session: Core blocking controls are stable, detailed stats are actionable, docs and memory are current.
- Definition of done for this cycle: verification commands pass and recent work is traceable via memory/incidents.

## Current State
- Completed recently: X compatibility mode, selective pause, detailed local stats, filtering/sorting/export.
- In progress: hardening around environment-specific debug-feedback availability.
- Blockers or risks: DOM drift on X and store-policy behavior for debug feedback.

## Immediate Next Actions
- [ ] Add optional debug-feedback opt-in mode.
- [ ] Add rolling 24h view in detailed stats.
- [ ] Improve X selector resilience with fixtures.
- [ ] Add stats schema migration guard for future versions.
- [ ] Prepare release checklist for next package build.

## Constraints
- Guardrails: local-only storage, no telemetry, reversible changes, strict DNR correctness.
- Non-goals: cloud sync, server-side processing, cross-device profiles.

## Key References
- Roadmap: PRODUCT_ROADMAP.md
- Memory log: PROJECT_MEMORY.md
- Incidents: INCIDENTS.md
- Agent contract: AGENTS.md

## Session Handoff
- Last updated: 2026-02-17T00:00:00Z
- Updated by: codex
- Notes for next session: preserve privacy-first behavior while improving local observability UX.
