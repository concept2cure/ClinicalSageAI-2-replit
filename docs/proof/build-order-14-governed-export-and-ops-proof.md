# Build Order 14 — Governed Export & Ops Proof

## Acceptance Criteria

### 1. Two flagged CERV2 export bypasses resolved
**PASS** — CI guard scope fixed to cover both governed POST routes and dev-gated
sample routes. No ungoverned export path remains.

### 2. ci:governed-export-routes passes
**PASS** — Guard validates all governed POST export routes are registered and
verifies sample routes are gated by `isSampleExportEnabled`.

### 3. Streaming export paths governed
**PASS** — All POST-based streaming export routes are registered in the governed
route registry. Sample export routes (GET) are dev-gated and verified separately.

### 4. Maintenance scheduled
**PASS** — `platform_maintenance` job type registered in `scheduled-jobs.ts`.
Bull queue cron runs daily at 3 AM. Handler calls `runPlatformMaintenance`
(token cleanup, bridge integrity, metadata backfill).

### 5. Strict readiness runner exists
**PASS** — `scripts/readiness-check.mjs` accepts `--strict` flag. Exits 1 on
any critical failure. Available via `npm run readiness:check:strict`.

### 6. Readiness explicit by mode
**PASS** — Two distinct modes:
- `--warn-only` (default): reports all issues, always exits 0.
- `--strict`: reports all issues, exits 1 on critical severity.
Critical vs warning severity is explicit in output for each check.

### 7. No fake-prod behavior
**PASS** — All endpoints perform real operations against real data stores.
No mock data, no placeholder responses, no "coming soon" stubs.
Sample exports are explicitly dev-gated, not disguised as production features.

### 8. Repo more deterministic
**PASS** — Scheduled maintenance runs on a fixed cron schedule. Readiness checks
produce deterministic pass/fail results. Export governance is enforced by CI,
not by convention. Every operational behavior is codified and verifiable.

## Summary

All 8 acceptance criteria pass. Export governance covers both governed POST routes
and dev-gated sample routes. Operational infrastructure (maintenance jobs, readiness
runner) is registered, scheduled, and mode-explicit.
