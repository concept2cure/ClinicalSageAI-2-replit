# D5 — the signed audit export contains the Vault's events

**Row:** D5 Part 11 evidence (§11.10(b): accurate and complete copies of records). **Slice:** VR-02 of
`docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`, which is the first half of P1-19 in
`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` (the export reads `audit_logs` as well as
`audit_events`). The KMS signature and export key-id halves of P1-19 are not taken here.
**Date:** 2026-09-25. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.

## 1. What was wrong

- The export an inspector receives (Admin → Audit trail → Export; `GET /api/audit/export`,
  `/api/audit/export/signed`) read `audit_events` only. Every launch app writes its governed events
  to `audit_logs` through the one chained writer: Vault ingest, filing and download, Submission Center,
  QMS and the governed actions. **No Vault event appeared in any exported file.** Shown on PGlite with
  the real `audit_logs` DDL and the `chain_seq` migration: an org holding three Vault events exported
  zero of them.
- Both routes passed the shared pool to the export. Under `RLS_ENFORCE=on` a pooled connection
  carries no tenant. The ledger's own header says so, and it reads in a transaction stamped by
  `setTenantContextTx`. The newly exported rows would have come back empty in production.

## 2. What changed

- `generateSignedAuditExport` reads both stores into one file. Each row is labelled `source`, and an
  `audit_logs` row carries `sha256_chain`, `chain_seq`, `hmac_seal`, `payload_hash` and `target`. Every
  row is included, chained or not; an unchained row says so by its NULLs. The CSV gains those columns.
- The manifest adds `sources` (rows per store) and `auditLogsChain`, the verdict on the tenant's
  `audit_logs` chain. `chainIntegrity` remains about `audit_events` only. Without a verifier the new
  verdict is `unverified` with a reason, never `intact`. The v2 canonicalization signs every key, so
  both new fields are covered by the signature.
- Filters `resourceType` and `recordIds` narrow both stores (e.g. one document's history), and the
  manifest and the export's own audit record state them.
- The verdict comes from `services/audit/tenant-chain-verdict.ts`, the ledger's admin-scope verifier
  moved out of the route so the ledger, a document's history and the export share one function.
- Both routes export inside a tenant-stamped transaction with that verifier, accept
  `resource_type` / `record_ids`, and refuse a malformed filter with 400 rather than exporting
  everything.

## 3. Proof

| | |
|---|---|
| `red/vr02.txt` | Service on HEAD (PGlite): zero `audit_logs` rows, no `source` label, the filter returns the wrong rows, a one-byte change to a Vault row cannot be detected (the row is not in the file), no `auditLogsChain`. Routes on HEAD: the pool is passed, no transaction, no filters, no 400, no rollback. |
| `green/vr02.txt` | 14 of 14: PGlite 6 (Vault rows with chain hash and sequence; no other tenant's rows; `audit_events` rows kept; filters; verify accepts and refuses a one-byte change; the verdict stated, never "intact" without a verifier) and routes 8. The existing export gate (unverified verdicts), canonicalization and ledger suites: 21 files and 182 tests across the audit area pass. tsc 0; ratchet unchanged. |
