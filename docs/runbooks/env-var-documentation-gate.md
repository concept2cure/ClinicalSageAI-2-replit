# Environment-variable documentation gate

**Gate:** `node scripts/ci/check-env-var-docs.mjs --strict-no-regression` (runs
in the `Lint` job of `.github/workflows/ci.yml`)
**Scanner:** `scripts/ci/check-env-var-docs.mjs`
**Baseline:** `docs/reports/env-var-docs-baseline.json`

The scanner is invoked directly (not via an `npm run` alias) so this change
touches no `package.json` — keeping the gate self-contained to `scripts/ci/`
and `.github/workflows/`.

## Why this exists

Every environment variable the server runtime reads should be documented in
`.env.example` so operators know what to configure. For a regulated deployment
this is an ops **and** security concern: configuration governs posture — the
audit HMAC/attestation keys, RLS enforcement, the FDA ESG gateway credentials,
the AI-gateway substrate flags — and a variable the application silently reads
but no one documents is a variable that silently ships mis-configured.

An audit of `server/` + `shared/` found a large cohort of variables that are
read but undocumented. Writing correct `.env.example` entries for all of them
at once (with accurate purpose, default, and safety notes per variable) is out
of scope for a single change, and it is subsystem-owner work. Ignoring the
drift is dishonest. This gate takes the same middle path the repository already
uses for the typecheck-error and tenant-isolation baselines: **snapshot the
current undocumented set, fail any change that adds a _new_ undocumented
variable, and ratchet the baseline down over time.**

## What counts

A variable is a finding (undocumented drift) when all of the following hold:

- it is referenced as `process.env.NAME` or `process.env['NAME']` under
  `server/` or `shared/` (tests, mocks, and `.d.ts` files are excluded; the
  client is Vite and reads `import.meta.env`, so it is not in scope);
- it is **not** a documented key in `.env.example` or `.env.beta.example` — an
  active `NAME=` line or a commented `# NAME=` example line both count as
  documented; and
- it is **not** an ambient runtime/tooling variable (`NODE_ENV`, `CI`, `PATH`,
  `GITHUB_*`, `npm_*`, …) that never belongs in an application `.env` file.

## Current drift (baseline snapshot)

- Referenced in `server/` + `shared/`: **417**
- Documented in the example files: **205**
- Undocumented (baselined): **244**

Largest undocumented groups by prefix: `ANA_*` (34), `ENABLE_*` (17), `FDA_*`
(10), `LUMEN_*` (9), `EXTERNAL_*` (6), `AI_*` (4). The authoritative,
machine-readable list is `docs/reports/env-var-docs-baseline.json`.

The ratchet has run twice so far, prioritising the vars where being
undocumented is most dangerous:

1. The prod-unsafe development toggles (`ALLOW_DEV_AUTH`, `ALLOW_MOCK_VAULT`,
   `ALLOW_EXTENSION_DDL`, `ALLOW_FALLBACK_EMBEDDINGS`) — a toggle that silently
   weakens auth/storage/DB safety is the worst thing to leave undocumented.
2. The audit-integrity & attestation crypto (`AUDIT_HMAC_SECRET`,
   `AUDIT_EXPORT_SIGNING_KEY`, `AUDIT_ATTESTATION_KEY` + `_ID`/`_PREV`/`_PREV_ID`
   — all fail-closed in production per 21 CFR Part 11), the internal
   service/admin tokens (`ADMIN_TOKEN`, `ANA_OPS_TOKEN`, `ANA_SERVICE_TOKEN`),
   and the CORS/URL config (`ALLOWED_ORIGINS`, `APP_URL`, `APP_BASE_URL`).

The remaining 244 are lower-risk feature flags and tuning knobs (`ANA_*`,
`ENABLE_*`, `FDA_*`, …), documented incrementally by their subsystem owners.

## When CI fails on this gate

The failure lists each new undocumented variable and where it is read. Pick one:

1. **Document it (preferred).** Add the variable to `.env.example` with a value
   or a commented example line and a short comment describing what it does and
   its safe default. Re-run
   `node scripts/ci/check-env-var-docs.mjs --strict-no-regression` — the
   variable is now documented and the gate passes.
2. **Re-baseline (intentional/internal only).** If the variable is genuinely
   internal and should not appear in the operator-facing example, run
   `node scripts/ci/check-env-var-docs.mjs --write-baseline` and commit the
   updated baseline. Prefer option 1 whenever operators would ever set the
   variable.

## Ratcheting the baseline down

As variables get documented in `.env.example`, they drop out of the finding set.
The no-regression run reports how many baseline variables are now documented and
suggests re-baselining. Run `node scripts/ci/check-env-var-docs.mjs
--write-baseline` and commit the shrunk baseline to lock in the gain — the same
ratchet the `.typecheck-baseline.json` gate uses. The goal is `count: 0`.

## Commands

| Command | Purpose |
| --- | --- |
| `node scripts/ci/check-env-var-docs.mjs` | Report undocumented variables (exit 0). |
| `node scripts/ci/check-env-var-docs.mjs --strict` | Fail if there is **any** undocumented variable. |
| `node scripts/ci/check-env-var-docs.mjs --strict-no-regression` | Fail only on variables not in the baseline (the CI gate). |
| `node scripts/ci/check-env-var-docs.mjs --write-baseline` | Snapshot the current undocumented set as the baseline. |
| `node scripts/ci/check-env-var-docs.mjs --json` | Emit the full result as JSON. |
