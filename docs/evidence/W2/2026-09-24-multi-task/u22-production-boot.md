# U22 — the production bundle, booted twice against an empty database provisioned end to end

Launch row: **D1** (production as configured). Date: 2026-10-01. Branch:
`concept2cure-v2`.

Today's units were each proven in isolation: U3b, U18, U19, U20 and U21. This
run puts them together the way production runs them. The database is
provisioned from empty by the documented command, then two copies of the
production bundle are started against it. Nothing is mocked.

## How it was run

- **Database.** PostgreSQL 16.13 with pgvector installed, so `npm run
  db:provision` does not degrade. It was provisioned into an empty database
  with the owner and runtime role split that production uses
  (`DATABASE_OWNER_URL`, `APP_DATABASE_URL` as `app_service`). Exit 0:
  - tenant isolation policy: 19/19 tables;
  - readiness contract held as `app_service` (superuser=false,
    bypassrls=false);
  - grant audit: 1291/1291 application relations.
- **Replay.** `deploy-migrate` was run a second time over the provisioned
  database, as every deploy does (CLAUDE.md Rule 1). Exit 0, "safe to roll
  services".
- **Today's tables.** `scheduled_job_claims` (with `result`),
  `session_activity`, `coordination_leases` and
  `project_continuity_snapshots` each have forced RLS and one tenant policy.
- **Bundle.** `node scripts/build-server.mjs` builds `dist/index.js`, which is
  started with `NODE_ENV=production` and every variable in deploy-aws.yml's
  preflight list. Settings:
  - `RLS_ENFORCE=on`, the runtime role, `TRUST_PROXY_HOPS=2`, no Redis
    (decision B6);
  - an Anthropic key, placement approvals naming `anthropic`, and
    `STORAGE_PROVIDER=s3`.
- **Database TLS.** It is verified, as production verifies RDS:
  `sslmode=verify-full` against a throwaway CA passed in
  `NODE_EXTRA_CA_CERTS`, the way the image passes the RDS bundle. The first
  boot without TLS was refused ("The server does not support SSL
  connections").
- **The one deliberate difference.** The signer is `hmac` with
  `CONCEPT2CURE_SIGNER_ACCEPT_HMAC=true` instead of `kms`, because there is no
  KMS here.
  - The boot refused `local` (not a mode), `dev` (not permitted in
    production), and `hmac` without the explicit acceptance.
  - Every refusal named its reason.

## What it showed

**`/readyz`, honest about each dependency:**

```
"database": "ok", "schema": "ok", "ana": "ok", "storage": "down",
"redis": "skipped", "worker": "skipped"
"storageDetail": "the vault store (s3) did not answer"
```

- `ana: ok` holds because the Anthropic key is present (U3a/U3b).
- `storage: down` is correct: there is no S3 here.
- `redis` and `worker` read `skipped` by decision B6.

**First-run setup** (`POST /api/setup/initialize`, sent with the headers the
load balancer adds):

- `Password123!` was refused as too common. That is the password blocklist
  answering inside the bundle; before U18 it threw and returned 500.
- A strong password created the organisation and its administrator and
  returned a session.

**One session on two processes (U20).** The same token on task A and task B,
alternating, returned 200 four times. There is one `session_activity` row,
organisation 0, with `last_seen_at` advanced by both processes.

**Schedulers on two processes (U19).** With both processes booted:

- the audit-chain monitor claimed and finished one window;
- the sentinel scanned each organisation once (one claim each for
  organisations 1 and 2), not twice.

## The defect it found: CSRF refusals were never audited

Task A's log had two error lines that no unit test had shown:

```
[audit-service] Failed to write chained audit_logs row
[audit-service] Failed to write tamper-proof audit entry
  error: [tenant-rls] FAIL-CLOSED: pool.connect requires an active tenant scope while RLS_ENFORCE=on
  at AuditService.logAction ← auditSecurityEvent (server/middleware/enterprise-security.ts)
```

The CSRF guard writes a `csrf_validation_failed` security event for every
request it refuses. It runs before authentication, so no tenant scope exists,
and RLS refused the write. **In production every refused cross-site request
lost its audit record**, in both the chained `audit_logs` and the tamper-proof
store, and logged two errors instead.

**Fix.** `auditSecurityEvent` writes under the audited system scope. A
security event that no tenant owns goes to the platform chain (tenant 0).

**Verified by making it fail.**

- **`server/middleware/__tests__/csrf-rejection-audited.test.ts`:** red before
  (`expected null to match object { tenantId: '0', … }`), green after. With
  the two existing CSRF suites, 9/9 pass.
- **In the bundles, side by side,** the same refused request (no Origin, no
  Referer, no Bearer):
  - rebuilt task A: one `audit_logs` row (tenant 0), one
    `audit.tamper_proof_log` row, and no error lines;
  - task B, still on the old bundle: no row, and both error lines.

`tsc` reports 0 errors, and ESLint shows the same 4 warnings before and after.

## Not shown here

- S3, SMTP delivery and KMS. None is reachable from this environment;
  readiness reports S3 as down, and the boot guards for the signer were
  exercised.
- A deploy after more than 15 minutes of activity. The real-Postgres test in
  U20 covers that.

## Probe: every API path the v2 client names, against the production bundle

All 480 `/api/...` literals found under `client/src/concept2cure/v2` were
called with GET, as the organisation's administrator, on a fresh session.

- **Session.** It was minted with this simulation's own JWT secret. The setup
  session had correctly been signed out after 15 idle minutes: 449 × 401
  `SESSION_IDLE` on the first attempt.
- **Client addresses.** Varied per request, so the `/api` per-address limiter
  did not mask results. The per-account limiter still answered 27 × 429.

| Status | Count | Reading |
|---|---|---|
| 200 | 96 | |
| 403 | 215 | 202 × `LAUNCH_SCOPE`, by design: surfaces outside this release (CMC, biostatistics, CRO, the submission twin). None of them is called from a launch-catalog surface. The Reporting callers among them are the reporting lane's deliberate cut ("production reaches only the routes its screens call"). 12 × Master Administration, platform staff only. |
| 404 | 128 | POST-only paths reached with GET, and ids that do not exist |
| 429 | 27 | the per-account limiter |
| 500 | 9 | all Authoring routes called with the client fixtures' literal ids `D1`/`S1`/`S2`: `invalid input syntax for type uuid` |
| 501 | 1 | SAML callback: SSO not configured |

**The nine 500s are not a defect to fix here.** `server/middleware/uuidParam.ts`
records that this guard was added to the Authoring router and withdrawn on
purpose. No client sends a malformed id; `D1`/`S1` exist only in test
fixtures, and the guard turned 21 fixture tests red. The probe picked those
literals up from client source.

**Error-level log lines in the probe run:** only those nine. No fail-closed
scope errors, no missing files, and no unhandled rejections on any path.
