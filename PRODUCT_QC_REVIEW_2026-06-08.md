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
1. **CRITICAL — hard-delete without audit, `routes/ectd-documents.ts:~327`:**
   `DELETE` on `coauthor_documents` (regulated eCTD docs) with no audit row and
   no soft-delete (violates §11.10(e)). *This is the known-deferred QA_REPORT
   item #14.* Fix: add `deleted_at` to `coauthor_documents` (migration), switch
   to soft-delete, audit before the write, filter reads on `deleted_at IS NULL`.
2. **CRITICAL — audit after a raw DELETE, `routes/c2c/documents.ts:~560`:** the
   evidence-unlink DELETEs first, then fires a non-awaited `writeMutation`; a
   crash in between loses the audit. Fix: audit **inside** the transaction,
   before the delete (the `c2c/actions` flow is the correct model to mirror).
3. **HIGH — immutability middleware is narrow (`startup/middleware.ts:113`):**
   `IMMUTABLE_ROUTE_PATTERNS` only guards `/api/audit/*`. Regulated-data DELETEs
   elsewhere are not policy-blocked. Fix is a policy decision (expand patterns
   vs enforce soft-delete everywhere) — operator call.

**Recommended durable guard (needs DB, so flagged not built):** an integration
test asserting that for every DELETE/UPDATE on a regulated table there is a
matching `audit_logs` row — extend to `coauthor_documents`, `c2c_document_*`,
submission tables.

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
| `check-token-cascade.mjs` (var() resolves to tokens) | exists; **recommend** fixing its 12 findings and wiring to CI |
| Regulated-table mutation→audit coverage test | recommended (needs DB) |
| `@typescript-eslint/no-floating-promises` (baseline-gated) | recommended — real gap in this async-heavy server; surfaces a large baseline, so introduce baselined, not big-bang |

## Open items for the owner (prioritized)
1. Part 11 #1 — `coauthor_documents` soft-delete + audit (migration). *Highest.*
2. Part 11 #2 — audit-in-transaction for `c2c/documents` evidence delete.
3. Part 11 #3 — immutability-policy scope decision.
4. Design — tokenize the hardcoded-hex surface; fix + wire the token-cascade gate.
5. Correctness — project-settings atomic update; statistics error-shape.
