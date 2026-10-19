# Every section-lock event was filed on the audit chain as a pre-migration "legacy" row

**Row:** D5 (21 CFR Part 11 §11.10(e) — integrity of audit records).
**Session:** `…01P6GWSv`. **Date:** 2026-10-18. **Found by** the D5 audit
workflow (lead #8, reported *critical*), verified by hand at HEAD `155783880`
after the audit's own verifiers died on a usage limit.

## What was wrong

`auditLockEvent` (`server/routes/realtime-collab.ts`) records each section lock
acquire, release and takeover on the governed ledger (assessment D28). It handed
`recordGovernedAction` the **pool**.

That writer's contract is explicit — *"inside a transaction the CALLER owns. It
does NOT open/commit a transaction"* — because the chain recipe rests on two
things that exist only inside a transaction:

1. `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_CLASS, tenant)`, *"held until the
   caller's transaction ends, which is what serialises writers of one tenant"*;
2. a **transaction-local** GUC, `app.audit_chain_tenant`, announcing the chain
   position, which the `audit_logs` `BEFORE INSERT` trigger reads.

On a pool each statement is its own transaction, so both end before the
`INSERT`. `server/services/audit/chain.ts` states the consequence as a MUST:

> *"The caller MUST run computeAuditChain\* and its INSERT in one transaction:
> outside one, the advisory lock and the announcement both end with the
> statement that made them, and the trigger then records the row as legacy."*

And the trigger (`migrations/20260921_audit_logs_chain_seq.sql`) does exactly
that, silently:

```sql
IF NEW.sha256_chain IS NULL OR chain_tenant IS NULL THEN
  RETURN NEW;   -- the row is a legacy row and chain_seq stays NULL
```

## What that meant — stated narrowly

The audit lead said lock events *"permanently break the chain"*. That is **not**
what was demonstrated, and it is not claimed here. What is proven:

- **Every section-lock audit row written since the chain_seq migration was
  recorded as a pre-migration legacy row** (`chain_seq NULL`), though written
  today and carrying a real `sha256_chain`.
- A legacy row is held only to the weaker rule — the verifier *"accepts a row
  that derives from EITHER predecessor its writer could have seen"* — instead of
  *"Every sequenced row is held to exactly one predecessor."*
- **Concurrent lock events were not serialised at all**, because each advisory
  lock was released the instant it was taken.

Whether that ever forked a real tenant's chain depends on concurrent lock events
for one tenant, which PGlite (one connection) cannot reproduce; the race itself
is covered on real Postgres by `server/services/audit/__tests__/chain-concurrency.dbtest.ts`.

## Reproduced first, on the real migration

Before anything was changed — the real `20260921` migration and the real ledger
writer on PGlite, the same row written both ways:

```
document:d1  chain_seq: null   ← statement by statement, as the pool did it: LEGACY
document:d2  chain_seq: 1      ← in one transaction: SEQUENCED
```

## The change

- **`writeLockEventTx(client, event)`** (new, exported): `BEGIN` →
  `setTenantContextTx` → `recordGovernedAction` → `COMMIT`, on ONE client, with
  `ROLLBACK` on failure. The same shape as the canonical governed writers
  (e.g. `server/services/regulatory/ivd-governed-write.ts`).
- **`auditLockEvent`** stays fire-and-forget — *"the ledger write must never add
  latency or failure to the lock path"* is a deliberate decision and is kept —
  but takes its client from **`withTenantConnection`**, the repo's canonical
  helper for writes outside a request. That matters here specifically: this
  write runs after the response, inside the request's async context, and
  `withTenantConnection` enters the *event's* tenant scope **before** the
  checkout. Its own comment records why a bare `pool.connect()` there would
  borrow the request's scope instead.
- Every new import is lazy, because the module header requires that this router
  *"stay importable in environments without a database"*.

Fire-and-forget governs **when** the write happens, not **how**: when it runs,
it is one transaction.

## Proof

New suite `server/routes/__tests__/collab-lock-audit-chain.pglite.test.ts`,
on the real migration, keeps the pool-style write as a **control** so the suite
shows the mechanism and not only the fix:

| Case | Result |
|---|---|
| CONTROL — written statement by statement | `chain_seq` NULL (legacy), with a real `sha256_chain` |
| `writeLockEventTx` | `chain_seq` assigned — a real chain position |
| Two consecutive lock events | consecutive positions |
| The person's reason, or none (D5) | preserved; none recorded as `NULL`, not a sentence |
| A failed ledger write | `audit_logs` row rolled back; connection usable after |

**5/5. Shown still to bite:** with the transaction removed from
`writeLockEventTx`, **3 of 5 fail** — exactly the three that pin the property
(sequenced, consecutive, rollback). The two that still pass are the two that
should: the control, and the reason check, which does not depend on the
transaction. Diagnostic reverted from a scratch copy.

## A regression this change introduced, and fixed

`tests/routes/realtime-collab-lock-reason.test.ts` mocked `db.js` with a
**query-only** pool and ignored `recordGovernedAction`'s first argument — its
design assumed the pool path. With the fix, the write needs a connection; it
failed there, the fire-and-forget `catch` swallowed it, and `vi.waitFor` timed
out: **2 of 2 red**. Its subject is the *reason*, not the transaction, so it now
mocks the seam the router crosses (`withTenantConnection`), as it already mocked
`db.js` and `actions.js`, with a comment pointing to where the transaction is
proven. 2/2 — and **still bites**: a fabricated reason fails both cases.

## The rest of the realtime-collab surface — compared against the original

| Suite | Original file | With the fix |
|---|---|---|
| `collab-section-locks.pglite.integration` | 7/7 | 7/7 |
| `seed-collab-review.pglite.integration` | 17/17 | 17/17 |
| `realtime-collab-tenancy` | 16/16 | 16/16 |
| `realtime-collab-presence-fallback` | **2 failed / 2 passed** | **2 failed / 2 passed** — identical |

`presence-fallback`'s two failures are `Test timed out in 10000ms` on the
**original** file too — pre-existing, not this change's.

## An environment finding recorded so nobody chases it

In this sandbox, PGlite's WASM boot is pathologically slow right now: a **bare**
`new PGlite(); await pg.waitReady` — no vitest, no repo code, no DDL — took
**30–39 s**; under vitest, 54–84 s, against a 60 s `hookTimeout`. The existing
`turn-record.pglite.test.ts` took 64 s. Earlier in this session the same suites
ran in about 2 s, and CI's full run passes 48,425 tests, so CI does not have it.

When the hook times out, the Tests line reads **"5 skipped"**, which looks like a
silent pass. **It is not** — verified deterministically with `--hookTimeout=1000`:
`Test Files 1 failed`, **exit code 1**. CI would catch it. The new suite's
timeout was deliberately **not** raised to paper over a sandbox property that
every other PGlite suite shares.

ESLint: 0 errors; the 5 warnings on `realtime-collab.ts` all pre-date this change
(the file was already 1,037 lines). One warning this change briefly introduced
(`'_actor' is assigned but never used`) was removed.
