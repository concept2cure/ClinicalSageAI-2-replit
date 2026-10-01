# Client-runnable compliance reports — server half (D6, 2026-09-30)

Founder request, 2026-09-26: "work on security audit reports clients may ask for in an
audit or if a regulator asks for such reports … make sure these reports are available for
clients to run." This folder is the evidence for the server half: a catalog of
deterministic, tenant-scoped reports, each run sealed and recorded on the organisation's
audit chain before anything leaves. The client half (the surface that lists and runs them)
is a separate helper's work and has its own evidence.

## What was wrong

1. **No report an organisation could run for an inspector.** The only client-reachable
   export was the full signed audit trail. An access review, a sign-in register, a
   signature register, an integrity attestation, a retention/hold statement or a
   controlled-document register had to be assembled by hand from raw rows, with nothing
   sealing what was handed over and nothing recording that it was.
2. **A signed audit export said `"brokenAt": "[object Object]"`.**
   `signedAuditExport.ts auditLogsChainVerdict` wrote `String(v.brokenAt)`. The verifier's
   `brokenAt` is a `ChainBreak` object, so every broken-chain manifest lost the location of
   the break, and the redaction every other export applies (`audited-export.ts
   breakForTenant`, DP-44) was skipped. Red: `red/unit-and-route.red.txt`
   (`signed-export-broken-at.test.ts`: `expected '[object Object]' not to be '[object Object]'`).

## What is true now

`GET /api/audit/reports` (any signed-in member) returns the catalog and `canRun`, computed by
`canReadAuditTrail` — the function the run route's gate (`requireAuditReader`) uses.

`GET /api/audit/reports/:reportId?from&to&format` (owners, admins, managers, platform
administrators) runs one of seven reports:

| id | period | sections |
|---|---|---|
| `access-review` | as-of | members, privileged |
| `authentication-events` | range | events, summary |
| `administrative-changes` | range | changes |
| `electronic-signatures` | range | signatures |
| `audit-trail-integrity` | range | stores, verdicts |
| `retention-legal-holds` | range | policies, holds, dispositions |
| `controlled-documents` | as-of | documents, changes |
| `audit-trail` (catalog entry only) | range | its run is the existing `GET /api/audit/export/signed`; the run route answers 409 `USE_SIGNED_EXPORT` |

Each run, in order, refuses before the next step reads anything:

1. session organisation (`requireAuthedOrgId`) and audit-reader role (`requireAuditReader`) — 403;
2. report (404 `UNKNOWN_REPORT`, 409 `USE_SIGNED_EXPORT`), format, period (400 `BAD_PERIOD`);
3. the audit export signing key (`resolveExportSigningKey`) — 503 `REPORT_SIGNING_UNAVAILABLE`
   on a production deployment without it, before any query;
4. the tenant chain walk (`walkTenantChain`), then every section on ONE connection, in ONE
   `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction stamped with
   `setTenantContextTx`; every statement also carries its own `organization_id = $1` /
   `tenant_id = $1` predicate; 50,000-row cap per section with `truncated: true`;
5. the seal: `sealManifestV2` (new, in `signedAuditExport.ts`) — the ONE signer;
   `generateSignedAuditExport` now seals through it too;
6. one `compliance.report_run` row on the organisation's chain via `sendAuditedExport`,
   written BEFORE the package is sent; when it cannot be written, 503 `REPORT_NOT_RECORDED`
   and nothing leaves.

Any other failure is a 500 through `serverError` (static envelope; detail logged).

A produced package verifies with `verifySignedAuditExport` and through
`POST /api/audit/export/verify`, and fails after a one-byte change to `data` (route test
"the existing verification endpoint verifies the package…", unit `signed-report.test.ts`).

## Decisions made where the brief and the code disagreed (each verified at the source)

- **`superseded_by_type`, `superseded_at` are not columns of `electronic_signatures`.** They
  are the superseding signature's own `signature_type` and `signed_at`, joined by
  `superseded_by` within the organisation. `red/column-provenance.brief-columns.red.txt`
  shows the two names have no creator in any applied migration.
- **The lifecycle override is stored as `authorization.tenant_lifecycle_override`**, not
  `tenant_lifecycle_override`: `tenantLifecycleGuard.ts` writes through
  `auditLogger.logAuditEvent`, which stores `<category>.<action>`. Same for
  `authorization.organization_switch`. Every other action string was confirmed at its writer
  (listed in each query module's header).
- **`persona`** is `organization_users.persona`, not a `users` column.
- **Names.** Current members' names come from `users` (readable under the membership policy,
  20260928). Past actors use `public.actor_name`, wrapped as
  `LEFT JOIN LATERAL (SELECT … FROM public.actor_name(x) x LIMIT 1)` (`queries/section.ts
  actorJoin`). The bare form carries the function's default 1,000-row estimate per join; two
  joins on an empty table planned a million-row result and spent ~0.7 s in JIT
  (`green/actor-join-plan.txt`: cost 8,757,692 → 25; the controlled-documents run 817 ms → 3 ms).
- **The vault is policied on the organisation UUID** (`identity.can_access_program` reads
  `app.current_org_id`), not the integer tenant id. The retention report binds this
  organisation's UUID on the snapshot from the session scope (`currentTenantOrgUuid`),
  checked against the session's organisation id. Without it, in the degraded membership
  path the vault read is silently empty: `red/dbtest.mutation-no-vault-binding.red.txt`
  (`expected [] to deeply equal [ '…-policy-A' ]`).
- **Controlled documents is as-of; its change-control section** lists change controls open on
  the as-of date (raised by its end, not closed before it began), and says so in its notes.
- **`notRecorded`** follows the brief, made precise where the code says more: a member removed
  by an administrator leaves no record, but a SCIM removal is recorded (`scim.ts
  removeMembership`) and appears in the administrative-changes report.
- **Integrity verdicts** are `intact` / `broken` / `not verified`. A check that did not run,
  or ran over nothing (no hashed rows, no sealed rows, no seal key), is `not verified` with
  the reason, never `intact`; a check's failure text goes to the log, not the report. The
  HMAC seal check runs `verifyAuditChainSeals` for the one tenant on the same admin-scope
  connection shape the chain walk uses (`integrity-checks.ts`).
- **An unknown `format`** is refused 400 `BAD_FORMAT` rather than read as JSON.
- **The `brokenAt` fix** renders an object through `breakForTenant` then `JSON.stringify`; a
  non-object value (no verifier returns one; the existing pglite test passes a string fake)
  is kept as text, so that test stays green unedited.

## Tests — red, then green

| Test | Red (before / mutation) | Green |
|---|---|---|
| `server/services/audit/compliance-reports/__tests__/` (catalog, period, csv, signed-report, integrity-report, signed-export-broken-at) and `server/routes/__tests__/audit-compliance-reports.test.ts` | `red/unit-and-route.red.txt`: 7 files fail (modules absent; `brokenAt` = `[object Object]`) | `green/unit-and-route.green.txt`: 13 files / 134 tests, including the five existing signed-export suites named in the brief and `audited-export.test.ts` |
| `tests/db/compliance-reports.dbtest.ts` (real PostgreSQL, app_service, RLS on) | `red/dbtest.before-change.red.txt` (route absent); `red/dbtest.mutation-no-vault-binding.red.txt` (1 failed); `red/dbtest.mutation-send-without-recording.red.txt` (2 failed: no `compliance.report_run` row) | `green/dbtest.green.txt`: 16 / 16 |
| Neighbouring suites that load the changed modules (route registry, audit-trail routes, tenant export, chain monitor, …) | — | `green/neighbouring-suites.green.txt` 14 files / 471; `green/neighbouring-suites-2.green.txt` 7 files / 195 |
| Column provenance: every `table.column` the SQL names has a creator in an applied migration or the drizzle push surface | `red/column-provenance.brief-columns.red.txt` (the brief's two non-columns) | `green/column-provenance.txt` (0 missing; script `green/column-provenance.script.mjs.txt`) |

The dbtest: two organisations; a login row, an invitation, a retention disposition, a
program with a vault document under a named policy, a legal hold and a QMS document in
each; the permanent fixture signature in each. Every report run as A's administrator
verifies, carries A's rows and none of B's identifiers; a non-reader member is refused; a
run writes exactly one `compliance.report_run` row on A's chain (actor, export id and data
hash match the manifest; `sha256_chain` set) and none on B's; the vault is reached even
when the session scope carries no UUID.

## Gates

| Gate | Result |
|---|---|
| `npm run -s ci:server-error-leaks` | OK — 96 baselined sites, no file gained one (`gates/ci-server-error-leaks.txt`) |
| `npm run -s check:security-patterns` | 0 violations across 2944 files |
| `node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression` | OK — 228 current, 228 baseline |
| `npm run -s ci:tenant-isolation:no-regression` | OK — 8 current, 8 baseline; none in these files |
| `npm run -s ci:column-reachability` | OK |
| `npm run -s ci:check-unrun-tests` | OK — every test file reachable |
| `npx eslint` on the new and edited files | 0 warnings in new files; the two edited files keep their pre-existing warnings only (`signedAuditExport.ts` 1, `register-inline-routes.ts` 33 — the same counts as HEAD) |

## Database

The local deploy-shaped database had been provisioned on 2026-09-26 and lacked
`20260928_users_membership_rls.sql`, `20260929_actor_names.sql` and later files, so
`public.actor_name` did not exist. It was brought to the branch's migration set with
`node scripts/db/deploy-migrate.mjs` before the dbtest ran (`db/deploy-migrate.excerpt.txt`:
328/328 files, readiness contract green).

## Commands

```
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run \
  server/services/audit/compliance-reports/__tests__ \
  server/routes/__tests__/audit-compliance-reports.test.ts \
  server/services/audit/__tests__/signed-audit-export-key-id.test.ts \
  server/services/audit/__tests__/signed-audit-export-canonicalization.test.ts \
  server/services/audit/__tests__/signed-export-audit-logs.pglite.test.ts \
  tests/gates/unverified-verdicts/signed-audit-export.gate.test.ts \
  server/routes/__tests__/audit-export-tenant-scope.test.ts \
  server/services/audit/__tests__/audited-export.test.ts

TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
APP_DATABASE_URL='postgresql://app_service:<local>@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=3072 \
  npx vitest run --config vitest.db.config.ts tests/db/compliance-reports.dbtest.ts

npm run -s ci:server-error-leaks
npm run -s check:security-patterns
node scripts/ci/audit-requestdb-coverage.mjs --strict-no-regression
npm run -s ci:tenant-isolation:no-regression
```

## Files

New: `server/services/audit/compliance-reports/` (`types.ts`, `catalog.ts`, `period.ts`,
`csv.ts`, `generate.ts`, `signed-report.ts`, `integrity-checks.ts`, `queries/*.ts`,
`__tests__/*.test.ts`), `server/routes/audit-compliance-reports.ts`,
`server/routes/__tests__/audit-compliance-reports.test.ts`,
`tests/db/compliance-reports.dbtest.ts`.
Edited: `server/services/audit/signedAuditExport.ts` (exports `sealManifestV2`, `sha256Hex`,
`sanitizeCsvValue`, `snapshotChainIntegrity`; `generateSignedAuditExport` seals through
`sealManifestV2`; the `brokenAt` fix), `server/bootstrap/register-inline-routes.ts` (one
mount line and its import, directly after the audit-trail routes).

## Not done here, and suggested follow-ups outside this lane

- `ROWS 1` on `public.actor_name` (amend `migrations/20260929_actor_names.sql` in place with a
  dated header note, CLAUDE.md Rule 1) would fix the 1,000-row estimate for every caller; the
  reports avoid it locally with `actorJoin`.
- `verifyTenantSealsOnAdminScope` (`integrity-checks.ts`) could sit beside
  `verifyTenantChainOnAdminScope` in `tenant-chain-verdict.ts`, the one home for admin-scope
  verdicts; it was kept in this directory because that file is outside this lane.
- What the reports state as not recorded is a list of product gaps: member role changes and
  administrator removals, invitation acceptance, SCIM group role changes, tenant security
  settings, SCIM token and IP allow-list administration, session ends by timeout or
  supersession, refresh refusals, and the retention sweep's skips and refusals.

---

## Review round 1 (2026-10-01): security, honest-state and Part 11 UX reviews

Evidence in `review-1/`. Red first, against the round-0 code:
`review-1/red/unit-and-route.red.txt` (26 of 112 tests fail) and
`review-1/red/dbtest.red.txt` (12 of 16 fail). Green after the fixes:
`review-1/green/unit-route-and-exports.green.txt` (19 files / 199 tests: the report unit and
route tests, the five signed-export suites, `audited-export.test.ts`, the turn-record export
and the three authoring-record pglite suites), `review-1/green/dbtest.green.txt` (16 / 16),
`review-1/green/neighbouring-suites.green.txt` (18 files / 488, including the four authoring
export suites). Some statements above describe round 0; where they differ, this section is
current.

| # | Finding | Fix | Red → green |
|---|---|---|---|
| 1 | `walkAuditChain` answers `ok: true, rowsChecked: 0` over no rows, and every reader passed it on as a pass | At the source, `audited-export.ts walkTenantChain` (serves the turn-record, authoring and report exports): `ok: null, rowsChecked: 0`, reason *No chained rows exist for this organisation, so there is no chain to verify.* Same rule in `signedAuditExport.ts auditLogsChainVerdict` (`unverified`) and in the attestation's chain row (`not verified`) | `zero-row-chain.test.ts` 3 fail → pass; turn-record and authoring export suites green |
| 2 | Every report walked the whole chain (DP-46); `chain` claimed a verdict it did not check | `data.chain` / `manifest.chainAtGeneration` = `{ ok, scope, rowsChecked?, reason?, checks? }`. Only `audit-trail-integrity` walks (`walksChain`); its `ok` is true only when all three checks are intact, false when any is broken, else null with *n of m checks could not verify.* The other six: `scope: 'not-checked'`, `ok: null`, and they do not walk. One run at a time per organisation (429 `REPORT_IN_PROGRESS`); rate limit 12 runs a minute per organisation and person on `express-rate-limit`, the pattern `cerv2-export-routes.ts` uses (429 `REPORT_RATE_LIMITED`), mounted after the reader gate | route tests (no walk for access review; attestation summary; concurrency; rate limit), `review-round-1.test.ts` item 2, dbtest scope per report |
| 2b | The audit_events linkage check reads every row | **Not changed.** An SQL aggregate (LAG over `sequence_number`, partitioned by organisation) would compute the same counts, but `snapshotChainIntegrity` is pinned to reading rows by `tests/gates/unverified-verdicts/signed-audit-export.gate.test.ts`, whose pool double serves raw rows to the snapshot query; that gate is outside this lane. A second, aggregate implementation inside the report would be a parallel copy of the linkage count. The run is bounded by the concurrency and rate limits instead. Follow-up: move the count into SQL in `snapshotChainIntegrity` and update the gate's double in the same change | — |
| 3 | "independent verification" claimed; the instruction did not say who can verify | Manifest description: *sealed with the platform's audit export key*. `VERIFY_INSTRUCTION`: HMAC-SHA256 under a key the platform holds, `signingKeyId`; a signed-in member sends `{ data, manifest, signature }` to `POST /api/audit/export/verify`; for a CSV, data is the CSV text exactly as saved and manifest/signature come from the `.manifest.json`; an inspector verifies through the organisation. Catalog `readers`: *organisation owners, admins and managers, and platform administrators* | `review-round-1.test.ts` item 3; route catalog test |
| 4 | Access review implied role history and a review decision | Role, persona and platform roles named in the current-state note; not-recorded: role changes beside removals, *A member's role on a past date cannot be reported…*, *This report records no review decision, reviewer or sign-off…* | `review-round-1.test.ts` item 4 |
| 5 | Settings changes stated vaguely | Verified at the code: `tenant-config.ts` PATCH `/:tenantId/settings`, PATCH `/:tenantId/settings/:section` and POST `/:tenantId/settings/reset` write no audit row (branding, security: second-factor requirement, password policy, session timeout, IP restrictions; notifications; workflow; CER and QMP incl. audit-trail retention; integrations). `organizations-routes.ts` PATCH `/:id/settings` records `data_modify` on `organization_settings` with `sections` (names only). Both stated exactly | `review-round-1.test.ts` item 5 |
| 6 | `meaning` fell back to the type | `meaning` = `signature_meaning` as stored; `signature_purpose` and `signed_version` (`signature_manifest->>'version'`) are columns | dbtest: the fixture signature's meaning is `null`, purpose `fixture-body-A` (was `approval`) |
| 7 | A revoked approval could be shown as the approval; closed change controls dropped | Approval/retirement/change-approval joins take the latest signature that stands (`is_valid`, not `revoked`, no `superseded_by`); `approval_signer_name`, `approval_meaning`, `revoked_approval_signatures`, `superseded_by_id`; every change control raised by the date and not deleted, with `description` and `reason`. Not recorded: deleted documents; distribution; read-and-understood training lives in the QMS training records (`qms_training_records`, per person and version), and use at the point of use is not recorded | dbtest: a later revoked approval was shown (red); now the earlier valid one, count 1; a change closed two days ago appears |
| 8 | The chain row said nothing a ledger reader could read | `details.description`: *Ran <title> (<period>, <format>), export <exportId>* | route test |
| 9 | An organisation id of 0, negative or fractional passed the guard | `usableOrgId(authedOrgId(req))`, as `report-os.ts requireSessionOrg`, on both routes, before anything | route tests for 0, -3, 7.5 |
| 10 | Timestamps were driver-rendered, unzoned ones read in the server's zone | Every timestamp is ISO-8601 UTC text from SQL (`queries/section.ts isoUtc` / `isoNaiveUtc`). Unzoned columns (`electronic_signatures.signed_at`, `audit_events.timestamp`, `users.*_at`, `organization_users.created_at`, `audit_logs.created_at`) are written by `now()` or by node-postgres from a JS Date in the process's local time; the image (`node:22-slim`, no TZ) and the database (RDS default, no timezone parameter in this repository) run in UTC, so they hold UTC wall-clock time — stated in each section's notes. Period bounds compare as instants against zoned columns and as UTC wall-clock against unzoned ones | dbtest ISO assertions (red: `…51.091Z` with milliseconds from the driver) |
| 11 | A CSV could not be placed | A leading block of `# ` lines — title, report id and version, organisation, period, generated at, chain verdict and reason, each section's row count, completeness and notes, then the not-recorded list — each one quoted cell (their text has commas); formula neutralisation unchanged | `csv.test.ts` block tests |

Gates after this round (`review-1/gates/`): `ci:server-error-leaks` OK (96 = baseline);
`check:security-patterns` 0 violations; `audit-requestdb-coverage --strict-no-regression` OK
(228 = 228); `ci:tenant-isolation:no-regression` OK (8 = 8, none in these files);
`ci:column-reachability` OK; `ci:check-unrun-tests` OK; ESLint: no new warnings (34, all
pre-existing in `register-inline-routes.ts` and `signedAuditExport.ts`). Column provenance for
the new columns: `review-1/green/column-provenance.txt` (0 missing).

The dbtest now seeds, per run and removed in `afterAll`, a closed change control in each
organisation and two approval signatures on A's QMS document (one valid, one later and
revoked; signer: the fixture's permanent signer). The signatures are removed as the table
owner with the immutability trigger disabled for that transaction only, the pattern the
fixture uses for audit rows.

Files changed in this round: `server/services/audit/audited-export.ts` (named by the
coordinator for item 1), `server/services/audit/signedAuditExport.ts`, the
`compliance-reports/` modules and tests (new: `run-limits.ts`,
`__tests__/zero-row-chain.test.ts`, `__tests__/review-round-1.test.ts`),
`server/routes/audit-compliance-reports.ts` and its test, `tests/db/compliance-reports.dbtest.ts`.
