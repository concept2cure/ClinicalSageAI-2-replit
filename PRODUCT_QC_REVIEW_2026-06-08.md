# Product QC review — 2026-06-08

Standing QC ownership across the whole product (not just security). Same method
that proved out on the security pass: **swarm to triage → verify every finding
against source → fix the safe/real ones → turn finding-classes into durable CI
gates → document the consequential ones for the owner**. Verification matters —
several agent-rated "CRITICAL" findings did not survive a read of the code and
are recorded below as false positives so the inventory stays honest.

Environment caveat: no Neon DB and no deploy here, so fixes are verified by
`tsc --noEmit`, the repo gate suite, and code-path reasoning — not live runtime.

## Status summary

| Dimension | Verdict | This pass |
|---|---|---|
| Correctness / reliability | Mostly sound; agent CRITICALs largely false positives | 1 real fix (silent-swallow logging); rest documented/false-positive |
| 21 CFR Part 11 / audit integrity | **Core is strong** (hash-chain, tamper-proof log, governed-action flow) | 3 real gaps documented for the operator (migrations / transaction work) |
| Design-system / a11y / copy | Strong on copy/fonts/icons; hex debt is large | a11y + token-bug fixed; **new gate added**; hex tokenization deferred to designer |

---

## 1 · Correctness & reliability

**Calibration: the agent over-rated. Verified before acting.**

- ✅ **Fixed — `api-key-service.ts`** silent-swallow: the fire-and-forget usage
  UPDATE swallowed errors with an empty `.catch(() => {})`, masking corrupted
  `request_count`/`last_used_at` (suspicious-activity + billing signal). Now
  logs the failure (still non-blocking).
- ❌ **False positive — `command-executor.ts:1001` "unguarded user crash":** the
  fetched `user` row is **never consumed** (no `user.` access anywhere; the
  export builds `{ id: ctx.userId }`). At most dead code, no crash.
- ❌ **False positive — `governed-decision-repository.ts:250` "audit lost":**
  `recordGovernedDecision` already logs (`log.warn`) **and** records a failure
  metric on persistence error; the "already logged inside" comment is accurate.
- ⏭ **Documented — project-settings race (`concept2cure.ts:~2598`):** read-modify-
  write of `projects.settings` without a transaction; concurrent module toggles
  can lose an update. Real but moderate-risk fix (atomic `jsonb_set` or a txn);
  needs a DB to verify, so left for a follow-up.
- ⏭ **Documented — `statistics-service` error shape:** catch returns
  `{ count: 0, error }`; a caller checking only `count` treats a DB error as
  "no data". Prefer a `success` flag. Low-risk but behavioural.
- ℹ **Well-handled (calibration):** transactional flows in `concept2cure.ts`
  (BEGIN/COMMIT/ROLLBACK + `finally release()`), the SHA-256 audit-entry helper,
  and DOMPurify allow-list sanitization are all exemplary.

---

## 2 · 21 CFR Part 11 / audit-trail integrity

**The compliance core is strong — verified, not assumed:**
- Hash-chain (`services/audit/chain.ts`): deterministic canonical form, previous-
  hash chained, SHA-256, `SELECT … FOR UPDATE` anti-fork, verification re-derives.
- Tamper-proof log (`lib/tamper-proof-audit.ts`): DB trigger blocks UPDATE/DELETE,
  HMAC over the chain hash, sequence ordering, genesis hash, timing-safe compare.
- Governed-action flow (`routes/c2c/actions.ts`): all six mutations write
  `audit_logs` + `c2c_ana_actions` in **one transaction**, idempotency keys,
  re-auth gate (bcrypt + TOTP) for sign/lock/revoke, separation-of-duties, RBAC.
- E-signature enforcement: `transitionSequence` correctly **rejects** irreversible
  `frozen`/`dispatched` flips on the plain route (must go through the governed
  e-sign flow) — the QA_REPORT #3 fix is verified in place.

**Real gaps — documented for the operator (each needs a migration / transaction
change in compliance-critical code, so not done unilaterally without a DB):**
1. ◑ **Audit gap closed (soft-delete still pending) — `coauthor_documents`:**
   both routes that hard-delete regulated eCTD documents — `ectd-documents.ts`
   and `coauthor.ts` — previously deleted with **no audit** (§11.10(e),
   QA_REPORT #14). ✅ Both now delete and write an `audit_events` row **in the
   same transaction** (atomic, fail-closed), via the proven `transaction()` +
   `audit_events` pattern; removed from the gate allow-list (positively
   enforced). Contract test `coauthor-document-delete-audit.contract.test.ts`
   (6 tests, no DB). ⏭ The remaining enhancement is **soft-delete** (add
   `deleted_at`, retain the row, filter reads) — a schema migration, still
   operator-track; the audit gap itself is now closed.
2. ✅ **Fixed — fire-and-forget audit on `routes/c2c/documents.ts` mutations:**
   both the evidence **delete** (`:560`) and the section **transition** (`:452`)
   recorded the audit *after* the mutation, non-awaited, with a swallowed error
   — a crash or audit failure left the mutation unaudited.
   - *Delete:* now audits first via `writeMutation` and **awaits** it
     (fail-closed — an audit failure blocks the delete).
   - *Transition:* the audit now runs via `recordGovernedAction` **inside the
     same DB transaction** as the section change, before COMMIT — so they
     commit or roll back together (atomic, fail-closed).
   - *Link:* the insert and its audit (`recordGovernedAction`) now run in one
     transaction, committing or rolling back together.
   All three fire-and-forget audits in `c2c/documents` are closed (the two
   remaining `writeMutation` calls at `:600`/`:653` were already awaited).
   Contract tests
   (`c2c-documents-{delete,transition,evidence-link}-audit-order.contract.test.ts`,
   7 tests, no DB) lock the audit↔mutation order, the fail-closed/rollback
   behaviour, and the 404 path.
3. **HIGH — immutability middleware is narrow (`startup/middleware.ts:113`):**
   `IMMUTABLE_ROUTE_PATTERNS` only guards `/api/audit/*`. Regulated-data DELETEs
   elsewhere are not policy-blocked. Fix is a policy decision (expand patterns
   vs enforce soft-delete everywhere) — operator call.
4. ~~**HIGH — a second, non-persistent audit logger
   (`services/audit/auditLogger.ts`):**~~ ✅ **FIXED.** `logAuditEvent` (and
   `logDataChange` / `logSecurityEvent` / `logExport` / the `AuditLogger` class)
   pushed only to an **in-memory array** (`auditStore`, "replace with database in
   production"), so ~28 call sites (incl. routes `se-matrix`, `defense-packet`)
   recorded audit events that were lost on restart and were neither queryable nor
   tamper-evident — while the class docstring falsely claimed a "single signed,
   21 CFR Part 11-compliant pipeline." **`logAuditEvent` now forwards every event
   through the canonical `auditService`** (`audit_logs` Drizzle table +
   tamper-proof hash-chain log); the array is retained only as a bounded in-memory
   **query cache**, no longer the system of record. The forward is best-effort
   (wrapped in try/catch — an audit-store outage logs but never breaks the user
   action it records) and the misleading docstring was corrected. Contract test
   `auditlogger-persistence.contract.test.ts` (5 tests, no DB) locks the
   forwarding, the field mapping (category-prefixed action, resourceType→category
   fallback, previous/new-value carry), the class delegate, and the
   never-breaks-the-caller guarantee. This is the **first concrete step of the
   audit-store consolidation** recommendation — one more fragmented store now
   drains into a persistent canonical one.

**Durable guard — added (static, no DB needed):**
`scripts/ci/check-regulated-delete-audit.mjs` (wired into CI Lint) fails if a
DELETE on a regulated table (`coauthor_documents`, `c2c_document_*`,
`authoring_documents`, `ind_applications`) has no audit call nearby. Two sites
the swarm missed were found by this gate's scan: `coauthor.ts:237`
(`coauthor_documents`) and — notably — `ind.ts:266` (`ind_applications`), a
hard-delete of a regulated **IND/FDA submission record** with no audit at all.

✅ **100% regulated-delete audit coverage reached — the allow-list is now empty.**
Every regulated-table delete the gate scans (`ind_applications`,
`coauthor_documents` ×2 routers, the `c2c_documents` family, `authoring_documents`)
is positively audited, not merely allow-listed. The gate is therefore a pure
positive-coverage guard: any new unaudited regulated delete is a hard CI failure.
The gate's audit-signal regex was also **hardened** to require an actual call
(`fn(` / `auditService.` method dot / `INSERT INTO audit_events`) rather than a
bare word — verified by a negative test: commenting-out or renaming the real
audit call now flags the delete (previously a comment mention could mask the gap).

### ✅ Fixed — IND application delete now audited (architecture call made)

`ind.ts` DELETE `/applications/:id` now deletes the IND record **and** writes an
`ind_application.deleted` row to the hash-chained, append-only `audit_events`
table **in the same transaction** (atomic, fail-closed — an audit failure rolls
the delete back). Contract test
`ind-application-delete-audit.contract.test.ts` (3 tests, no DB) locks the
order, the rollback-on-audit-failure, and the non-draft guard.

**Same pattern applied across every regulated-delete handler.** Following the
IND fix, the audit-in-transaction pattern was carried to the remaining regulated
deletes: `coauthor_documents` (both `ectd-documents.ts` and `coauthor.ts` — raw
`DELETE … RETURNING` + `INSERT INTO audit_events` in one `transaction()`,
fail-closed), the `c2c_documents` family (delete / transition / evidence-link via
`writeMutation` / `recordGovernedAction` inside the existing transaction), and
finally `authoring_documents` (the admin UAT-cleanup delete in
`authoring.router.ts` — `auditService.logAction('authoring_document.deleted')`
before the delete; `auditService` persists to `audit_logs` + the tamper-proof
hash-chain log and is best-effort by design). Each non-trivial handler is locked
by a no-DB contract test (`*-audit-order` / `*-delete-audit` in
`server/__tests__/security/`). The `authoring` UAT path is gate-enforced only:
it is an admin-token-gated, `UAT-`scoped cleanup route (not a tenant-facing
mutation), so a dedicated test against the 900-line multer/jose/pdf-lib router
was not worth its cost — the static gate guarantees the audit call stays present.

**Audit-store choice (the green-lit architecture call):** I used `audit_events`
(public, trigger-computed hash chain + immutability migration) — the most robust
general-purpose store. This surfaced a real **finding: the audit trail is
fragmented** across ≥5 uncoordinated stores — the in-memory `auditLogger` stub
(#4), `audit_events` (public, trigger-chained), `audit.event_log` (the GCC
Part 11 table, UUID entity_id), the `audit_logs` c2c ledger, and
`regulatoryAuditLogs`. There is no single canonical Part 11 trail, which is why
"which audit store" is a genuine architecture decision. **Recommendation:**
consolidate onto one canonical, chained, queryable store and migrate the others
(incl. the in-memory stub) onto it.

**CI note:** a DB-backed integration test for these audit fixes is **not**
runnable in the current CI Integration job — its DB applies only the GCC + RLS
SQL migrations, which do **not** create `ind_applications` / `audit_events`
(those come from the Drizzle schema in `migrations/0000_*`). The mocked contract
tests are therefore the CI-enforced verification; a DB-backed test would run
only against a full-schema database (the operator's environment).
A DB-backed integration test (delete ⇒ matching `audit_logs` row) remains the
complementary runtime check.

---

## 3 · Design-system, accessibility & copy

**Verified clean:** sentence case, no emoji (the `✻` sparkle is the sanctioned
exception), no exclamation/cheerleading, font ramp (13px body / 10px meta /
≤24px title), Lucide-only, second-person copy. Good ARIA on MDX/PDEV shells,
command palette, scope switcher.

- ✅ **Fixed — undefined error token:** `AnaRail.tsx` / `AnaDock.tsx` used
  `var(--c2c-danger, #b3261e)` — but `--c2c-danger` is undefined, so error states
  always rendered a **hardcoded** red instead of the design `--error`. Pointed at
  the canonical `--error` token (4 sites).
- ✅ **Fixed — icon-button a11y:** home TopBar search/notifications/help icon
  buttons had `title` but no `aria-label` (not exposed to SR/mobile — WCAG 2.2
  AA). Added `aria-label` to each.
- ✅ **Fixed — motion (spring):** `auth/ZenSignup.tsx` used a Framer-Motion
  `spring` (overshoot) for the success-checkmark scale-in → replaced with a
  200ms ease-out tween. (Owner directed treating `auth/` as in-scope, not
  legacy.)
- ✅ **New gate — `scripts/ci/check-design-system-compliance.mjs`** (wired into
  CI Lint): hard-fails on non-Lucide icon imports and Framer-Motion spring/bounce
  across the **whole** `concept2cure/` surface (both at zero now → pure
  regression guard).
- ⏭ **Deferred to designer — hardcoded hex:** ~500 hex literals across the
  surface CSS mix legitimate token *definitions* with inline *values* that should
  be tokens (e.g. PDEV status pills `#f6e9cf` next to `var(--warning)`). Proper
  fix is tokenization — a design decision with visual-regression risk, not a bulk
  find/replace. The `check-token-cascade.mjs` gate already covers the `var()`
  side. **Note:** that gate currently reports 12 unresolved vars and is **not
  wired into CI** — recommend fixing the 12 and adding it as a guardrail.
- ⏭ **Deferred to designer — motion:** `concept2cure-home` readiness *fill*
  animates `width` at 600ms (vs the 200ms rule). Arguably a deliberate progress
  animation; a designer call, not an obvious bug.

---

## Durable gates — added / recommended

| Gate | Status |
|---|---|
| `check-design-system-compliance.mjs` (Lucide-only, no spring/bounce) | ✅ added + wired to CI |
| `check-regulated-delete-audit.mjs` (Part 11: regulated delete ⇒ audit) | ✅ added + wired to CI |
| `check-token-cascade.mjs` (var() resolves to tokens) | exists; **recommend** fixing its 12 findings and wiring to CI |
| Regulated-table mutation→audit coverage test | recommended (needs DB) |
| `@typescript-eslint/no-floating-promises` (baseline-gated) | recommended — real gap in this async-heavy server; surfaces a large baseline, so introduce baselined, not big-bang |

## Open items for the owner (prioritized)
1. Part 11 — **audit-store consolidation** (the architecture recommendation):
   collapse the ≥5 fragmented stores onto one canonical chained, queryable trail
   and migrate the in-memory `auditLogger` stub (#4) off its lossy array. *Highest
   — needs DB/schema + a migration plan.*
2. Part 11 — `coauthor_documents` **soft-delete** migration. Deletes are now
   audited (✅ done), but a soft-delete (tombstone) would preserve the record
   itself, not just the audit row — the stronger Part 11 posture.
3. Part 11 #3 — immutability-policy scope decision.
4. Design — tokenize the hardcoded-hex surface; fix + wire the token-cascade gate.
5. Correctness — project-settings atomic update; statistics error-shape.

*(Resolved since first draft: every regulated-delete handler is now positively
audited — IND, `coauthor_documents` ×2, the `c2c_documents` family, and
`authoring_documents` — and the gate allow-list is empty.)*
