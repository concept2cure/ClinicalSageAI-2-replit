# GA Readiness Audit — 03: Regulatory Compliance & Data Integrity (21 CFR Part 11 / GxP)

**Date:** 2026-06-14
**Scope:** `server/` and `services/` backend (NOT React client, NOT raw DB schema design).
**Method:** Net-new source review. Traced actual audit-write paths, hash-chain integrity, e-signature flows, governed exports, deletion/retention, eCTD checksums, and AI-content governance. Findings cite `file:line`. Focus is on what the CODE enforces, not what docs claim.

---

## Executive Summary

The platform ships a large amount of Part 11 *infrastructure*: a SHA-256 hash-chained tamper-proof log, HMAC seals, DB immutability triggers, e-signature tables, governed-export CI gates, eCTD MD5 checksums, retention jobs, and chain-verify scripts. The problem is not absence of controls — it is that the controls are **fragmented across at least five mutually-incompatible audit sinks** that do not share a table, a chain, or a verifier, and the **canonical audit-write path used by the bulk of the application does not participate in any verifiable hash chain**. On top of that, virtually every audit write is **fire-and-forget and decoupled from the action's transaction**, so regulated mutations can succeed with no durable, tamper-evident record. AI-generated content can be promoted to `lifecycleStatus: 'approved'` governed submission documents with **no human e-signature gate**.

These are completeness, immutability, and traceability failures that would fail a Part 11 inspection.

**Compliance GA verdict: NOT READY.**

### Five disjoint audit sinks discovered
1. **Drizzle `audit_logs`** (`shared/schema.ts:280`) — no chain columns. Written by `auditService.logAction` (the canonical facade). **Unchained, mutable.**
2. **PG `audit.tamper_proof_log`** (`server/lib/tamper-proof-audit.ts`) — chained + HMAC, immutability trigger. Written only via the same `auditService.logAction` dual-write (best-effort).
3. **Raw-SQL `audit_logs.sha256_chain`** (`server/services/audit/chain.ts`) — a *different physical shape* than #1, with `sha256_chain`/`hmac_seal` columns. Written only by C2C/governed-action and pharmacovigilance routes (`server/routes/c2c/actions.ts:291`, `server/services/compliance/pharmacovigilanceService.ts:1250`). This is what `verifyAuditChain` / `audit:verify` actually verifies.
4. **Local file `logs/audit.log`** (`server/utils/audit-logger.js:19,48`) — per-entry SHA-256, **not chained**, ephemeral disk. Used by the retention job for regulated deletes.
5. **Local file `logs/export_actions.jsonl`** (`server/export_logger.ts:9,52`) — plain JSONL, no hash, no chain, ephemeral disk. Export action log.

The chain-verify tooling (#3) passes while #1, #4, #5 — which hold most of the real audit volume — are unprotected.

### Severity counts
- BLOCKER: 4
- HIGH: 5
- MEDIUM: 4
- LOW: 2

---

## BLOCKER findings

### [BLOCKER] B1 — Canonical audit-write path stores to an UNCHAINED, mutable table; tamper-evidence does not cover most audited actions
**Files:** `server/services/auditService.ts:198-216`; `shared/schema.ts:280-305`; `server/services/audit/chain.ts:54-125,182-222`

`auditService.logAction` (reached from `auditLogger.ts`, the `esignature` router, the retention job, and most middleware) inserts into the Drizzle `auditLogs` table. That schema (`shared/schema.ts:280`) has only `id, tenantId, userId, action, tableName, recordId, oldValues, newValues, ipAddress, userAgent, createdAt, updatedAt` — **no `sha256_chain` and no `hmac_seal`**. The insert (`auditService.ts:201`) never calls `computeAuditChain`/`computeAuditChainSealed`.

The hash-chain verifier (`chain.ts:182` `verifyAuditChain`, exercised by `audit:verify:full`) re-derives `audit_logs.sha256_chain` — a column that exists only in the *separate raw-SQL* `audit_logs` shape written by `c2c/actions.ts:304` and `pharmacovigilanceService.ts:1261`. These two "audit_logs" are not the same table representation.

**Regulatory impact (§11.10(c),(e)):** Tamper-evidence protects only the narrow C2C/governed-action and pharmacovigilance rows. Every event flowing through the canonical `auditService.logAction` — logins, document access, data changes, exports, e-signature events — is stored as a plain, **mutable, unchained** row. A privileged user or DB-level attacker can edit/delete those rows undetectably, and the audit-verify scripts will still report green. The system advertises a tamper-evident trail it does not actually provide for most records.

**Fix:** Unify on ONE chained table. Add `sha256_chain` + `hmac_seal` to the Drizzle `auditLogs` schema and route every write through `computeAuditChainSealed` **inside the same transaction** as the insert (holding the `SELECT … FOR UPDATE` on the prior row). Retire the parallel sinks.

### [BLOCKER] B2 — Audit writes are fire-and-forget and NOT in the action's transaction; actions succeed with no durable record
**Files:** `server/services/auditService.ts:213-216,241-243,355-368`; `server/services/audit/auditLogger.ts:97-118`; `server/routes/esignature.ts:254`; `server/jobs/retentionCron.ts:118-142`

Every audit write is wrapped so a failure is logged and discarded; the recorded action proceeds regardless (`auditService.ts:214` "Non-fatal: audit write failure should not crash the request"). The audit write is also a *separate* DB operation from the business mutation — not the same transaction. Concrete examples:
- E-signature: `void auditService.logAction(...)` (`esignature.ts:254`) — fire-and-forget; the signature row is committed (line 214) and the function returns 201 even if the central audit write never lands.
- Retention delete: the row is deleted (`retentionCron.ts:118`) then `logAction(...)` is called (line 128) with no `await` and outside any transaction; a crash between the two leaves a deleted record with no audit entry.

**Regulatory impact (§11.10(e)):** A computer-generated, time-stamped audit trail must reliably record operator actions. Best-effort, post-hoc, non-transactional audit means a DB hiccup, pool exhaustion, or process crash yields a "ghost action" — an approval/signature/deletion that happened with no reconstructable record.

**Fix:** For regulated mutations, write the audit record in the SAME transaction as the action and fail the action closed if the audit write fails. Regulated routes must `await` the audit write.

### [BLOCKER] B3 — Audit *query/retrieval* reads exclusively from a volatile in-memory array bounded to 10k entries
**Files:** `server/services/audit/auditLogger.ts:55,75,86-88,126-190`

`queryAuditEvents` and `getResourceAuditTrail` (the exposed audit-retrieval functions) read only from the in-memory `auditStore` array (`auditLogger.ts:137` `[...auditStore]`), which is trimmed to the last 10,000 entries (line 86) and lost on every restart. They never query the durable DB store.

**Regulatory impact (§11.10(b)):** The agency must be able to obtain accurate and complete copies of records. An inspector querying through this API sees at most the last 10k in-memory events since the last restart — not the full, durable trail. Audit retrieval for review/inspection is incomplete and non-authoritative.

**Fix:** Back `queryAuditEvents`/`getResourceAuditTrail` with the durable chained DB table (with chain verification on read).

### [BLOCKER] B4 — HMAC seal is optional and seal-skip is reported as integrity-OK; the sha256 chain alone is forgeable
**Files:** `server/services/audit/chain.ts:85-92`; `server/services/audit/audit-integrity-service.ts:34-43`; `server/lib/tamper-proof-audit.ts:123-141`

The sha256 chain is keyless and public-algorithm, so anyone who can write the DB can recompute every downstream `sha256_chain` after editing a row. Only the HMAC seal makes it non-forgeable, but sealing is opt-in: `maybeSeal` returns `null` when `AUDIT_HMAC_KEY` is unset (`chain.ts:86`), and `verifyAuditIntegrity` returns `ok: true` with `seals.checked: false` when the key is absent (`audit-integrity-service.ts:41`) — i.e. an unprotected chain is reported as passing. Two different env vars gate the two systems (`AUDIT_HMAC_KEY` for chain.ts vs `AUDIT_HMAC_SECRET` for tamper-proof-audit.ts), so they can be independently un-keyed. Only `tamper-proof-audit.ts:125` fails closed in production; the `chain.ts` path never does.

**Regulatory impact (§11.10(e),§11.70):** A keyless chain detects naive edits but not a motivated insider who re-chains. Reporting integrity-OK on an unsealed chain gives false assurance.

**Fix:** Require `AUDIT_HMAC_KEY` in production (fail-closed). Make `verifyAuditIntegrity` return a distinct non-OK/"unverifiable" status when seals are absent on a production chain. Consolidate to one secret env var.

---

## HIGH findings

### [HIGH] H1 — AI-generated content is promoted to an "approved" governed submission document with NO human e-signature gate
**Files:** `server/services/ai-actions/handlers/promote-artifact.ts:12,75-89,174-177,242-272`

`promote_artifact` moves AI-generated artifact content into a governed `unifiedDocuments` record, sets the artifact to `status: 'approved'` (line 246), and resolves the governed contract with `lifecycleStatus: 'approved'` / `approvalPathType: 'regulated_dual_review'` (lines 176-177) — yet performs **no signature, no second-person review, and no approver identity capture**. The file header openly states approval gates are deferred: *"Phase 2: Add approval gates"* (line 12). The only gate is a contradiction check that is wrapped in try/catch and **silently proceeds if the table is missing** (lines 104-107).

**Regulatory impact:** Unverified AI output reaches a record marked "approved/submission-candidate" without human-in-the-loop sign-off. This is exactly the failure mode the audit was asked to catch: unverified AI content reaching regulated submissions. Violates §11.10(d)/(g) (authority checks) and human-oversight expectations for AI-assisted regulatory content.

**Fix:** Block promotion to any "approved"/submission lifecycle status behind a real e-signature (reuse `esignature.ts`) with reviewer identity, meaning, and reason captured atomically. Make the contradiction/governance check fail-closed.

### [HIGH] H2 — E-signature `/sign` trusts a client-supplied `secondFactorVerified` boolean and hardcodes `is_valid = true`
**Files:** `server/routes/esignature.ts:137-154,225-228,240`

`/sign` stores whatever `secondFactorVerified` flag the client sends (line 240) and hardcodes `is_valid = true` in the insert (line 227). There is no server-side binding between the earlier `/verify-password` + `/verify-mfa` calls and this `/sign` call — no nonce, no short-lived signing token, no server session state proving the two factors were actually verified *for this signing event*. The header even says it "trusts those checks" (line 134-135).

**Regulatory impact (§11.200(a)(1)):** A client can call `/sign` directly, asserting `secondFactorVerified: true`, and produce a fully "valid" e-signature record without ever passing password/MFA. The two-component signing requirement is not enforced server-side.

**Fix:** Issue a single-use, short-TTL signing token from the verify endpoints (bound to user + document + version) and require it at `/sign`; derive `is_valid` from server-verified state, never from the request body.

### [HIGH] H3 — Regulated deletes are "audited" only to a non-chained, ephemeral local file
**Files:** `server/jobs/retentionCron.ts:34,128-142`; `server/utils/audit-logger.js:19,27-48`

The retention job's delete audit (`retentionCron.ts:128`) routes to `logAction` from `server/utils/audit-logger.js`, which appends to `logs/audit.log` (line 48). Each entry carries a self-only SHA-256 `integrity_hash` (line 39-44) that **does not chain to the previous entry** — deleting or editing a line is undetectable because there is no link to break. The file lives on the local/ephemeral container filesystem and is not the DB system of record.

**Regulatory impact (§11.10(e)):** Deletion of regulated records (`document.retention_hard_delete`) is the single most audit-critical event, and here it is logged to a tamperable, non-durable file outside the DB. The `ci:regulated-delete-audit` gate (`scripts/ci/check-regulated-delete-audit.mjs`) only checks that *some* audit call exists near a delete — it does not verify durability, chaining, or transactionality, so it passes this.

**Fix:** Route retention deletes through the unified chained DB audit table in the same transaction as the delete.

### [HIGH] H4 — Governed-export "compliance" is enforced by static string-matching, not by runtime audit emission
**Files:** `scripts/ci/check-governed-export-routes.mjs:7-79`; `scripts/ci/check-regulated-delete-audit.mjs:30-60`

The governed-export and regulated-delete CI gates assert that certain *tokens* appear in source files (`createGovernedExportConsequence(`, `auditService.`, etc.). They never execute the routes or confirm an audit record is actually persisted, in-transaction, on a real export/delete. A route can contain the token in a dead branch, a comment-adjacent position, or a path that swallows the audit error (B2) and still pass.

**Regulatory impact:** Gives false confidence that exports/deletes are governed. Token presence ≠ control enforcement.

**Fix:** Add integration tests that perform an export/delete and assert a durable, chained audit row exists and is verifiable; keep the static gate only as a fast pre-check.

### [HIGH] H5 — eCTD clinical-summary generator silently injects placeholder efficacy data when input is missing
**Files:** `services/ectd_generator.py:236-247,402-413`

`generate_clinical_summary` falls back to a hardcoded example table of clinical efficacy results (e.g. "Mean systolic BP change −5.2 ± 1.1", "62%") whenever `data` is absent or has no `tables`. The fallback is logged at INFO ("rendering default example table") but the resulting DOCX is indistinguishable from a real Module 2.7.3 clinical summary — same title, footer ("Generated by Concept2Cure eCTD Co-Author"), and styling. There is no checksum, provenance stamp, or audit emitted by this generator.

**Regulatory impact:** Fabricated placeholder clinical data can be rendered into an authentic-looking regulatory submission document with no marker distinguishing it from real data. This is a data-integrity (ALCOA+ "Attributable/Original/Accurate") hazard.

**Fix:** Fail loudly (raise) when required submission data is absent; never substitute example clinical values. Stamp generated artifacts with provenance + a content hash and emit an audit record.

---

## MEDIUM findings

### [MEDIUM] M1 — Tamper-proof log immutability trigger relies on table existing in `audit` schema with `uuid_generate_v4()`; init is best-effort and non-fatal
**Files:** `server/lib/tamper-proof-audit.ts:147-208`; `server/services/auditService.ts:122-133`

Table + immutability trigger creation runs lazily and its failure is caught and logged as "non-fatal" (`auditService.ts:123`). If `CREATE TABLE`/`CREATE TRIGGER` fails (missing `uuid-ossp` extension, no `audit` schema, insufficient grants), the system continues with the trigger absent — the log is then mutable with no error surfaced. The immutability guarantee depends on a step that is allowed to silently fail.

**Fix:** Make audit-table/trigger initialization a hard startup precondition in production; refuse to serve regulated routes if absent.

### [MEDIUM] M2 — Two divergent content-hash serializations for the same chain ("tamper-proof-audit" vs "chain.ts") risk verifier drift
**Files:** `server/lib/tamper-proof-audit.ts:245-252,356-367`; `server/services/audit/chain.ts:65-77,142-154`

The two chain implementations canonicalize different field sets in different orders (`tamper-proof-audit` includes `eventType/action/details/timestamp/context`; `chain.ts` includes `action/actor_id/target/payload_hash/occurred_at/previous`). Each re-derives its own format, so within a system they are self-consistent, but maintaining two serializations invites future drift where a writer and verifier disagree and a valid chain reports as broken (or vice-versa).

**Fix:** Single canonicalization helper shared by writer and verifier; one chain implementation.

### [MEDIUM] M3 — Export action log is plaintext JSONL with no integrity hash at all
**Files:** `server/export_logger.ts:9,39-65,146-156`

`export_actions.jsonl` records export actions (PDF/comparison/digest) with no hash, no chain, and a `clearExportLogs()` that truncates the file (line 146). Even setting aside that it's a file, there is zero tamper-evidence on export provenance.

**Fix:** Fold export actions into the unified chained audit table; remove the clear-all helper from production builds.

### [MEDIUM] M4 — `auditService` Drizzle insert always writes `oldValues: null`, losing before/after state for data changes
**Files:** `server/services/auditService.ts:201-211`

The dual-write hardcodes `oldValues: null` (line 207) and stuffs everything into `newValues`. `logDataChange` upstream does pass `previousValue` (`auditLogger.ts:240-261`) but it is collapsed into the details blob, not the dedicated `oldValues` column, so reconstructing prior state from the queryable table is unreliable.

**Fix:** Persist `previousValue`/`newValue` into the dedicated columns for create/update/delete events.

---

## LOW findings

### [LOW] L1 — Dev fallback HMAC secret is a hardcoded constant string
**File:** `server/lib/tamper-proof-audit.ts:138` (`'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION'`)
Acceptable since production throws, but a staging/preview env that sets `NODE_ENV` to anything other than `production` would silently use it. Recommend failing closed in any non-`development` environment.

### [LOW] L2 — Verification success is itself written into the chain it just verified
**File:** `server/lib/tamper-proof-audit.ts:409-420`
`verifyChain` logs an `AUDIT_VERIFICATION_PASSED` entry into the same log, mutating the very structure under verification. Minor, but means a read-only verification has a write side-effect (and can fail if the log is in a read-only/immutable state). Prefer recording verification results in a separate sink.

---

## What is actually correct (for balance)
- eCTD assembly computes per-leaf MD5 over deterministic PDF bytes (`server/services/ectd/assemble-from-core.ts:102`; `ectd4-validator.ts:434`; `ectd-validator-hardening.ts:354`) and the leaf renderer is built for byte-reproducibility (`leaf-pdf-renderer.ts:13,150,185`) — checksum + determinism here are sound.
- The tamper-proof PG log has a real immutability trigger blocking UPDATE/DELETE (`tamper-proof-audit.ts:193-204`) and fails closed without `AUDIT_HMAC_SECRET` in production (line 125).
- C2C governed actions DO chain + seal in-transaction (`server/routes/c2c/actions.ts:291-320`) with reason capture — this is the model the rest of the system should follow.
- E-signature verify endpoints do real server-side bcrypt + TOTP (`esignature.ts:67-115`) and refuse to sign if the table is unmigrated (line 279-285).

---

## Remediation priority for GA
1. **B1 + B2 + B4** — unify on one chained, sealed, in-transaction audit table; require the HMAC key in production. (Without this, no Part 11 audit-trail claim holds.)
2. **B3** — back audit retrieval with the durable store.
3. **H1 + H2** — gate AI promotion and e-signature behind enforced server-side human sign-off.
4. **H3 + H5** — durable chained audit for deletes; remove fabricated eCTD placeholder data.

**Compliance GA verdict: NOT READY.** Conditional-Ready is achievable only after B1–B4 and H1–H3 are closed and verified by integration tests (not static gates).
