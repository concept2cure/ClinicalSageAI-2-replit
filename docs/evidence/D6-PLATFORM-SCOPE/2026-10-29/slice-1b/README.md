# P-72 slice 1b: the controls that never ran now run, each organisation in its own scope

Launch row **D6** (tenant isolation), with the Part 11 audit-trail controls it depends on. Decision P-72 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, "### P-72"). Design: `docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md` §3.6 and §6 ("Slice 1a, landed 2026-10-30", whose queue this slice takes). Measurements that bind it: `../slice-0/README.md`.

Measured on 2026-10-30 at base `4323b9149` plus this lane's working tree:
- on a private PostgreSQL 16.15 cluster, using production-shaped copies (`probes/base.txt`);
- in vitest, for the unit tests and mutations.

This slice completes the WIP patch `../slice-1b-wip/`. That patch was preserved after the container restart, verified here, and corrected where it was wrong. When this lands, the lead deletes the `-wip` folder.

## In short

- **The Vault retention sweep never ran. It runs now.**
  - At HEAD, on a production-shaped copy, it scanned **0 of 2** expired documents, with the platform arm or without it.
  - Now it sweeps each organisation in its own scope (tenant id **and** organisation uuid, no role) and scans **2 of 2**:
    - organisation A's document is under a legal hold, so it is left in place;
    - organisation B's hold was lifted, so its document is archived, soft-deleted and audited under B.
  - The result is the same with or without the arm.
- **The daily audit-chain sweep failed every day over 0 rows. It now verifies every organisation's chain.**
  - At HEAD it answered `ok:false, rowsChecked:0`, with `audit_logs.chain`, `.seals` and `.anchor` all in error ("this connection is scoped to one tenant"), with or without the arm.
  - Now each organisation is verified on a read-only snapshot in its own scope:
    - 6 of 6 chained rows across 4 organisations; the chain and the seals are ok;
    - an anchor is written with both heads;
    - the next run verifies that anchor: ok.
- **The on-demand verifiers said "valid" over nothing. They now say they did not verify.**
  - With the arm removed, `verifyTenantChainOnAdminScope` read 0 of each tenant's 3 chained rows and answered `ok:true`. Every reader then said "No chained rows exist".
  - `verifyTenantSealsOnAdminScope` answered `ran:true, valid:true` over 0 of 3 sealed rows.
  - Now:
    - the verifier counts the tenant's rows in the tenant's own scope;
    - a walk that read fewer is `ok:null`, with the reason "could read 0 of this organisation's 3 chained audit_logs rows";
    - every reader carries that reason;
    - the seal check is `ran:false`.
  - With the arm present, both verifiers answer exactly as before.
- **Four more writers of `app.current_user_role` refuse the platform role**, as slice 1a's scopes do:
  - `setTenantContextTx`, the MCP tool-call client, Ana's catalog scope and the signed-act route;
  - each reuses slice 1a's exported `isPlatformScopeRole` and `PlatformScopeRoleRefusedError`;
  - the role is refused in any case or padding.

  At HEAD, `setTenantContextTx(A, 'app_super_admin')` in A's own scope opened B's audit rows: 0 visible before the call, 4 after. Now it is refused before any statement runs.
- **Tests:**
  - 11 new or extended test files. At HEAD, 50 of their tests fail and 47 pass (the controls, and the tests of what did not change).
  - Now every lane test passes: 366 of 368 across 32 files. The 2 that fail are one pre-existing file, which fails the same way with this lane's files at HEAD (see "Found, not fixed").
  - 27 unit mutations and 3 database mutations. Each one turns its test red, and every mutated file is restored byte for byte.
  - Gates pass. ESLint shows 20 warnings at HEAD and 20 now, per file, with 0 errors. Scoped tsc reports no error in any lane file (`gates.txt`).

## What already exists

These were searched before any change (CLAUDE.md Rule 3). Nothing here was rebuilt. Each item was **fixed**, **completed** or **reached**.

| What | Where | What it did before | What it did not do |
|---|---|---|---|
| The retention job, its runner and its schedule | `server/jobs/retentionCron.ts` (`runRetentionSweep`, `runRetentionJob`, `startRetentionSchedule`), `server/bin/run-retention.ts` | Archived, soft-deleted and audited each expired document, under a legal-hold check that fails closed. It refused destruction. | It ran in the system scope (tenant `0`, no uuid), where `vault.documents` admits nothing, so it never ran. It saw holds only through the platform arm. **Fixed**: it now runs per organisation. There is no separate retention service. |
| The organisation scope helper | `server/services/tenant-export/company-export-snapshot.ts` `inOrganizationScope`, built on `server/db/tenantStore.ts` `runWithTenantScope` | Opens one organisation's scope (tenant id, uuid, no role) for the export. | It is request-sourced, and it throws the export's own error. **Reached**: the sweep calls the function it builds on, `runWithTenantScope`, with the same shape and `source: 'job'`. No second helper exists. |
| The per-organisation job scope | `server/db/tenantStore.ts` `runWithOrgJobScope` | Tenant id, no uuid, no role, for jobs. | **Reached** by the audit sweep. `audit_logs` and `audit_events` key on the integer tenant, so they need no uuid. |
| The audit integrity sweep | `server/jobs/auditChainIntegritySweep.ts` | Verified every store, alerted on incidents, anchored the heads. | It sent every statement outside a transaction, so the pool applied no scope, and it answered `ok:false` over 0 rows every day. **Fixed**: per organisation, each on a read-only snapshot. Its per-organisation verdicts moved to `server/jobs/auditChainOrganizationVerdicts.ts`, unchanged except for scope and merge. |
| Per-tenant chain and seal walks | `server/services/audit/chain.ts` `verifyAuditChain(client, { tenantId })`, `verifyAuditChainSeals(client, { tenantId })` | Already took a tenant. | **Reached** from `audit-integrity-service.ts` `verifyAuditIntegrity`, which now passes its options on. |
| The audit_events walk and seal check | `server/services/audit/chainIntegrityMonitor.ts` `summarizeChainLinkage`, `server/services/audit/seal-coverage.ts` `verifyAuditEventsChainSeals` | Walked every organisation's rows. | **Completed**: the seal check takes `{ organizationId }`, and the linkage read filters to the organisation. |
| The anchor | `server/services/audit/chain-anchor.ts` `writeAuditChainAnchor`, `verifyAuditChainAnchor`, `readAuditChainHeads`, `refusePartialView` | Read every organisation's head in one cross-tenant statement, and refused a tenant-scoped connection. | **Completed**: an optional `inOrganizationScope` opener (a callback type, not a scope helper; the sweep passes `runWithOrgJobScope` plus a snapshot) reads and compares each head in its own scope. A connection scoped to another tenant is refused. The verdict and the archive allowance are unchanged. |
| The tenant verdict and its readers | `server/services/audit/tenant-chain-verdict.ts` `verifyTenantChainOnAdminScope`; `audited-export.ts` `tenantChainVerdict`, `walkTenantChain`, `NO_CHAINED_ROWS_REASON`; `audit-trail-ledger.routes.ts` `readAuditLedger`; `signedAuditExport.ts`; `tenant-export/held-record-integrity.ts`; `routes/decision-lineage.ts`; `routes/c2c/actions.ts` `/verify-chain` | `ok:null` meant the anchor could not be read, and every reader said so. `ok:true, rowsChecked:0` meant "no chained rows". | It could not tell "no rows" from "rows it could not see". **Fixed**: the verifier counts first, and a short walk is `ok:null` with a `reason`. Each reader carries that reason. Two readers took zero rows as a verdict and now do not (below). |
| The seal check of the compliance report | `server/services/audit/compliance-reports/integrity-checks.ts` `verifyTenantSealsOnAdminScope` | Counted the sealed rows on the admin scope. | Without the arm, it counted 0 and said "valid". **Fixed**: it counts in the tenant's own scope and is `ran:false` when it verified fewer seals. |
| The platform-role refusal | slice 1a, `server/db/tenantStore.ts` `isPlatformScopeRole`, `PlatformScopeRoleRefusedError` (exported, `ae12195a5`) | Refuses the role string on the request and per-user scopes. | **Reached** from the four other writers. Nothing was copied. |
| The four writers | `server/services/tenant/governed-tenant-context.ts` `setTenantContextTx`; `server/mcp/tools/runtime.ts` `createMcpCallSqlClient`; `server/services/ana/catalog-scope.ts` `catalogScope`; `server/routes/governed-signed-act.ts` `signGovernedAct` | Wrote the caller's role to `app.current_user_role`. | **Fixed**: each refuses the platform role before writing. |

**Searches run.** The code was searched in `server/`, `shared/`, `scripts/`, `migrations/`, `db/` and `client/src/` for:
- `runRetentionSweep`, `runRetentionJob`, `RetentionSummary`, `retention`, `legal_holds`, `vaultLegalHolds`;
- `runAuditChainIntegrityCheck`, `verifyAuditIntegrity`, `verifyAuditEventsChainSeals`, `writeAuditChainAnchor`, `verifyAuditChainAnchor`;
- `verifyTenantChainOnAdminScope`, `verifyTenantSealsOnAdminScope`, `tenantChainVerdict`, `NO_CHAINED_ROWS_REASON`;
- `inOrganizationScope`, `runWithOrgJobScope`, `runWithTenantScope(`;
- `setTenantContextTx`, `set_config('app.current_user_role'`, `isPlatformScopeRole`;
- the client callers of `/api/decision-lineage/verify-chain` and `/api/c2c/actions/verify-chain`.

`git log --all --diff-filter=D` was run on `*retention*`, `*Retention*`, `*auditChain*`, `*chain-verdict*`, `*seal-coverage*`, `*integrity-checks*`, `*catalog-scope*` and `*governed-tenant-context*`. No deleted file matched.

## What changed, item by item

### 1. The Vault retention sweep (`server/jobs/retentionCron.ts`, `server/bin/run-retention.ts`)

- The list of organisations is the only read in the system scope. It comes from `organizations`, whose read policy is open. The retention policies are reference data with no tenant key, and are read once.
- Each organisation is swept in `runWithTenantScope({ tenantId, orgUuid, role: null, source: 'job' })`, the P-66 pattern. In its own scope, an organisation's policies admit its documents, its programmes and its holds, with or without the arm, and nothing of another organisation's.
- An organisation sweeps the expired documents of the programmes it **owns**. A hold is always placed by the organisation that owns the programme or document (`routes/vault-legal-holds.ts` `targetOwned`), so the owner's scope reads every hold that can cover them. A delegate's scope also admits a sponsor's programme (`identity.org_relationships`), but it never sweeps the sponsor's documents; the sponsor's own run does, with the sponsor's holds.
- Holds are read for that organisation only, and still fail closed: if they cannot be read, the sweep aborts having deleted nothing.
- The sweep refuses two cases rather than guess:
  - **A document that names a different organisation from its programme's owner** is left in place and counted (`organizationMismatch`). `vault.documents` has no same-organisation key (`scripts/db/program-same-org-preflight.mjs`).
  - **An organisation with no uuid** is not swept (`organizationsNotSwept`), and a security alert is raised.

  Either case makes the job not clean, and the runner exits 1.
- `disposeDocument` refuses a document whose programme belongs to another organisation than the one being swept.

### 2. The audit integrity sweep (`server/jobs/auditChainIntegritySweep.ts`, new `server/jobs/auditChainOrganizationVerdicts.ts`)

- Every statement is inside a transaction. The pool applies a scope only when a transaction begins (`onSnapshot`: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, then `ROLLBACK`). A connection whose rollback failed is not returned to the pool.
- Each organisation's stores are verified on a snapshot in its own scope (`runWithOrgJobScope`): its `audit_logs` chain and seals, filtered to it, and its `audit_events` links and seals. Each store's verdicts are merged:
  - the worst status wins;
  - the rows checked are summed;
  - `organizationId` names where the worst verdict came from.
- Only stores with no tenant key (`audit.tamper_proof_log`, the triggers, the archive ledger) are read on the infrastructure connection, also inside a transaction.
- The anchor is verified and written per organisation (`chain-anchor.ts`, `inOrganizationScope`).
- The sweep still does not verify two kinds of row. Both wait for the platform door the design names for the cross-tenant walk (§3.4):
  - `audit_logs` rows with no tenant, which no organisation's scope admits;
  - an organisation's legacy (pre-`chain_seq`) rows, which link across tenants. For such an organisation, the walk refuses its own scope (`AUDIT_CHAIN_PARTIAL_VIEW`), so its chain is `unverifiable`: never ok, and not an incident.
- A store in which no organisation has a row is `unverifiable`, never ok.

### 3. Verifiers that checked nothing (`tenant-chain-verdict.ts`, `integrity-checks.ts`, and each caller whose meaning changed)

`countTenantChainRows(orgId)` counts the tenant's chained and sealed `audit_logs` rows in the tenant's own scope. The walk stays on the admin scope, because legacy rows need the cross-tenant context, and is held to that count.

| Caller | Rows read fewer than the tenant has | The tenant has no chained row |
|---|---|---|
| `verifyTenantChainOnAdminScope` | `ok:null`, `reason`, head not checked on that connection. **Was `ok:true`.** | `ok:true, rowsChecked:0`, unchanged; every reader below already turned it into "no chained rows". |
| Ledger, export walk, signed manifest, held-record export, compliance report row | Not verified, with the walk's reason. **Was "No chained rows exist" / `EMPTY`.** | Unchanged ("No chained rows exist" / `EMPTY`). |
| `GET /api/c2c/actions/verify-chain` (member) | 503 `AUDIT_CHAIN_NOT_VERIFIED`, with the counts. **Was 200 `ok:true`.** | 200 `ok:null`, `NO_CHAINED_ROWS_REASON`. **Was 200 `ok:true`.** |
| `GET /api/decision-lineage/verify-chain` and `/compliance-report` (member) | 503 `UNVERIFIABLE`. The report is UNVERIFIABLE and the attestation is withheld; the walk's own reason is logged. **Was 200 `VERIFIED` / `COMPLIANT`, because the verifier answered `ok:true` over 0 rows.** | The same 503 `UNVERIFIABLE`, logged with `NO_CHAINED_ROWS_REASON`. **Was 200 `VERIFIED` / `COMPLIANT`, with the "cryptographically-verified audit trail" attestation, over 0 rows.** The surface (`DecisionLineage.tsx`) shows its non-verified state. |
| `verifyTenantSealsOnAdminScope` (the report's seal check) | `ran:false`, "could verify 0 of the 3 sealed rows". **Was `ran:true, valid:true, sealedRows:0`.** | `ran:true, valid:true, sealedRows:0`, unchanged; the report states the count. |

Platform administrators' estate verdicts are unchanged.

### 4. The four writers of `app.current_user_role`

| Writer | Refusal |
|---|---|
| `setTenantContextTx` | Throws `PlatformScopeRoleRefusedError` before any statement. |
| MCP `createMcpCallSqlClient` | Throws before a connection is taken. |
| `catalogScope` | Refused before the `set_config`; the tool answers `PLATFORM_SCOPE_ROLE_REFUSED`, with no listing or content. |
| `signGovernedAct` | 403 `PLATFORM_SCOPE_ROLE_REFUSED` before the precheck, the authority or the password, so the attempt spends no password guess. `setTenantContextTx` refuses it again. |

## Proof

### Production-shaped database

The base is `lc_base_h`, described in `probes/base.txt`:
- P-72 slice 0's two-tenant database;
- replayed by `deploy-migrate`: 458 of 458 files, exit 0;
- every object then handed to `c2c_rds_master`, which is NOSUPERUSER and NOBYPASSRLS, as the RDS master is.

The method:
- Each run takes a fresh copy (`probes/copydb.sh.txt`, `probes/mk.sh.txt`) and seeds it (`probes/10-seed.sql.txt`).
- "Arm removed" copies then rewrite every platform-arm disjunct to `false`, in place: 978 policies, leaving 0 that read `app.current_user_role` (`probes/40-neutralise-p-arm.sql.txt`, slice 0's transform).
- The probe (`probes/21-controls.mts.txt`) runs the server's own code as `app_service` with `RLS_ENFORCE=on`. It seeds three chained `audit_logs` rows and one `audit_events` row per organisation, each in its own scope, then runs the four controls.
- Red runs put every lane source file back to HEAD (`probes/swapn.sh.txt`, which restores each file byte for byte and checks its SHA-256).

Summary: `db-summary.txt`. Full results: `db-*.jsonl.txt`.

| | HEAD, arm | HEAD, arm removed | Now, arm | Now, arm removed |
|---|---|---|---|---|
| Retention: expired documents scanned / disposed / held | 0 / 0 / 0 | 0 / 0 / 0 | 2 / 1 / 1 | 2 / 1 / 1 |
| Audit sweep: rows verified, incidents | 0, chain + seals + anchor in error | 0, the same | 6, none; anchor written (2 heads); run 2 verifies it | the same |
| Tenant verdict (org 7) | ok, 3 rows | **ok over 0 rows** ("No chained rows exist") | ok, 3 rows | **ok:null**, "could read 0 of … 3" |
| Seal check (org 7) | valid, 3 sealed | **valid over 0** | valid, 3 sealed | **ran:false**, "0 of the 3" |
| `setTenantContextTx(A, 'app_super_admin')`: B's audit rows | **0 → 4** | 0 → 0 | refused | refused |

In every run, the sweep's overall `ok` stays false because `audit_events.seals` is `unverifiable`: none of the chained rows carries an `hmac_seal`, since the `audit_events` seal writer has not shipped. That is pre-existing and reported as unverifiable, not ok. In the first run, the anchor is also unverifiable, because none had been written yet.

### Tests

- `tests-green.txt`: 32 files and 368 tests. 366 pass. The 2 failures are the pre-existing file below.
- `tests-red-at-head.txt`: the 11 new or extended files, with every lane source file at HEAD. 50 fail and 47 pass.

| Test file | At HEAD | Now |
|---|---|---|
| `server/jobs/__tests__/retentionCron.org-scope.test.ts` (new) | 8 fail | 8 pass |
| `server/jobs/__tests__/auditChainIntegritySweep.org-scope.test.ts` (new) | 10 fail | 10 pass |
| `server/services/audit/__tests__/chain-anchor-own-scope.test.ts` (new) | 4 fail, 1 pass | 5 pass |
| `server/services/audit/__tests__/chain-head-on-demand.test.ts` (extended) | 4 fail, 34 pass | 38 pass |
| `server/services/audit/compliance-reports/__tests__/seal-check-coverage.test.ts` (new) | 4 fail | 4 pass |
| `server/services/audit/__tests__/seal-coverage-organization.test.ts` (new) | 1 fail, 1 control passes | 2 pass |
| `server/routes/__tests__/decision-lineage-verify-chain-scope.test.ts` (extended) | 2 fail, 7 pass | 9 pass |
| `server/services/tenant/__tests__/governed-tenant-context-platform-role.test.ts` (new) | 5 fail, 1 control passes | 6 pass |
| `server/mcp/__tests__/mcp-call-client-platform-role.test.ts` (new) | 4 fail, 1 control passes | 5 pass |
| `server/services/ana/__tests__/catalog-scope-platform-role.test.ts` (new) | 4 fail, 1 control passes | 5 pass |
| `server/routes/__tests__/governed-signed-act-platform-role.test.ts` (new) | 4 fail, 1 control passes | 5 pass |

Three existing test files were adapted to the new call sequence: `auditChainIntegritySweep.test.ts`, `retentionCron.legal-hold.test.ts` and `retentionCron.policies.test.ts`. The adaptations are to:
- the organisation list;
- the transaction frame;
- the order of the reads;
- the summary's three new counters.

No assertion was weakened or removed.

### Mutations (`mutations.txt`, harness `probes/mutate.py.txt`)

- **27 unit mutations, each killed.** They cover every decision this slice adds:
  - R1 to R6: retention scope, uuid, owner selection, mismatch, holds, no-uuid organisation;
  - S1 to S7: transaction, filter, empty merge, refused legacy walk, anchor opener, the `audit_events` filters;
  - A1 and A2: the anchor's own-scope read;
  - T1 to T5 and C1: the count, its scope, the seal coverage, the readers' reason, the seal filter;
  - D1 and D2: the decision-lineage reason and the zero-row verdict;
  - W1 to W4: the four writers.
- **3 database mutations, each killed**, on the arm-removed copy:
  - R2: the scope without the uuid scans 0 of 2;
  - S1: the sweep without BEGIN verifies nothing;
  - T1: a short walk is a verdict again, and the readers say "No chained rows exist".
- After the run, every lane source file matched its SHA-256 from before the run.

### Gates (`gates.txt`)

These pass:
- `ci:session-scoped-rls-bypass`, `ci:tenant-isolation:no-regression`, `ci:tenant-resolvers`, `ci:sql-interpolation`;
- the self-tests of all but `ci:tenant-isolation:no-regression`, which construct the failing case.

ESLint, on every lane file, shows the same warnings at HEAD and now (20 = 20, per file) and 0 errors. Two test files had crossed `max-lines` in the WIP patch, and were tightened without weakening any assertion. Scoped tsc, over the lane's 18 source and 14 test files, reports no error in any lane file. Its one line beyond the baseline is in `server/services/entitlements/master-admin.ts`, which this lane does not touch, and tsc on that file alone reports it too.

## Found, not fixed (outside this slice)

1. **`server/routes/__tests__/governed-signed-act.request-context.test.ts` fails 2 of 5 at HEAD**, with this lane's files at HEAD too (`tests-red-at-head.txt`, last section). The test expects a 3-argument authority call, and the code makes a 4-argument one. This is pre-existing and not from this lane.
2. **The on-demand tenant verdict still walks on the admin scope.** It is honest now, but after the flip (slice 6) every member's verify-chain, ledger, export and report will say "not verified", until one of two things happens:
   - the walk moves to the tenant's own scope for sequenced rows, as the sweep now does;
   - the platform door `platform_audit_chain_links` (design §3.4) gives legacy rows their cross-tenant context.

   This belongs to slice 3/4 and must precede slice 6.
3. **`audit_logs` rows with no tenant, and organisations with legacy rows, are not verified by the sweep.** They are reported as `unverifiable`, never ok, and wait for the same door.
4. **`audit_events.seals` stays `unverifiable`** until the `audit_events` seal writer ships (`migrations/20260617_audit_events_hmac_seal.sql`). This is pre-existing.

No live cross-tenant read was found. Item 4's opening of B's rows was latent: it needs a caller to pass the role string, and slice 1a's CHECK already refuses that string at its source. No governed record is written without its signature. This lane touches no migration.

## Files

- **Retention:** `server/jobs/retentionCron.ts`, `server/bin/run-retention.ts`.
- **Audit sweep:** `server/jobs/auditChainIntegritySweep.ts`, `server/jobs/auditChainOrganizationVerdicts.ts` (new).
- **Audit services:** `server/services/audit/chain-anchor.ts`, `audit-integrity-service.ts`, `seal-coverage.ts`, `tenant-chain-verdict.ts`, `audited-export.ts`, `signedAuditExport.ts`, `compliance-reports/integrity-checks.ts`.
- **Callers of the verdict:** `server/services/tenant-export/held-record-integrity.ts`, `server/routes/decision-lineage.ts`, `server/routes/c2c/actions.ts`.
- **The four writers:** `server/services/tenant/governed-tenant-context.ts`, `server/mcp/tools/runtime.ts`, `server/services/ana/catalog-scope.ts`, `server/routes/governed-signed-act.ts`.
- **Tests:** the 11 files in the table above, and the 3 adapted files.
