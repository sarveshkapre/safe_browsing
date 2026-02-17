# Clone Feature Tracker

## Context Sources
- README and docs
- Runtime failures and incident entries
- User feedback from live extension usage

## Candidate Features To Do
- Debug-feedback opt-in toggle with explicit UX state.
- 24h trends and domain heatmap in options page.
- Safer X heuristic expansion with sampled fixtures.
- Per-site quick diagnostics in popup.

## Implemented
- Detailed local blocked activity with source/domain/url metadata.
- Local summaries: session/day counts for network and X DOM blocks.
- Source/search/sort controls for detailed stats.
- Selective clear controls (`all`, `network`, `x_dom`).
- JSON export for local stats.
- DNR capacity and debug-availability diagnostics.
- Configurable stats retention and automatic pruning.

## Insights
- Users value transparent diagnostics as much as strict blocking itself.
- Small, explicit controls reduce confusion during site breakage triage.

## Notes
- Keep this tracker aligned with roadmap and memory after each major change.
