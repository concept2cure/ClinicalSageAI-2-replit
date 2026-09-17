# WO-3 — Prove tenant isolation on real data

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data — this is the gating item
**Depends on:** WO-1, WO-2

---

## What the code actually says

Five overlapping tranches, all currently green because all are baselined:

| Entries | Baseline | Meaning |
|---:|---|---|
| 190 | `tenant-resolvers` | Modules not on the canonical tenant resolver |
| 151 | `drizzle-tenant-scope` | ORM query sites with no tenant scope |
| **82** | `requestdb-coverage` | **Route files on the shared pool — this is what keeps RLS inert** |
| 10 | `tenant-isolation` | Raw SQL with no tenant predicate (down from 25 in July) |
| 10 | `tenant-entry-points` | Entry points whose tenant entitlement justification drifted |
| 5 | `tenant-blind-models` | Models with no tenant column at all |

## Why the 82 is the number that matters

RLS policies exist. A route file on the shared pool connects as a role that
bypasses them, so for those 82 the second layer of defence is not weak — it is
not engaged. The remaining 10 raw-SQL candidates are the visible tip; the
shared-pool routes are the reason a single missed predicate becomes a
cross-tenant read rather than an empty result.

The July audit (`docs/audit-2026-07/14-readiness-gate-ladder.md`) carved this
out explicitly:

> tenant isolation being single-layer (RLS inert) is **acceptable for a
> non-regulated pilot with a handful of trusted design partners** … It is not
> acceptable for G2.

**That carve-out expires the moment the pilot data is real.** This work order
exists because the stated bar is real customer data.

## Scope

1. Migrate the 82 shared-pool route files onto the request-scoped DB handle so
   RLS is actually engaged. This is the bulk of the work.
2. Close the 10 raw-SQL candidates: add the tenant predicate, or a
   `// tenant-isolation-safe: <reason>` marker at the call site, or an allowlist
   entry with a one-line justification (admin tool / schema migration /
   pre-tenant-resolution auth) — the gate names these three options itself.
3. Give the 5 tenant-blind models a tenant column, or document why they are
   genuinely global.
4. Re-record the 10 drifted tenant entry-point justifications.
5. ~~**Build the live proof.** There is an unmerged branch —
   `codex/add-rls-two-tenant-isolation-proof` — that appears to do exactly this.
   Read it, rebase it onto `concept2cure-v2`, and land it rather than
   rebuilding.~~
   **Corrected 2026-09-10: it already landed.**
   `tests/db/two-tenant-application-rls.dbtest.ts` exists on this branch and
   runs in CI (`.github/workflows/ci.yml:1109`, `npm run test:db`). It is not a
   sketch: it mounts two real route modules, authenticates through the
   production `authenticateToken` middleware with a token signed by
   `activeJwtSecret()`, connects through `requestPgClient` as the real
   non-superuser `app_service` role that install-fresh provisions, seeds two
   organisations (90301 / 90302), and asserts across three domains
   (`projects`, `documents`, `audit_logs`) in three shapes — list/read/existence
   probes, update and delete returning an indistinguishable not-found, and
   `WITH CHECK` refusing a planted row — plus a negative control that the
   pooled session context is reset. Thirteen tests.
   **What this work order still has to build is BREADTH, not the probe.** It
   covers two route modules and three tables. The remaining scope is extending
   the same harness to the rest of the routes that serve regulated data.

## Exit criteria

```bash
npm run ci:tenant-isolation:strict     # exit 0, baseline absent
npm run ci:drizzle-tenant-scope        # baseline 151 -> 0
npm run ci:tenant-blind-models         # exit 0
npm run ci:tenant-entry-points         # exit 0, justifications current
# and the one that actually matters:
npm run test:db                        # incl. two-tenant-application-rls.dbtest.ts
```

The static gates are necessary and not sufficient. **The exit criterion is the
live probe**: seed two organisations, authenticate as A, attempt to read B's
rows through the real route stack, and assert the empty result.

**Corrected 2026-09-10.** This section previously ended "Until that test exists
and runs in CI, isolation is asserted rather than proven." That was wrong on
both halves: the test exists (`tests/db/two-tenant-application-rls.dbtest.ts`)
and it runs in CI (`ci.yml:1109`). The claim was written from the gate baselines
without opening `tests/db/`.

The narrower statement that survives: **isolation is PROVEN for the surface the
probe covers and ASSERTED everywhere else.** The probe mounts two route modules
and exercises three tables. So the exit criterion is not "build a probe" but
"extend this one until the routes that serve regulated data are all inside it",
and the honest interim status is a coverage number, not a yes/no.

Two properties of the existing probe make that extension cheap, and both are
easy to lose:
- it connects as `app_service`, the real `NOSUPERUSER NOBYPASSRLS` role — a
  superuser bypasses RLS unconditionally and an owner bypasses it unless the
  table carries `FORCE`, so a probe on the wrong account passes while proving
  nothing;
- it runs with `RLS_ENFORCE=on` — the canonical policy's first `USING` clause is
  `NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'`,
  so with the variable unset every policy passes everything.

`docs/DB_TEST_HARNESS.md` and `npm run db:provision-test` reproduce that
database locally.

## Blast radius

High and wide — 82 route files. Sequence it after WO-1 and WO-2, because a
migration onto request-scoped handles against an ambiguous schema produces a fix
that cannot be verified.

## Estimate

3–4 weeks after WO-1/WO-2 land.
