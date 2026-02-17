# Incidents And Learnings

## Entry Schema
- Date
- Trigger
- Impact
- Root Cause
- Fix
- Prevention Rule
- Evidence
- Commit
- Confidence

## Entries

### 2026-02-17 | Invalid DNR rule shape for `allowAllRequests`
- Date: 2026-02-17
- Trigger: Extension startup raised `Rule with id 130001 ... allowAllRequests ... resourceTypes` error.
- Impact: Initialization failed and settings sync aborted.
- Root Cause: `allowAllRequests` rule used unsupported resource types.
- Fix: Updated rule conditions to `resourceTypes: ["main_frame", "sub_frame"]`.
- Prevention Rule: Apply action-specific DNR schema checks for all dynamic rules before release.
- Evidence: Chrome runtime error log + follow-up successful reload.
- Commit: `8ff9dab`
- Confidence: high

### 2026-02-17 | Dynamic rule update queue failure propagation
- Date: 2026-02-17
- Trigger: Repeated follow-on errors after a failed dynamic rule update.
- Impact: Subsequent updates inherited prior rejection state.
- Root Cause: Queue promise chain rethrew and poisoned later tasks.
- Fix: Converted queue to isolate failures while preserving serialization.
- Prevention Rule: For serialized queues, never let one task rejection block future tasks.
- Evidence: Reduced repeated error pattern and stable subsequent updates.
- Commit: `35eb6d9`
- Confidence: high
