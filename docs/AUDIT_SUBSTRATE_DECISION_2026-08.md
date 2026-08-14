# Audit substrate decision — which chain is the reference

**Status:** recommendation, awaiting approval for Stage 2. Stage 0 has shipped.
**Ledger row:** L11 in `docs/GA_COMPLETION_LEDGER_2026-08.md`.
**Inventory:** `docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.2 established that this platform
has **two** canonical audit substrates. This document decides which one wins, on evidence.

---

## 1. The problem in one sentence

`audit_logs` and `audit_events` are both hash-chained, both immutable, both HMAC-sealed,
both written by production code every day — and they are chained on different principles,
scoped on different columns, verified by different code, and surfaced on two different
screens that show a regulated customer two different, incomplete histories of the same
system.

A 21 CFR Part 11 audit trail with two disjoint halves is not two audit trails. It is one
audit trail with gaps, twice.

## 2. The evidence

Everything below is read from the code, not from the schema's intentions.

### 2.1 The `audit_logs` chain is global across tenants

`server/services/audit/chain.ts:59`:

```sql
SELECT sha256_chain FROM audit_logs WHERE sha256_chain IS NOT NULL
ORDER BY occurred_at DESC, id DESC LIMIT 1 FOR UPDATE
```

There is no tenant predicate. One chain spans every organization on the platform. Three
consequences, all of them load-bearing:

1. **Every governed write in the product serializes on a single row.** `FOR UPDATE` on the
   one latest row is a global write lock. Tenant A's e-signature waits behind tenant B's
   document edit. This is a throughput ceiling that gets worse with every customer.
2. **A tenant's trail cannot be excerpted and independently verified.** To prove tenant A's
   chain is unbroken you must walk links that belong to tenants B…Z. You therefore cannot
   hand a customer, an auditor, or a notified body a verifiable copy of their own audit
   trail without disclosing other customers' audit hashes.
3. **A tenant-scoped reader cannot walk the chain at all.** This is not theoretical: it is
   why `GET /api/mdx/audit` now reports `prevAvailable: false`. The predecessor of any
   given row usually belongs to a different organization.

There is also an ordering hazard: `occurred_at` is application-supplied. A row inserted
with a skewed or backdated `occurred_at` links to something other than the true latest
row, forking the chain rather than extending it.

### 2.2 A writer can leave the `audit_logs` chain silently

The predecessor query filters `WHERE sha256_chain IS NOT NULL`. So a writer that
hand-rolls an `INSERT` and skips `computeAuditChainSealed` produces a row that is **not
covered by the chain and does not break it**. Verification still passes. The row is simply
invisible to the integrity story while sitting in the table looking exactly like evidence.

This is not a hypothetical failure mode — it is the one that actually happened. The
inventory sweep found eight services writing outside the chain, including
`ana-platform-controller`, whose audit call wrote nothing at all through nonexistent
columns behind an empty `catch`. Nothing detected it, because there was nothing to detect:
an absent row breaks no hash.

### 2.3 The `audit_events` chain cannot be bypassed

`db/migrations/20260222_audit_events_hash_chain.sql:96` installs
`trg_audit_events_hash_chain` as a **BEFORE INSERT** trigger. Every row gets
`sequence_number`, `previous_hash` and `record_hash` computed in the database, whatever the
writer does. A hand-rolled `INSERT` is chained identically to a sanctioned one. There is no
"forgot to call the helper" failure mode because there is no helper to forget.

It takes `pg_advisory_xact_lock` **keyed on `organization_id`**, so concurrent
organizations do not serialize against each other, and it maintains a **gapless per-org
`sequence_number`**, which makes a deleted row detectable as a gap rather than merely
invisible.

### 2.4 The daily verifier already treats `audit_events` as the substrate

`server/services/audit/chainIntegrityMonitor.ts:149` reads
`… ORDER BY organization_id, sequence_number ASC` — from `audit_events`. The automated
integrity check that runs against this platform already regards the per-org chain as the
thing worth verifying. `audit_logs` has its own verifier in `chain.ts:187,240`, which must
run unscoped over the whole table.

### 2.5 Part 11 semantics live on `audit_events`

`requires_signature`, `signature_status`, `signed_by`, `signature_meaning`,
`regulatory_significant`, `gxp_relevant`, `changed_fields`. These are the columns a Part 11
audit trail is *about*. `audit_logs` carries `table_name` / `record_id` / `target` /
`reason` / `ana_action_id` — a good change log, a thinner compliance record.

### 2.6 What `audit_logs` has going for it

Adoption. `auditService.ts:275` is the sanctioned write path and everything routed through
it lands here, plus four transactional writers that legitimately hand-roll the INSERT to
stay atomic with a domain write. Against that, `audit_events` has 17 direct writer sites
and no service-layer front door.

## 3. Decision

**`audit_events` becomes the reference substrate.**

The deciding property is §2.2 versus §2.3. Every other difference is a trade; this one is
not. An audit chain whose coverage depends on each writer remembering to opt in has
already been shown — in this codebase, at production scale — to lose rows silently. A
chain enforced by a BEFORE INSERT trigger cannot. For a regulated product, that difference
outweighs adoption, which is a migration cost, not a correctness property.

The alternative was considered and rejected: making `audit_logs` the reference would
require adding a per-tenant chain, a gapless sequence, and database-side enforcement to it
— which is to say, rewriting it into `audit_events`.

## 4. Staged path

**Stage 0 — stop the surface asserting integrity it never checked. SHIPPED.**
`GET /api/mdx/audit` emitted `chain: 'ok'` as a literal constant on every row and read
`sha`/`prev` from `new_values` keys `auditService` has never written, so the Part 11 audit
surface showed blank hashes under a shield badge that said "Tamper-evident · SHA-256"
regardless of what the rows carried. It now reads the real `sha256_chain` / `hmac_seal`
columns, reports per-row `sealed` / `chained` / `unchained`, and states plainly when a row
was written outside the chain. Locked by
`server/routes/__tests__/mdx-audit-integrity.test.ts` (9 tests).

**Stage 1 — bridge, so neither screen is missing half the history.** `auditService` — the
one sanctioned writer — additionally emits an `audit_events` row inside its existing
transaction. Every governed action then appears in the per-org chain, and the Part 11
Console shows a complete trail. No reader changes; nothing regresses. *Hazard to respect:*
`auditService` already holds the global `FOR UPDATE` lock on `audit_logs` when the trigger
takes its per-org advisory lock. Every writer must acquire them in that order, or two
writers in opposite orders will deadlock. This needs to be stated in the writer's contract,
not just observed to work.

**Stage 2 — flip the readers. REQUIRES APPROVAL.** The `audit_logs` readers
(`mdx-audit.ts`, `regulatory-programs.service.ts`, `pm-settings.router.ts`,
`DecisionLineageService.ts`, `pdev-provenance-trace.ts`, `audit-archive.service.ts`) move
onto `audit_events`; `auditService` stops writing `audit_logs`. This changes what a
regulated customer's audit surface reads from, so it is not mine to decide unilaterally.

**Stage 3 — `audit_logs` becomes read-only history.** Retained and still verifiable, no
longer written. It is evidence; it does not get deleted.

## 5. What this decides for L12

`docs/AUDIT_STORE_INVENTORY_2026-08.md` §1.3 lists 23 domain-history tables to be
chain-linked, and `linkDomainHistory` currently has zero call sites. That work should link
into **`audit_events`**, not `audit_logs` — otherwise 23 tables get wired into the
substrate that is being retired. L12 is therefore sequenced after Stage 1, and the ledger
records it as blocked on this decision.
