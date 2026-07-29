# Audit Integrity — HMAC Seal for `audit_events` (Finding F1)

> ⚠️ **STATUS: DESIGN / REQUIRES REVIEW — NOT YET IMPLEMENTED.**
> This note describes how to close finding **F1** of
> `docs/SECURITY_SWARM_AUDIT_2026-06-17.md`. The breaking writer change is
> **intentionally deferred** (see "Why not implement the writer now" below).
> No code or schema in this note has been applied.

## 1. The gap (F1)

| Table | Hash chain | Keyed HMAC seal | Verdict |
|-------|-----------|-----------------|---------|
| `audit_logs` (public, queryable mirror) | SHA-256 `sha256_chain` | ✅ `hmac_seal` (HMAC-SHA256, `AUDIT_HMAC_KEY`) — see `server/services/audit/chain.ts` + `audit-hmac-seal.ts` | sealed, non-forgeable |
| `audit_events` (SIEM / export-facing) | SHA-256 `record_hash` / `previous_hash` (DB trigger `audit_events_hash_chain`, `20260222_audit_events_hash_chain.sql`) | ❌ none | **unkeyed → forgeable** |

`audit_events` is chained with **plain SHA-256** computed by a DB trigger
(`audit_events_hash_chain()` in `20260222_audit_events_hash_chain.sql`). Because
the algorithm is public and the chain inputs are all columns in the row, anyone
who can rewrite the whole table can recompute every `record_hash` and forge a
self-consistent ledger. `audit_logs` already closes this with a secret-keyed
**HMAC-SHA256 seal** (`hmac_seal`) held outside the DB. F1 = bring `audit_events`
to parity.

## 2. Target design (mirror `audit_logs`)

### 2a. New column (additive)

```sql
-- Additive, nullable. Rows written before sealing remain NULL (chain still
-- covers them; seal simply absent), exactly like audit_logs.hmac_seal today.
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hmac_seal TEXT;
```

Nullable on purpose: a half-rolled-out seal must never block an INSERT, and
old rows are validly unsealed. This mirrors `audit_logs.hmac_seal` semantics
encoded in `verifyAuditChainSeals` (chain.ts): seal-bearing rows are verified,
NULL-seal rows are skipped but still chained.

### 2b. How the seal is populated

The seal binds the three chain fields, using the **existing, already-shipped**
pure module `server/services/audit/audit-hmac-seal.ts`:

```ts
sealRecord({
  recordHash:     row.record_hash,      // audit_events.record_hash
  previousHash:   row.previous_hash ?? GENESIS_PREVIOUS_HASH,
  sequenceNumber: row.sequence_number,  // audit_events already has this column
})  // → HMAC-SHA256(AUDIT_HMAC_KEY, "seq:N\nrecord:<h>\nprevious:<h>")
```

Note `audit_events` has a real monotonic `sequence_number` (per-org), so unlike
`audit_logs` (which pins `AUDIT_SEAL_SEQ = 0`) the seal can bind the **actual**
sequence number — strictly stronger: it detects reordering directly.

**Writer choice — two options, pick at rollout:**

- **Option A (preferred, app-layer, mirrors `audit_logs`):** seal in the Node
  writer. The DB trigger `audit_events_hash_chain` already assigns
  `sequence_number`, `previous_hash`, `record_hash` on `BEFORE INSERT`, so those
  values are only known *after* insert. So either (i) move sequence/hash
  derivation into the app writer the way `chain.ts` does for `audit_logs`
  (`computeAuditChainSealed`) and write `hmac_seal` in the same INSERT, or
  (ii) compute the seal in an `AFTER INSERT` step / `RETURNING` and `UPDATE` the
  just-inserted row — **(ii) is incompatible with the immutability trigger**, so
  prefer (i). The key stays in Node (`process.env.AUDIT_HMAC_KEY` / KMS), never
  in the DB.

- **Option B (DB-layer, NOT recommended):** seal inside the
  `audit_events_hash_chain()` trigger using `hmac(...)` from `pgcrypto`. Rejected
  because it would require the secret HMAC key to live inside the database — the
  exact threat model the seal exists to defeat (a DB-only compromise must not be
  able to forge seals). Keep the key out of the DB.

### 2c. How verification works

Add an `audit_events` counterpart to `verifyAuditChainSeals` (the one in
`chain.ts` for `audit_logs`), reusing the shared `verifyChainSeals` /
`verifySeal` from `audit-hmac-seal.ts`:

1. `SELECT record_hash, previous_hash, sequence_number, hmac_seal FROM audit_events
   WHERE record_hash IS NOT NULL ORDER BY organization_id, sequence_number`.
2. Walk per-org in sequence order; for each row **with** a non-NULL `hmac_seal`,
   call `verifySeal({ recordHash, previousHash, sequenceNumber }, hmac_seal)`.
3. Skip NULL-seal rows (pre-rollout) but keep them in the chain walk so a
   later sealed row's `previousHash` is still correct — same pattern as
   `verifyAuditChainSeals`.
4. Surface the result through the existing endpoint
   `GET /api/part11/audit-trail/chain-integrity`
   (`server/routes/part11-compliance.ts`, ~line 741): add an
   `hmacSealStatus: 'verified' | 'broken' | 'unsealed' | 'unverifiable'` field
   **alongside** the existing SHA-256 `chainStatus` — additive, does not change
   the current SHA-256 verdict.

Verification requires `AUDIT_HMAC_KEY` (like `audit_logs`); when absent, report
`unverifiable`, never throw in the response path.

## 3. Why NOT implement the breaking writer now

`audit_events` is the **SIEM / export-facing** table. It is read by, at least:

- `server/services/audit/signedAuditExport.ts`
- `server/routes/admin/audit-siem.ts`
- `server/services/tenant-export/attestation-report.service.ts`

A half-applied seal (column added but only some rows sealed, or a writer change
deployed before the column/verifier, or the verifier defaulting to "broken" on
NULL seals) could **break exports / attestations** or raise false tamper alarms.
The hash chain (F1's *detection*) is already in place; the seal is a
*strengthening*, so it can and must roll out carefully rather than as one
big-bang change.

## 4. Recommended safe rollout order

1. **Schema first (additive, nullable):** ship `ALTER TABLE audit_events ADD
   COLUMN IF NOT EXISTS hmac_seal TEXT;` as its own date-prefixed migration.
   Deploy. No behavior change — all reads/exports unaffected, all rows NULL.
2. **Verifier next, tolerant of NULL:** ship the `audit_events` seal verifier +
   the additive `hmacSealStatus` field, treating NULL seals as `unsealed`
   (skipped), never `broken`. Confirm exports/attestations still pass with an
   all-NULL column.
3. **Key provisioning:** ensure `AUDIT_HMAC_KEY` is provisioned in every
   environment via KMS/secrets manager (same key already used by `audit_logs`),
   verified present before step 4.
4. **Writer last (Option A-i):** enable sealing on new INSERTs only. New rows get
   `hmac_seal`; historical rows stay NULL. Because the writer derives
   seq/hash/seal in one INSERT, no UPDATE is needed (compatible with the
   immutability trigger from `20260617_audit_logs_immutability.sql` / the
   existing `audit_events` immutability triggers).
5. **(Optional, last) Backfill:** historical `audit_events` rows are immutable
   (`20260222_audit_events_immutability.sql`), so they **cannot** be back-sealed
   in place. Leave them NULL-sealed (still SHA-256 chained) and document the
   sealing cutover timestamp, OR back-seal only via a controlled, audited,
   trigger-disabled maintenance window if compliance requires full coverage.
   Prefer leaving them NULL + documenting the cutover.

## 5. Acceptance checks before calling F1 closed

- `audit_events.hmac_seal` exists and is nullable; no existing column/trigger altered.
- New `audit_events` INSERTs carry a verifiable `hmac_seal` when `AUDIT_HMAC_KEY` is set.
- `GET /api/part11/audit-trail/chain-integrity` reports `hmacSealStatus`
  additively, with NULL-seal rows reported `unsealed` (not `broken`).
- SIEM export (`audit-siem.ts`), `signedAuditExport.ts`, and attestation reports
  pass unchanged with both NULL-seal and sealed rows present.
- Tampering with a sealed row's `record_hash` flips `hmacSealStatus` to `broken`.
