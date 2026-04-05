# Build Order 14 — Governed Export & Ops Map

## 1. CERV2 Export Bypass Resolution

The CI guard (`ci:governed-export-routes`) was scoped to governed POST routes only.
Sample GET routes (e.g., sample CSV/PDF export) are dev-gated by `isSampleExportEnabled`
rather than the governed route registry.

**Fix applied:**
- CI guard continues to scan all governed POST export routes for bypass attempts.
- Guard now also verifies that sample export routes are properly gated behind
  `isSampleExportEnabled`, ensuring no ungoverned export path exists in production.
- Sample routes remain GET-based and dev-only; they are excluded from the governed
  POST registry by design but are validated for their own gating mechanism.

## 2. Scheduled Maintenance

A `platform_maintenance` job type was added to `scheduled-jobs.ts`:

- **Handler**: registered in the Bull queue job processor, calls `runPlatformMaintenance`.
- **Schedule**: runs daily at 3:00 AM via Bull queue cron expression (`0 3 * * *`).
- **Scope**: token cleanup, bridge integrity checks, metadata backfill.
- **Failure mode**: job failures are logged and retried with standard Bull retry policy.
  No silent failures — errors surface in job monitoring.

## 3. Readiness Runner

Script: `scripts/readiness-check.mjs`

| Mode | Flag | Behavior |
|------|------|----------|
| Warn-only (default) | `--warn-only` | Runs all checks, prints results, always exits 0 |
| Strict | `--strict` | Runs all checks, exits 1 on any critical failure |

**npm scripts:**
- `npm run readiness:check` — warn-only mode
- `npm run readiness:check:strict` — strict mode (suitable for CI gates)

Checks cover: database connectivity, schema integrity, required environment variables,
scheduled job registration, governed route completeness, and export gating verification.

## Files Modified

- `server/services/scheduled-jobs.ts` — added `platform_maintenance` job type + handler
- `scripts/readiness-check.mjs` — new readiness runner script
- `package.json` — added `readiness:check` and `readiness:check:strict` scripts
- CI guard updated to verify sample route gating alongside governed POST routes
