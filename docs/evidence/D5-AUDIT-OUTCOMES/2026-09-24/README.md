# D5 — a saved change whose audit row was not written is reported, not hidden

**Row:** D5, Part 11 evidence (21 CFR Part 11 §11.10(e)). **Lane:** WO-16C,
`…session_01E8btkB8mcLirW4rNvsMNxK` (claimed in `docs/work-orders/README.md` §0).
**Date:** 2026-09-24.

## What was wrong

`auditService.logAction` never rejects when the audit row fails to persist. It
resolves an outcome (`persisted`, `chained`). Since WO-16C, routes that carry
that outcome send it in the response as `auditTrail`, shaped
`{ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message }`, or as the
headers `X-Audit-Row-Persisted` / `X-Audit-Row-Code`.

Two gaps remained, one per layer:

1. **The client never read it.** On 2026-09-24 a `git grep` of `client/src` for
   `AUDIT_ROW_NOT_PERSISTED`, `auditTrail.persisted` and `X-Audit-Row` found
   nothing. The server reported the lost row and the browser discarded it, so a
   user whose change committed without its audit row still saw only "Saved".
   Every earlier server conversion stopped one layer short of the person.
2. **148 sites in 70 files still discarded the outcome on the server**
   (`npm run ci:discarded-audit-write`, baseline on this date).

## What changed

### The client reads the outcome (all converted routes, not only this tranche)

- `client/src/lib/queryClient.ts`: `findUnpersistedAuditRow` is the one reader
  of both wire forms. It matches on the code, not on `persisted` alone, and it
  is bounded and cycle-safe. `probeAuditRowOutcome` runs it on every successful
  non-GET response from `apiRequest` and `apiUpload`. It reads from a `clone()`,
  is not awaited, parses JSON bodies only, and is wrapped so it can never be
  what breaks a write. `apiCall` and `liveMutateOrNull` go through
  `apiRequest`, so they are covered too. It raises
  `c2c:audit-row-not-persisted`.
- `client/src/concept2cure/v2/GlobalMutationErrors.tsx` (mounted once in
  `main.tsx`) renders that event as **"Saved, but the audit trail did not
  record it"**, with the request's `X-Request-Id`. The notice says the change
  WAS saved, because it was: telling the user it failed would be its own false
  record. Retries are de-duplicated and the notice can be dismissed.
- Four launch-path writes call `fetch` directly and now call
  `probeAuditRowOutcome` explicitly: Onboarding's org-name and industry-profile
  writes, Setup's industry profile (`useIndustryProfile`), and the Template
  Library upload-and-save.

### Server sites converted in this tranche (148 → 140)

| Site | Launch path | Carrier |
|---|---|---|
| `routes/organizations-routes.ts` profile + settings | Setup, Onboarding (shell) | `auditTrail` |
| `services/credit-ledger.ts` `setAutoReload` | Billing (shell) | `auditTrail` via `billing-dashboard.ts` |
| `routes/mdx-industry-context.ts` org + project profile | Setup, Onboarding (shell) | `meta.auditTrail` |
| `routes/onboarding-proposals.ts` commit | Onboarding ingest (shell) | `auditTrail` |
| `services/templates/templateStore.ts` create / update / deactivate | **Authoring** — Template Library | `auditTrail` from `routes/c2c/templates.ts`; the AI-action handler adds a warning |
| `services/shadow-review/shadow-review-service.ts` | **Submission Center** — Shadow Review | `auditTrail` on the result, which the route and the AnA tool both answer verbatim |

`services/audit/audit-write-outcome.ts` gains `auditRowOutcomeFrom`. It
factors `recordAuditRow`'s mapping out, so a writer that wraps `logAction`
(`logAuditEvent`) reports through the same code instead of a second copy.

### Proof: each fix shown failing first

Each `*-red.txt` is the fix's own tests run with its implementation files
stashed at the same commit; each `*-green.txt` is the same tests with the fix.

| Fix | Red | Green |
|---|---|---|
| client reader + notice | 9 failed / 1 passed of 10 | 10 / 10 |
| organizations | 4 failed / 12 passed of 16 | 16 / 16 |
| credit auto-reload | 3 failed of 3 | 3 / 3 |
| industry profile | 2 failed of 2 | 2 / 2 |
| onboarding commit | 2 failed / 17 passed of 19 | 19 / 19 |
| templates | 7 failed of 7 | 7 / 7 |
| shadow review | 2 failed / 4 passed of 6 | 6 / 6 |

Regression: every client suite that imports the transport or the notice
(191 files, 1,847 tests) passes with the probe in place. The one "passed"
case in the client red run is the negative case ("a persisted row, and a GET,
raise nothing"), which is vacuously true before the reader exists.

Typecheck: `tsc --noEmit` reports 38 errors, all in `server/mcp/*` and
`server/services/signature/kms-signer.ts` and its test double. They exist
because `@modelcontextprotocol/sdk` and `@aws-sdk/client-kms` are declared in
`package.json` and not installed in this container. None is in a file this
change touches.

## Launch-path measurement

The 2026-09-22 review (`docs/evidence/reviews/2026-09-22/README.md`) left one
first item open: how many discarded sites are on launch-catalog write paths.
Each of the 148 sites was classified by one agent: the route or trigger that
reaches it, its mount chain, its client callers, and the surface that renders
them. A second agent then independently re-derived each classification and
tried to refute it, working hardest on any "not on a launch path" verdict.
*Results are filed below when the last verification batches report.*

<!-- measurement tables are appended when the verification completes -->

## Not done here, and why

- **eCTD compile** (`services/ectd/assemble-from-core.ts` ×2,
  `package-from-core.ts`) and **AnA QMS change control**
  (`services/ana/AnaToolExecutor.ts` ×3) are launch-app paths. Other lanes
  touched those files 8–13 hours ago, so they are left for when those lanes
  are done, not raced.
- **The consistency check** (`truth-engine-service.ts`) is reached from AnA.
  It returns a bare array, and both of its callers (`AnaToolExecutor.ts`,
  `routes/submissions.ts`) are hot.
- **The prompt-injection observation** (`ana-input-guard.ts`) records a
  security event, not a user's change. Its carrier should be an operational
  alert, not a user notice. That is a decision, not a conversion.
- **Onboarding commit, a second defect in the same handler:** if
  `markRunCommitted` throws after the organisation update has committed, the
  user is told "Could not apply those changes" when they were applied. That is
  reported here, not fixed in this tranche.
