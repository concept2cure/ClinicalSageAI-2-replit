# WA — 2026-09-21 — VSR-001 findings F-1 and F-2 (row D5, Part 11 §11.10(e))

Worker WA. Branch `concept2cure-v2`. Local database `clinicalsage` (PostgreSQL 16.13,
unsealed: `AUDIT_HMAC_KEY` unset, IQ-DEV-002 — nothing here claims a seal).

## F-1 — audit_logs chain reported broken

### Root cause (proven, not the hypothesis)

`F-1-root-cause.json` re-derives every chained `audit_logs` row on the local database.
The evidence row `a9989a0f…` (LEAF_CREATED, tenant 26) **derives from genesis**, and so
do the other nine rows the pre-fix verifier could not derive — every one of them is the
first chained row of its tenant (`earlierChainedRowsOfSameTenant: 0`). The writer's
predecessor read (`SELECT sha256_chain … ORDER BY occurred_at DESC LIMIT 1 FOR UPDATE`)
ran on the caller's connection, and under `tenant_isolation_policy` that connection sees
only its own tenant's rows. So the chain was **per tenant on a scoped connection and
global on an unscoped one** (227 legacy rows: 19 derive only from their tenant's head,
30 only from the global head, the rest from both; none is tampered), while the verifier
replayed every tenant's rows as one chain and broke at the first tenant-first row.

The concurrency half of the finding is real too and is reproduced, not inferred:
`FOR UPDATE` locked the head *row*; a blocked writer re-read the same stale head after
the first committed and chained to it (fork), and a row stamped before it obtained the
lock could commit behind a later-stamped row.

### Reproduction — `server/services/audit/__tests__/chain-concurrency.dbtest.ts`

Real PostgreSQL, throw-away database per run, the shared `audit_logs` fixture plus the
new migration, the real writer and verifier. Three tests: eight concurrent writers of one
tenant; commit order vs `occurred_at`; a tenant-scoped (RLS on + tenant GUC) and an
unscoped connection writing the same tenants.

- `F-1-repro-before.txt` — pre-fix `chain.ts`: **3 failed / 3** (fork at row 3 of 9;
  order break; RLS break).
- `F-1-repro-after.txt` — fixed `chain.ts`: **3 passed / 3**.

Run: `set -a; source .env; set +a; npx vitest run --config vitest.db.config.ts server/services/audit/__tests__/chain-concurrency.dbtest.ts`

### Fix — one chain per tenant, with its own order key

- `server/services/audit/chain.ts` (the one chain recipe): the writer resolves the row's
  tenant (`ChainRow.tenant_id` → connection `app.current_tenant_id` → request tenant
  scope; nothing → refuses), takes `pg_advisory_xact_lock(3116, tenant)` for the rest of
  the caller's transaction, reads that tenant's head by
  `chain_seq DESC NULLS LAST, occurred_at DESC, id DESC`, and announces the position in
  the transaction-local GUC `app.audit_chain_tenant`. No `FOR UPDATE`.
- `migrations/20260921_audit_logs_chain_seq.sql` (additive, idempotent, replayed on every
  deploy, no DROP, no new table; inserted in `C2C_MIGRATION_FILES` right after
  `20260609_audit_hmac_seal.sql`, far above the final sweep pair): `chain_seq bigint`
  with **no default**, sequence, unique index on `chain_seq`, `(tenant_id, chain_seq)`
  and legacy `(tenant_id, occurred_at, id)` indexes, and a BEFORE INSERT trigger that
  assigns `chain_seq` only when the writer announced a position, **refuses a row whose
  `tenant_id` differs from the announced tenant**, and clears the announcement (one
  position → one row).
- `server/services/auditService.ts` `writeChainedAuditRow` passes `tenant_id`
  (the one line the canonical writer needed).
- Verifier (`verifyAuditChain`, `verifyAuditChainSeals`, `walkAuditChain`): walks per
  tenant; refuses a cross-tenant walk on a tenant-scoped connection
  (`AuditChainPartialViewError`) instead of reporting a false pass on a subset; a break
  names its segment and what the row actually commits to (`commitsTo`: a row, `genesis`,
  or `null` = tampered).
- `GET /api/c2c/actions/verify-chain` runs the walk on a super-admin-scoped connection
  (`withTenantConnection`, the system-job pattern) so `RLS_ENFORCE=on` cannot make it see
  zero rows; 503 with the error code when the chain cannot be verified.

### Legacy rows — how every existing row stays verifiable

Rows written before the migration (and by pre-fix code against a migrated database, e.g.
a rolling deploy) keep `chain_seq NULL`. They are never rewritten (append-only triggers).
The verifier walks them in `(occurred_at, id)` order and accepts a row that derives from
**either predecessor its writer could have seen** — the tenant's last row or the global
last row as of that moment. A tampered or deleted row still breaks every row that
committed to it; a row that derives from neither is reported as `commitsTo: null`.
Sequenced rows are held to exactly one predecessor; a tenant's first sequenced row is
anchored to that tenant's legacy head. Local result: `verify-audit-chain.txt` — **OK,
262 rows** (previously 409 at row 100); `verify-chain.api-2.json` — **ok: 264 rows, 18
tenants, 227 legacy, 37 sequenced** after a live governed write.

### Local database housekeeping (`local-db-interim-correction.txt`)

An interim version of the migration attached a column default and a CHECK constraint;
other sessions' servers (pre-fix code) wrote 35 rows while it was in place, so those
rows carry a default-assigned `chain_seq`. The final migration has neither; the default
and the constraint were removed locally (schema only — **no audit row was modified**;
the immutability triggers are all enabled, as the file shows). Those 35 rows verify
under the sequenced rule as it happens (their tenant's rows were written in time order)
and are noted here so nobody mistakes them for trigger-assigned positions.

## F-2 — the ledger surface showed none of the launch apps' governed writes

Decision: **`audit_logs` is the ledger the surface reads** — it is the store every
launch app writes through the one chained writer. `audit_events` remains for SCIM,
projects-management and the IVDR worker and is merged in, every entry carrying
`source: 'audit_logs' | 'audit_events'` and the store's own order key (`seq`), so two
chains are never presented as one. Tenant scoping: organisation from the verified JWT
(`requireAuthedOrgId`), read inside a transaction stamped with `setTenantContextTx` so
RLS sees the same tenant the SQL predicate names; `prevHash` for `audit_logs` rows is the
predecessor in the tenant's chain (`AUDIT_CHAIN_ORDER_ASC_SQL`, the same order the
writer appends in), computed over the tenant's rows only.

- `server/routes/audit-trail-ledger.routes.ts`; test
  `server/routes/__tests__/audit-trail-ledger.routes.test.ts` (6 tests: a governed write
  through the real `writeChainedAuditRow` appears with source, real hash/prevHash,
  `seq`; another tenant's row never appears; audit_events merge; limit; 403 without
  tenant context; 503 not empty on missing schema).
- Live: `F-2-governed-write.api.json` (POST /api/c2c/projects → 201) then
  `F-2-ledger.api.json` — its two chained rows (`c2c.work.transition`,
  `c2c.project.create`, chain_seq 36/37) are the top of the ledger with linked hashes.

## Gates

See `gates.txt` (typecheck, eslint, migration-set-order, migration-drop-safety,
tenant-isolation no-regression, audit-logs-fixture, db-test-isolation,
migration-reachability, unrun-tests) and `tests-rerun.log` / `eslint.txt`.

## Open

1. Four direct callers still pass no tenant to `computeAuditChainSealed`
   (`server/routes/c2c/actions.ts` recordGovernedAction, `server/routes/c2c/projects.ts`,
   `server/routes/c2c/commitments.ts`, `server/services/compliance/pharmacovigilanceService.ts`).
   At runtime they resolve it from the connection's `app.current_tenant_id` (proven on
   the live server: the governed write above took chain_seq 36/37). Under vitest a
   harness that stamps no tenant context (governed-action pglite, rule-pack outlines,
   three golden journeys) gets the pre-fix recipe — the row is written as a legacy row,
   warned once — so those suites stay green; outside vitest the writer refuses. The
   one-line fix is `tenant_id: orgId` at each call site (outside WA's file scope).
2. The AuditTrail surface's client-side link check (`prevHash === next.hash`) counts a
   legacy row that committed to the global head, and any `audit_events` row interleaved
   with `audit_logs` rows, as an unverified link. It should show the server verdict
   (`verify-chain`) instead; client is outside WA's scope.
3. The `scripts/ci/check-tenant-isolation.mjs` allowlist comment for `chain.ts` still
   describes the chain as global; the file remains correctly allowlisted (the verifier
   walks every tenant on a super-admin scope).
4. The shared `AUDIT_LOGS_PGLITE_DDL` and the other 15 fixtures predate `chain_seq`;
   the writer tolerates that only under vitest. The tests in `server/services/audit`
   apply the migration to the fixture themselves.
5. D5 still owes: `AUDIT_HMAC_KEY` in KMS and the production verifier run.
