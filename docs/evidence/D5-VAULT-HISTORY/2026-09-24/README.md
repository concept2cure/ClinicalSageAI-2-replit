# D5 — every Vault download joins the sequenced audit chain, and a document shows its own history

**Row:** D5 Part 11 evidence (§11.10(e): the audit trail must be available for review). **Slice:** VR-01 of
`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, with the completeness critic's corrections applied.
**Date:** 2026-09-24/25. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.

## 1. What was wrong

- **A download sat outside the sequenced chain.** `recordVaultDownload` wrote its chained row through the
  pool, outside a transaction. The chain's position lock and its INSERT must share one transaction
  (`services/audit/chain.ts`). Without one, the `audit_logs` trigger recorded every download as a
  **legacy** row (`chain_seq` NULL), while the ingest and filing rows for the same document were
  sequenced. Shown on real Postgres (PGlite, the real DDL and the `chain_seq` migration): the download
  row's `chain_seq` was NULL and the verifier counted one legacy row.
- **A document had no history.** The detail pane said no history endpoint existed, and the only
  audit readers were org-wide.

## 2. What changed

- `recordVaultDownload` writes in a transaction of its own. The download is still refused if the
  write fails.
- `readRecordAuditHistory` (`server/routes/audit-trail-ledger.routes.ts`, beside `readAuditLedger`)
  reads one record's rows from the one ledger, with the same row mapping and the same whole-chain
  verdict. Each row's predecessor is found by a tenant-scoped lookup on `chain_seq`. A LAG over the
  filtered rows (the critic's correction) would name the document's previous row, not the chain's.
- `GET /api/c2c/project-vault/:id/documents/:documentId/history` checks that the document is this
  program's and this org's, reads inside a tenant-stamped transaction, and answers a failed read with
  a 500, never an empty history.
- The Vault detail pane shows **History**: the chain verdict, then every event newest first (event,
  when, who, hash prefix). A failed read says so, a broken chain is an alert, and a body without
  entries and a verdict is a failed read, not an empty history.
- `vault-download.test.ts`'s pool mock gets a client from `connect()`, sharing the same query mock, so
  its assertions are unchanged (the critic's third blocker).

## 3. Proof

| | |
|---|---|
| `red/vr01.txt` | On the old writer the download is legacy: `chain_seq` NULL, one legacy row. The client tests fail: no history panel, no chain verdict. |
| `green/vr01.txt` | 11 of 11: PGlite 5, route 3, client 3. The 20 server files that touch project-vault or the ledger (164 tests) and the 9 Vault client files (44 tests) pass. tsc 0. `ci:undefined-css-classes` OK. |

The predecessor test fails if the LATERAL lookup is replaced by a LAG over the filtered rows: an
interleaved second document's row is the true predecessor.
