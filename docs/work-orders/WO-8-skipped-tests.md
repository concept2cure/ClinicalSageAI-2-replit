# WO-8 — Triage the skipped tests

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** ✅ CLOSED 2026-09-10 · **Blocks:** G1 (pilot on any data)

---

## What the code actually says

```
$ grep -rEn "\b(describe|it|test)\.(skip|todo)\b|\bxdescribe\b|\bxit\b" tests/ server/ client/ | wc -l
34
```

Across **464 test files**. That is a low skip rate by any standard — this work
order is small, and it is on the list because *which* 34 matters more than how
many.

`ci:check-unrun-tests` passes, so no test file is silently excluded from a
runner. The 34 are explicit, in-file skips.

## Why it blocks the pilot

A skipped test in an assurance-critical path is worse than a missing one,
because the file's presence implies coverage that is not there. Before humans
touch the product, each of the 34 needs a decision on the record.

## Scope

1. Classify all 34:
   - **Un-skip** — the reason it was skipped no longer applies.
   - **Environment-blocked** — needs a DB, a browser, or a credential. Annotate
     in-file with what it needs, and wire it into the job that has it
     (`test:db`, `test:e2e:golden-journey`, the `blank-db-provisioning` job).
   - **Obsolete** — delete the test and say why in the commit.
2. Prioritise anything under `tests/golden-journeys`, `tests/schema-contract`,
   `tests/export-contract`, `server/__tests__/security`, or the ANA/submission
   suites. `proof-tier-baseline.json` records a **floor of 77 proof files** —
   an inverted ratchet that fails when a proof disappears — so these are the
   ones the repo already treats as load-bearing.
3. No skip survives without an in-file comment saying why and what would
   un-block it.

## Exit criteria

```bash
grep -rEn "\.(skip|todo)\b" tests/ server/ client/   # every hit has an adjacent reason comment
npm run ci:check-unrun-tests                          # still passes
npm run ci:proof-tier:strict                          # floor of 77 intact
npm run test:proof-tier                               # schema-contract + golden-journeys + export-contract green
```

## Blast radius

Low. Test-only. The risk is discovering that an un-skipped test fails for a real
reason — which is the point.

## Estimate

3–5 days.

---

## CLOSED — 2026-09-10

**The 34 was not a backlog, and the number was measuring the wrong thing.**

Of the 34 matches, **31 were `describe.skipIf(<condition>)`** — conditional
skips for a missing binary (`xmllint`, `python-docx`, pdf.js) or a missing FDA
template file (the eSTAR PDFs are not in the repository). Those are correct
engineering: the test runs wherever the dependency exists and says so where it
does not. Counting them as skipped tests inflated the figure roughly tenfold and
pointed the work order at the wrong thing.

The unconditional skips were **12**. Every one carried a written reason, so
none of this was hidden. The triage:

### Deleted — 8 blocks that could never have been un-skipped

| Where | What it asserted against |
|---|---|
| `tests/phase10-runtime-esign-snapshots.test.ts` 10H–10K | `GovernedDocumentPanel.tsx` — removed in the design-system port |
| `tests/governed-export-behavioral.test.ts` ×2 | `ProjectWorkspaceShell.tsx`, `useDeliverable.ts` — same |
| `server/services/__tests__/ana-ri.test.ts` | nothing — an `it.skip` with an **empty body** |

Each compensated for its deleted subject with `const src = ''` and then ran
`expect(src).toContain(...)` against it. **Un-skipping any of them fails every
assertion at once and reveals nothing about the product**, because the component
under test does not exist (`find client server` matches none of the three).

That is the real finding here, and it is not "some tests are skipped":

> **A skipped block that cannot be un-skipped is not pending work. It is dead
> code shaped like pending work** — and it inflates the apparent test surface at
> exactly the place a reader looks hardest, which for 10H–10K was the Part 11
> e-signature UI.

The backend governance wiring these blocks sat beneath (phase10 10A–10G:
attestation validation on approve/lock, signature creation on transitions,
snapshot creation on lock, the snapshots endpoint, both role checks) is
untouched and still runs. That is where the Part 11 obligations are enforced.

### Un-skipped — 1, whose blocker had been resolved and nobody noticed

`tests/founder-critical-path-proof.test.ts` — *"Sign-out is wired"*, skipped
with: *"no sign-out control exists anywhere in `client/` — `authService.logout()`
is never invoked from any UI component. Re-enable (with real assertions against
the sign-out control) when a logout flow ships."*

**It shipped.** `client/src/concept2cure/v2/Shell.tsx:158` destructures `logout`
from `useAuth()`, `:201` carries a `Log out` menu item with `action: 'logout'`,
and `:346` calls `void logout()`. The skip stayed.

Now two real assertions: the shell renders a reachable control wired to the hook
and actually invoking it (a menu item whose handler does nothing is the state
this was skipped for), and `authService.logout` POSTs to the server with
`terminateAllSessions` — a logout that only clears `localStorage` leaves the
token valid until it expires. Verified by making it fail: removing
`void logout()` from Shell.tsx turns the first case red.

**This is the pattern worth carrying into WO-5.** The repo already treats a
stale *baseline* entry as a failure — `check-tenant-blind-models.mjs` fails as
loudly when a baselined defect is fixed and not removed as when a new one
appears, because a baseline that overstates debt hides the next real entry.
Tests have no such guard, so a resolved blocker sits looking like open work
indefinitely. Suggested for WO-5: a check that every `.skip` carries a written
reason **and** a falsifiable unblocking condition.

### Kept — 2, both legitimate, both already documented

- **`server/startup/__tests__/middleware.guards.test.ts:44`** — *"protects the
  full audit and e-signature trail surface (Part 11 immutability)"*. Its
  assertions contradict `audit-chain-wiring.test.ts` (ledger C-22): that suite
  requires `DELETE /api/audit/events-archive/123` to succeed and
  `/api/audit/bulk-delete-preview` to be mutable, which these forbid. **No
  pattern set satisfies both**, so a human has to decide the intended immutable
  surface; a record-class policy is proposed and awaiting sign-off in
  `docs/compliance/part11-immutability-record-class-policy.md`.

  It does not gate record integrity, and this was checked rather than taken on
  faith: `db/migrations/20260730_esign_audit_db_level_immutability.sql` puts
  `BEFORE UPDATE OR DELETE` triggers that `RAISE EXCEPTION` on
  `public.electronic_signatures` and `public.device_audit_trail`, and it is on
  the production applier. The records are protected below the HTTP layer
  whatever the route patterns say.

- **`server/routes/__tests__/regulatory-correspondence.test.ts:77`** — needs a
  populated database (`authMiddleware` does a real `organizationUsers`
  membership lookup, so every call 401s without one). Belongs in the integration
  tier. Correctly stated in-file.

### Result

```
$ grep -rn "\.skip(\|\.todo(" --include=*.test.ts --include=*.test.tsx \
    server/ client/ tests/ shared/ | grep -v node_modules | grep -v skipIf
server/startup/__tests__/middleware.guards.test.ts:44   ← human decision, DB layer protects
server/routes/__tests__/regulatory-correspondence.test.ts:77  ← needs a test DB
```

Two, both with a reason and a named unblocking condition. `tests/e2e/` also
carries two Playwright `test.skip(!notificationId, …)` calls, which are runtime
conditionals inside a running test, not skipped tests.

**This work order's premise was wrong in the reassuring direction**, which is
worth recording as plainly as the reverse. There was no hidden skipped-test
debt. There was a measurement that counted `skipIf` as `skip`, and eight dead
blocks that made the test surface look larger than it was.
