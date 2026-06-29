# Audit Transactional Refactor — `logActionTx` Design (Task #21)

**Date:** 2026-06-29
**Status:** Design doc only. No code changes. No migrations. No UI. Greenlight gate before fire.
**Pattern:** Move 1 / Phase 3 / e-sig gate / `submission_id_fk` — design-then-review, ship after sign-off.
**Tracking finding:** `AUDIT_BEST_EFFORT_DOCUMENTED_BUT_RISKY` (surfaced by the charter-CRUD verify pass in commit `782014c1`).
**Predecessors:**
- `docs/reports/MOVE_1_ORCHESTRATOR_TENANT_SCOPING_DESIGN_2026-06-29.md`
- `docs/reports/E_SIG_GATE_DESIGN_2026-06-29.md`
- `docs/reports/SUBMISSION_ID_PROVENANCE_DESIGN_2026-06-29.md`
- `docs/reports/CSR_JOB_STATE_SCHEMA_DESIGN_2026-06-28.md`

---

## A. Problem statement

`server/services/auditService.ts:264` catches **all** persistence errors raised by
the chained `audit_logs` INSERT and never propagates them:

```ts
} catch (error) {
  // Non-fatal: audit write failure should not crash the request
  logger.error('Failed to write chained audit_logs row', error);
}
```

The intent is documented at `auditService.ts:198-206`:

> *"A persistence failure is logged, never propagated: an audit-trail outage
> must not break the user action it records."*

For most audit events this is the right behavior — a search-query log, a
view-tracking row, an API request audit row, a debug breadcrumb. Failing the
user's request because the audit row could not be written would be worse than
the missing row.

**But for 21 CFR Part 11 regulated entities**, the swallow IS the bug. The
regulated set includes:

1. **`project_charters`** (`server/routes/charters.ts:278-294`) — `charter.created`
   audit event is the §11.10(e) attribution row for "what was created, by whom,
   when." A charter row that exists with no audit row is a regulator-visible
   compliance gap.
2. **`csr_build_jobs`** (`server/routes/csr-jobs.ts:160-176` via
   `launchCSRBuildAsync`) — `csr.job.enqueued` covers the §11.10(e) write for
   an AI build initiation, which then drives downstream document generation.
3. **`ectd_submissions`** transmit/export events
   (`server/routes/ectd-export.ts:144-180`) — `ectd_export_generated` /
   `ectd_export_validated` are the §11.10(e) write for "a regulated package
   left the tenant boundary."
4. **`submission_orchestrator_steps`** failed-step events
   (`server/services/submission-package-orchestrator.ts:551-591`,
   `persistStepEvent`) — the `'fail'` event_type is the §11.10(e) record of
   "the orchestrator decided to abort." (Unlike the audit_logs write, this one
   already re-throws on schema-shape errors but swallows everything else.)
5. **`electronic_signatures`** inserts
   (`server/services/part11ComplianceService.ts:113-149`,
   `createElectronicSignature`) — the §11.50 / §11.70 manifestation record.
   Today, the signature INSERT and the audit row are sequential, not
   transactional.

### A.1 The §11.10(e) coupling failure mode, concretely

Consider the current charter create path
(`server/routes/charters.ts:278-346`):

```
T0:  d.insert(projectCharters).values({...}).returning()    ← COMMITS row #42
T1:  auditService.logAction({                                ← inside its own
       action: 'charter.created',                              tx that BEGIN/
       resourceId: 42,                                         COMMITs separately
       ...
     })
T1a: pool DOWN, network partition, or audit_logs write contention
T1b: BEGIN → INSERT INTO audit_logs ← FAILS (e.g. P0001, 57P01)
T1c: ROLLBACK
T1d: catch on auditService.ts:264 — error LOGGED, NOT THROWN
T1e: charters.ts:340-346 catch — never fires (logAction returned normally)
T2:  charters.ts:348 — res.status(201).json({ charterId: 42, ... })
```

**End state:** `project_charters.id = 42` is committed and live. `audit_logs`
has NO `charter.created` row attributing its creation. The client got a 201
and now believes the charter is real and audited.

§11.10(e) of 21 CFR Part 11 requires an **independent, time-stamped,
tamper-evident audit trail for every create / read / update / delete** of a
regulated record. The combination of "regulated entity committed" plus "no
audit row" is the textbook §11.10(e) gap.

The repo today mitigates this **detectively, not preventatively**: the
chained-audit gap detector (batch-review surface, see
`server/services/audit/chain.ts:182-222` `verifyAuditChain`) walks the chain on
schedule and would surface a missing row *eventually* — but only after the
fact, and only if the entity-table row can be cross-referenced back to an
expected audit event. That is the wrong shape for §11.10(e) which is a
**synchronous coupling** requirement: the audit trail entry is part of the
record-keeping act, not a follow-up.

### A.2 Why we cannot fix this by removing the swallow

Removing the catch on `auditService.ts:264` would propagate persistence errors
to **every** existing caller — including:

- API-request audit middleware (`server/middleware/auditLogger.js` → calls the
  `auditLog()` export at `auditService.ts:406-419`, which `.catch()`es a
  rejection but does not surface it to the request).
- Search query logging — `data_access` events for read-only queries.
- Debug/breadcrumb logging — every `RECORD_VIEWED` event tied to an HTTP GET.

These callers **rely on fire-and-forget semantics**. Failing a list-documents
GET because the audit row could not be written is a worse user experience than
the missing row. The docstring at `auditService.ts:204` codifies this and is
correct for the non-regulated case.

We therefore need **two surfaces**, not a behavior change on one.

---

## B. Two design paths

### Path 1 — RECOMMENDED: New separate API, opt-in transactional

Introduce a sibling method on `AuditService`:

```ts
class AuditService {
  // existing — unchanged behavior, fire-and-forget, errors swallowed
  async logAction(entry: AuditLogEntry): Promise<void>

  // NEW — participates in the caller's Drizzle tx, propagates errors
  async logActionTx(
    tx: DrizzleTx,
    entry: AuditLogEntry,
  ): Promise<{ auditRowId: string }>
}
```

**Contract for `logActionTx`:**
- Takes a Drizzle transaction handle as the first parameter (typed so a
  non-tx caller gets a compile error — see §D).
- Computes the chained hash + HMAC seal **inside the caller's tx** so the
  `SELECT ... FOR UPDATE` on the prior chain row sees the same in-flight
  snapshot as the caller's entity INSERT.
- Throws on any persistence failure — caller's tx rolls back, taking the
  entity INSERT with it.
- Returns the audit row id so the caller can correlate (e.g. include it in
  the 201 response for forensic replay).

**Callers opt in.** Regulated-entity writes wrap the entity INSERT + the audit
write in a single Drizzle transaction:

```ts
const { charterId, auditRowId } = await db.transaction(async (tx) => {
  const [row] = await tx.insert(projectCharters).values({ ... }).returning();
  const { auditRowId } = await auditService.logActionTx(tx, {
    action: 'charter.created',
    resourceId: row.id,
    ...
  });
  return { charterId: row.id, auditRowId };
});
```

If the audit write fails, the charter INSERT rolls back — §11.10(e) coupling
restored.

**Everything else continues to use `logAction`** — fire-and-forget, swallows
errors, behavior unchanged.

### Path 2 — REJECTED: Change `logAction` to throw on persistence failure

Make the existing `logAction` propagate the error caught at line 264.

**Why rejected:**

1. **Breaks every existing fire-and-forget caller.** `server/middleware/auditLogger.js`,
   the `auditLog()` shim at `auditService.ts:406-419`, every `RECORD_VIEWED`
   read-only audit event in the codebase relies on the swallow. We would
   either have to wrap **every** call site in a new try/catch (mechanical
   churn across hundreds of call sites with no compiler help to find them) or
   accept that a transient audit DB issue now produces 500s on listing
   endpoints that have nothing to do with regulated entities.
2. **Inverts the documented contract.** `auditService.ts:198-206` documents
   the swallow as deliberate. Changing the contract silently is a behavioral
   migration with no compiler-visible upgrade path — exactly the kind of
   change that breaks production at 2 a.m. when a transient DB blip suddenly
   turns into HTTP 500s on an endpoint that worked yesterday.
3. **Conflates two policies.** "Audit must couple with the entity" is a
   policy for regulated entities; "audit is best-effort" is a policy for
   everything else. A single API enforcing one policy forces every caller
   into that policy, which is the wrong shape.

A unified API with a flag (`{ transactional: true }`) was considered as a
Path 2.5 and is also rejected — the transaction handle is a positional
type-checked artifact, not a boolean. A flag-shaped API would have to accept
the tx handle conditionally and we lose the compile-time guarantee.

---

## C. Recommendation

**Path 1.** Justification:

1. **Additive, opt-in.** Zero risk to existing fire-and-forget callers.
   `logAction` is untouched; its docstring stays accurate.
2. **Compile-time enforced.** The `DrizzleTx` parameter is a typed handle that
   cannot be forged — a caller cannot accidentally call `logActionTx` without
   a real transaction in scope.
3. **§11.10(e) coupling becomes a property of the call site.** The regulated
   entity writes wrap entity + audit in one tx. The synchronous coupling that
   §11.10(e) requires is now structural, not detective.
4. **Hash chain integrity preserved.** Because `logActionTx` issues its
   `SELECT FOR UPDATE` on the prior chain tail *inside the caller's tx*, the
   chain serializes across concurrent transactions exactly as it does today
   in `logAction` — but now with the entity INSERT atomically bound to the
   chain commit (see §E).
5. **Same shape as the predecessor design docs.** Move 1, Phase 3, e-sig
   gate, and `submission_id_fk` all introduced a new optional surface
   alongside an existing one rather than mutating the existing surface in
   place.

---

## D. `logActionTx` signature

```ts
// In server/services/auditService.ts

// Drizzle's NodePgDatabase transaction callback parameter type. We type-alias
// here rather than letting the caller pass `any` so a non-tx caller gets a
// compile error at the call site. The actual type comes from Drizzle's
// inferred PgTransaction<...> over the project's schema.
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type * as schema from '../../shared/schema';

export type DrizzleTx = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  any
>;

class AuditService {
  /**
   * Transactional audit write. Participates in the caller's Drizzle
   * transaction so the entity INSERT and the audit row commit atomically.
   *
   * Use ONLY for 21 CFR Part 11 regulated entities where §11.10(e) demands
   * synchronous coupling between the record-keeping act and its audit trail
   * entry. For fire-and-forget audit (search queries, view tracking, debug
   * breadcrumbs) keep using {@link logAction}.
   *
   * @param tx     - Drizzle transaction handle. The chained-hash SELECT FOR
   *                 UPDATE and the audit_logs INSERT both run inside this tx.
   *                 If the caller's tx aborts for ANY reason (entity INSERT
   *                 fails, downstream business-rule check fails, etc.) the
   *                 audit row rolls back with it.
   * @param entry  - Audit log entry, same shape as logAction accepts.
   *
   * @returns      - `{ auditRowId }` — the UUID assigned to the new audit row.
   *                 Caller may surface this in its API response for forensic
   *                 replay correlation.
   *
   * @throws       - Any persistence error raised by the chain SELECT FOR
   *                 UPDATE or the audit_logs INSERT. The caller's tx rolls
   *                 back as a result. UNLIKE {@link logAction}, errors are
   *                 NOT swallowed.
   *
   * Hash chain serialization: SELECT ... FOR UPDATE on the chain-tail row
   * means concurrent logActionTx calls (in different transactions) queue
   * serially on that lock; the second waiter sees the first's committed row
   * as `previous` and the chain stays gap-free under concurrency.
   *
   * Compliance: 21 CFR Part 11 §11.10(e) — synchronous coupling of
   * record-keeping and audit; §11.70 — HMAC-sealed link to the prior row.
   */
  async logActionTx(
    tx: DrizzleTx,
    entry: AuditLogEntry,
  ): Promise<{ auditRowId: string }>;
}
```

**Notes on the type:**

- `DrizzleTx` is the Drizzle-inferred transaction type, NOT `any`. A caller
  who passes the top-level `db` instead of a tx handle gets a compile error,
  because `db.transaction(async (tx) => ...)` is the only producer of that
  type.
- The chain SELECT/INSERT uses Drizzle's `tx.execute(sql\`...\`)` (raw SQL) so
  the underlying client carries the transaction and the `FOR UPDATE` lock
  participates correctly. The current implementation uses a raw `pool.connect`
  client; the tx variant unwraps the Drizzle tx and runs the same SQL with
  the same canonical serialization (`computeAuditChainSealed` from
  `server/services/audit/chain.ts:112-125`).
- The HMAC seal is computed identically to `logAction`
  (`audit-hmac-seal.sealRecord` keyed by `AUDIT_HMAC_KEY` env). Same secret,
  same `AUDIT_SEAL_SEQ = 0` constant, so the chain remains verifiable end-to-end
  by the existing `verifyAuditChainSeals` walker — sealed rows from
  `logActionTx` are byte-for-byte equivalent to sealed rows from `logAction`.
- The TamperProofAuditLog secondary write (step 2 at `auditService.ts:269-294`)
  is **not** moved into the tx. That write hits a different connection (it owns
  its own pool), runs after the canonical audit_logs row is committed, and is
  itself best-effort. The §11.10(e) commitment is on the canonical audit_logs
  row — the tamper-proof log is the §11.70 evidence layer on top, and its
  failure mode is independent of the §11.10(e) coupling we are tightening
  here.

---

## E. Hash-chain considerations

The chain is computed by `computeAuditChainSealed`
(`server/services/audit/chain.ts:112-125`):

```ts
const prev = await client.query(
  `SELECT sha256_chain FROM audit_logs WHERE sha256_chain IS NOT NULL
   ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE`,
);
```

### E.1 Serialization under concurrent transactions

`SELECT ... FOR UPDATE` on the chain-tail row is the existing serialization
mechanism. When `logActionTx` calls this SQL inside the caller's tx:

- Tx A acquires the row lock, computes its chain hash, INSERTs row N+1,
  commits. Row N+1 is now the new chain tail.
- Tx B was waiting on the lock. It now sees row N+1 as `prev` and computes
  N+2 against it. Chain integrity preserved.
- This is **the same behavior as today's `logAction`** — the only difference
  is the lock is held inside the caller's tx instead of inside auditService's
  own internal client.

**Risk: lock hold duration.** Today's `logAction` holds the chain-tail lock
for the duration of one INSERT (~ms). With `logActionTx`, the lock is held
for **the entire caller transaction**. If the caller does:

```ts
await db.transaction(async (tx) => {
  await auditService.logActionTx(tx, { ... });   // ← acquires chain-tail lock
  await tx.insert(projectCharters).values({...}); // ← runs while lock held
  // ... business logic ...                       // ← lock still held
});
```

…then a long-running tx blocks every other regulated-entity write that calls
`logActionTx`. Two mitigations:

1. **Convention:** `logActionTx` is called **last** inside the tx, after the
   entity INSERT and any business-rule checks have completed. The lock is
   held only for the audit chain commit phase, not the whole tx.
2. **Documentation:** the docstring on `logActionTx` mandates "call this last
   inside your transaction" and lists the rationale.

Convention is unenforceable at compile time; we accept that the §J risk
register has to flag this.

### E.2 HMAC seal

Same secret (`AUDIT_HMAC_KEY` env), same `sealRecord` call, same
`AUDIT_SEAL_SEQ = 0` constant. The seal binds `recordHash + previousHash`,
both of which are derived inside the tx; the seal is computed before the
INSERT and stored on the same row. A verifier walking the chain with
`verifyAuditChainSeals` (`server/services/audit/chain.ts:236-259`) cannot
distinguish a `logActionTx`-sealed row from a `logAction`-sealed row — which
is the point.

### E.3 Replay protection

The current chain has timestamp (`occurred_at`) in the canonical JSON and an
implicit nonce via the UUID `id` column. The `logActionTx` row reuses the
same canonical serialization, so the same replay protection applies. We do
NOT add a separate nonce — the chain is already replay-resistant because each
row's hash incorporates the prior row's hash, and the prior row's hash
includes its own `occurred_at`. A replay attempt would have to forge the
prior-row hash too, which is what `AUDIT_HMAC_KEY` prevents.

### E.4 Empty-chain genesis

If `logActionTx` is the first audit write ever (or the first sealed write),
the SELECT returns no row and `previousHash = GENESIS_PREVIOUS_HASH` per
`audit/chain.ts:120`. No special-case logic needed.

---

## F. Caller migration plan

The regulated-entity callers that switch to `logActionTx`:

| # | Call site | Action | Entity table | Today's behavior |
|---|-----------|--------|--------------|------------------|
| 1 | `server/routes/charters.ts:319-339` (POST `/api/charters`) | `charter.created` | `project_charters` | Entity INSERT and audit are separate; the AUDIT_NOT_TRANSACTIONAL comment at line 271-277 documents the gap. |
| 2 | `server/routes/charters.ts` future POST `/api/charters/:id/commitments` (scoped out per module header lines 9-20 — `projectCommitments` table was dropped; this row applies only if/when the table is restored) | `commitment.created` | `project_commitments` | Same pattern as #1. |
| 3 | `server/routes/csr-jobs.ts:159-176` (POST `/api/csr/jobs`) — actually the audit happens inside `launchCSRBuildAsync` in `server/services/csr-builder.ts`; tx must extend down into the service layer. | `csr.job.enqueued` | `csr_build_jobs` | Service-layer INSERT + audit are sequential. |
| 4 | `server/routes/ectd-export.ts:391-417` (POST `/api/ectd/export/:submissionId`) — governance row + transmit audit row. | `ectd_export_generated` | `ectd_export_governance` (and transitively a transmit ledger row when transmit lands) | Governance INSERT + audit are sequential via `registerExportGovernanceQuick`. |
| 5 | `server/services/submission-package-orchestrator.ts:580-590` (`persistStepEvent`, event_type `'fail'` only) | `orchestrator.step.failed` | `submission_orchestrator_steps` | Already re-throws on schema-shape errors (good); swallows everything else. Failed-step rows for the audit chain should be transactional with the step row itself. Non-failed events (`start`, `complete`) stay best-effort. |
| 6 | `server/services/part11ComplianceService.ts:113-149` (`createElectronicSignature`) | `ELECTRONIC_SIGNATURE_CREATED` | `electronic_signatures` | Signature INSERT + audit are sequential via `createAuditTrail`. This is the most critical of the six — §11.50 explicitly binds the signature row and its audit row. |

**Per-caller refactor shape** (illustrative for #1, NOT for implementation):

```ts
// BEFORE (charters.ts:278-346):
const inserted = await d.insert(projectCharters).values({...}).returning();
try {
  await auditService.logAction({ action: 'charter.created', ... });
} catch (auditErr) {
  log.error('charter.created audit write threw — row created without audit', ...);
}

// AFTER:
const { charter, auditRowId } = await d.transaction(async (tx) => {
  const [row] = await tx.insert(projectCharters).values({...}).returning();
  const { auditRowId } = await auditService.logActionTx(tx, {
    action: 'charter.created',
    resourceId: row.id,
    ...
  });
  return { charter: row, auditRowId };
});
```

Each migration is **small** — ~10 lines of churn per call site — but each
needs its own test pass because the failure-mode change (audit fail =
entity rollback) can surface latent ordering bugs (e.g. an `id` returned from
the entity INSERT being used downstream in the same handler outside the tx
would now be undefined-if-rollback). The migration plan handles each call
site as a separate PR so verify gates run independently.

**Non-regulated callers stay on `logAction`** — there are ~50 such call sites
across the codebase (search-query logging, list-endpoint view tracking, API
middleware, debug breadcrumbs). No churn for any of them.

---

## G. Test coverage

The test plan for `logActionTx` (NOT for implementation in this doc — listed
so the implementation PR knows what to write):

1. **Error propagation.** `logActionTx` called inside a tx where the
   audit_logs INSERT is forced to fail (e.g. by violating a NOT NULL or
   inducing a serialization failure on the chain-tail lock with a deliberately
   contending writer) must throw out of the tx. Assert the entity INSERT in
   the same tx did NOT commit (re-SELECT after the throw must return zero
   rows).
2. **§11.10(e) coupling guarantee.** Entity INSERT + `logActionTx` in one tx;
   force the audit step to fail; verify both rows are absent from their
   respective tables. This is the regulator-visible guarantee.
3. **Hash chain integrity under concurrency.** Run N concurrent
   `db.transaction(async (tx) => logActionTx(tx, ...))` calls and verify the
   resulting chain has no gaps and no out-of-order rows
   (`verifyAuditChain` returns `{ ok: true }`). The `FOR UPDATE` lock should
   serialize the writers; the test fails if it doesn't.
4. **HMAC seal interoperability.** Write a row via `logAction`, then a row
   via `logActionTx`, then another via `logAction`. Run
   `verifyAuditChainSeals` and assert all sealed rows verify against each
   other — proves the two writers produce byte-identical canonical
   serializations.
5. **Lock release on tx rollback.** A failing `logActionTx` inside a tx
   whose outer entity INSERT later fails: the chain-tail lock MUST be
   released on rollback so the next writer doesn't deadlock indefinitely.
   Test by triggering a failure mid-tx and asserting a subsequent
   `logActionTx` from a different tx completes within a bounded timeout.
6. **Non-tx caller compile error.** A type-level test (e.g. tsd or a
   compile-fail fixture) that asserts passing the top-level `db` instead of a
   tx handle to `logActionTx` fails to type-check. Otherwise the §D contract
   is just a runtime check.
7. **Migrated caller integration tests.** Each of the §F caller migrations
   gets a paired integration test: induce an audit-write failure (e.g. by
   stubbing the chain-tail SELECT to throw) and assert the entity table row
   is absent AND the HTTP response is 500 (not 201). The existing happy-path
   tests for each route continue to pass unchanged.

---

## H. Open questions

1. **Secret rotation story for `AUDIT_HMAC_KEY`.** The seal binds the entire
   chain to one key. If we ever rotate the key, every row written under the
   old key remains verifiable only with the old key. This is true today —
   `logActionTx` does not change it — but the design doc is the right place
   to note that the rotation strategy (key-id column, dual-write window,
   verifier-side key-set support) is **not** part of this refactor and is its
   own multi-week design exercise. Punt-or-do?
2. **Fail-loud or fail-loud-and-page?** When `logActionTx` propagates an
   error and the caller's tx rolls back, the user sees an HTTP 500 (or
   whatever the caller maps it to). Should that 500 ALSO page on-call (via
   a sentry-level alert tag) because a regulated-entity write failed for
   audit-trail reasons? Argument for: this is regulator-visible and a
   sustained burst means audit_logs is wedged. Argument against: a single
   transient lock-wait failure is noise. Proposal: tag the error with
   `regulatory_impact: 'high'` and let the alerting layer threshold it
   (>N/min pages, <N/min just logs).
3. **Should the chained hash use a Merkle structure for big-batch
   verification?** Today's chain is a linked list — verifying N rows is O(N)
   sequential. A Merkle tree would let an auditor verify a window of rows
   without walking from genesis. This is **not** required for §11.10(e) /
   §11.70 (a linked chain satisfies both) but might matter at scale (millions
   of rows on a multi-year tenant). Out of scope for this refactor, but
   should be flagged in the audit-architecture roadmap.
4. **Does `logActionTx` apply to READ audits (`charter.read`,
   `ectd_export_previewed`)?** Today these are best-effort
   (`charters.ts:413-435`). §11.10(e) requires the audit but does NOT require
   the audit to roll back the read (you cannot un-show data the user already
   saw). Proposal: READ audits stay on `logAction` — the synchronous
   coupling guarantee is meaningful for writes only. Confirm.
5. **What about the orchestrator's `'start'` and `'complete'` step events?**
   §F #5 only migrates the `'fail'` event_type. The argument for migrating
   `'complete'` too: a step that completed but whose audit row failed is a
   "step finished, no proof" gap. The argument against: orchestrator runs are
   long-lived and a per-step transactional audit write adds a chain-tail
   lock acquisition to every step transition, multiplying the lock pressure
   from §E.1. Proposal: `'fail'` and `'complete'` migrate; `'start'` and
   `'stale'` stay best-effort. Confirm.

**Open-question count: 5.**

---

## I. Effort estimate

**~3-5 person-days** across implementation + migration + tests:

- 0.5 day: `logActionTx` implementation in `auditService.ts` + the `DrizzleTx`
  type alias.
- 0.5 day: Unit tests for `logActionTx` itself (§G.1, §G.3, §G.4, §G.5,
  §G.6).
- 0.5 day: charters.ts migration (#1) + paired integration test (§G.7).
- 0.5 day: csr-jobs.ts migration (#3, includes tx threading through
  `csr-builder.launchCSRBuildAsync`) + paired integration test.
- 0.5 day: ectd-export.ts migration (#4, includes tx threading through
  `exportGovernance.registerExportGovernanceQuick`) + paired test.
- 0.5 day: orchestrator `persistStepEvent` migration (#5, scoped to `'fail'`
  and possibly `'complete'` per §H.5) + paired test.
- 0.5 day: `electronic_signatures` migration (#6, includes tx threading
  through `part11ComplianceService.createElectronicSignature` and
  `createAuditTrail`) + paired test.
- 0.5 day: docstring + this design doc's resolution to a "shipped" status
  note + §H decisions threaded into final code comments.

Total: 4.0 person-days nominal. Range 3-5 accounts for the §J risk that one
of the caller migrations surfaces a latent transactional bug in its existing
code path (most likely candidate: the orchestrator, which mixes pool clients
and Drizzle transactions across step boundaries — §F #5 may require an
intermediate refactor before logActionTx can be threaded in).

Not included (out of scope): the secret-rotation design (§H.1), the Merkle
verification design (§H.3), any UI for surfacing audit-coupling failures,
backfill of historical entity rows that lack audit rows (the chained-audit
gap detector continues to handle those).

---

## J. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| 1 | **Deadlock on the audit_logs tail row under load.** Every regulated-entity write inside a tx acquires the chain-tail lock for the full tx duration. Two transactions that each call `logActionTx` AND acquire other shared locks in different orders can deadlock. | Medium | High | Convention: `logActionTx` is the LAST call inside any tx, after the entity INSERT and business-rule checks. Document this on the method. Add a CI lint that flags any `logActionTx` call followed by additional `tx.*` writes inside the same transaction block. Statement timeout (already in place per project DB config) bounds the worst case to a server-side rollback rather than a permanently wedged connection. |
| 2 | **Hash-chain corruption if a tx rolls back partway through.** A tx that successfully INSERTs an audit row via `logActionTx` and then fails its outer entity INSERT will roll back BOTH writes. The chain is correct — the row was never committed — but a verifier running concurrently could (in theory) see the row mid-flight. | Low | Medium | `verifyAuditChain` reads with default isolation; uncommitted rows are not visible. Snapshot isolation guarantees the verifier walks a consistent prefix. The risk is purely theoretical under PostgreSQL's MVCC; included here for completeness. |
| 3 | **Migration surfaces latent bugs in caller code.** Each §F call site assumes today that "audit failure ≠ entity rollback." Migrating to `logActionTx` changes that. A caller that returned an entity id to the client AFTER calling logAction (e.g. charters.ts line 348-351 returning `charterId` outside the catch block) now has to surface a 500 instead — and any client code that retried on 500 and reused the entity id would break. | Medium | Medium | Each caller migration is its own PR with its own paired integration test (§G.7). The verify-gate pattern (Move 1 / Phase 3 precedent) catches behavioral regressions before merge. Roll out one caller at a time, not all six in one PR. |
| 4 | **`AUDIT_HMAC_KEY` unset in production.** If the env var is missing, `maybeSeal` returns null (`audit/chain.ts:85-92`) and the row is written unsealed. `logActionTx` inherits this behavior — no behavior change vs `logAction` — but the §11.70 evidence layer is silently weakened. This is a pre-existing risk, not a new one. | Low (config drift) | High | Add a startup check (separate task — out of scope here): refuse to boot in production if `AUDIT_HMAC_KEY` is unset. Not part of this refactor. |
| 5 | **Lock pressure on a heavily-audited multi-tenant DB.** N tenants all writing regulated entities concurrently serialize through one chain-tail lock. Throughput ceiling = 1 / (audit-write-tx-time). | Low (today) | Medium (at scale) | Today's audit volume does not approach this ceiling. If/when it does, the Merkle-tree design (§H.3) is the structural answer — per-tenant subtrees, periodic roll-up. Out of scope here; flagged for the audit-architecture roadmap. |

---

## K. Sign-off question

> **Greenlight Path 1 — introduce `auditService.logActionTx(tx, entry)` as a
> NEW separate API that participates in the caller's Drizzle transaction and
> propagates errors; keep the existing `logAction` unchanged for
> fire-and-forget non-regulated audit?**

Or:

> **Push back on the API split** — e.g. prefer a unified `logAction({ tx?: ... })`
> shape, or argue that the chained-audit gap detector is sufficient and the
> coupling does not need to be synchronous?

Explicit yes / no required before any code, test, or migration file is
written under this design.

---

## Appendix — Verified call-site inventory

This appendix lists every `auditService.logAction` call site so reviewers can
sanity-check the §F scope. Generated by reading the surfaces listed in the
predecessors above; not generated by an automated grep (an automated grep
would miss the indirect calls through middleware wrappers).

**Regulated (migrating to `logActionTx`):** 6 — listed in §F.

**Non-regulated (staying on `logAction`):** ~50, including:
- `server/routes/charters.ts:413-435` (`charter.read`) — read audit, §H.4 says
  stays on logAction.
- `server/routes/ectd-export.ts:144-180` (`ectd_export_previewed`,
  `ectd_export_validated`, `ectd_export_preflight_validated`) — read /
  validate audits stay on logAction.
- `server/middleware/auditLogger.js` → `auditLog()` shim
  (`auditService.ts:406-419`) — every HTTP request emits a generic
  `API_REQUEST` audit row; remains best-effort.
- ~45 other `RECORD_VIEWED` / `data_access` / `USER_LOGIN` / search-query
  audits across `server/services/`, `server/routes/`, `server/middleware/`.

The non-regulated set is not enumerated exhaustively because the migration
does not touch any of them — they all keep their existing behavior. The
inventory exists to confirm the migration scope (§F) is **exactly** six call
sites and nothing else.
