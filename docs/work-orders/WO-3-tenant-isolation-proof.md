# WO-3 — Prove tenant isolation on real data

**To:** JM Smith · **From:** Claude Code · **Date:** 10 September 2026
**Status:** OPEN · **Blocks:** external pilot on real customer data — this is the gating item
**Depends on:** WO-1, WO-2

---

## ⚠ Status re-derived 2026-09-19 — the central premise is superseded

Run, not trusted, per the README's instruction to re-derive rather than believe
the row. Every number below moved, and one of them changed meaning.

| Tranche | This WO (09-10) | Measured 09-19 |
|---|---:|---:|
| `tenant-resolvers` | 190 | 189 |
| `drizzle-tenant-scope` | 151 | 148 (3 fixed) |
| `requestdb-coverage` — shared pool | 82 | **230 of 258, and reclassified** |
| `tenant-isolation` raw SQL | 10 | 9 |
| `tenant-entry-points` | 10 | 9 |
| `tenant-blind-models` | 5 | 4 |
| `tenant-column-types` | — | OK, all integer |

**"Why the 82 is the number that matters" no longer holds.** This WO says a
shared-pool route "connects as a role that bypasses [RLS], so for those 82 the
second layer of defence is not weak — it is not engaged." That is no longer the
architecture. `scripts/ci/audit-requestdb-coverage.mjs` now reports 230 of 258
route files on the shared pool but classifies them: **228 JWT-boundary
auto-scoped, 2 explicit pre-tenant scope, 0 unclassified.** Protected routes
receive AsyncLocalStorage scope at the global auth boundary and the instrumented
pool applies it automatically, so shared-pool use is no longer synonymous with
RLS being inert. The count went UP because it now measures the whole route
surface; nothing regressed.

The honest remaining statement is the one this WO already reaches for: isolation
is **proven for the surface the live probe covers and asserted everywhere else**,
and the work is breadth — extending
`tests/db/two-tenant-application-rls.dbtest.ts` past its two route modules and
three tables. That is NOT claimed by this session.

### The `app.current_org_id` distribution — the question the vault lane handed over

`server/middleware/__tests__/tenant-scope-org-guc.test.ts` closes with: *"This
says nothing about how OFTEN the uuid is absent — that depends on which mint path
issued the token … Establishing that distribution is the next step, not this
one."* Established here, and the answer is reassuring in one direction and thin in
another.

**Mint-path census — 2 of 8 sites stamp `organizationUuid` into the JWT:**

| Site | |
|---|---|
| `server/services/mfaService.ts:539` | stamps |
| `server/routes/setup.ts:123` | stamps |
| `server/auth.ts:321` — **the primary login** | drops |
| `server/routes/users.ts:810`, `:924` | drops |
| `server/routes/authEnterprise.ts:463`, `:752`, `:861` | drops |

So an ordinarily-logged-in user's token carries no org uuid. **That does not leave
the GUC empty, because the token is not the source.** `authenticateToken`
composes `enforceOrgMembership(req, res, () => establishRequestTenantScope(…))`
at `server/middleware/auth.ts:183`, and `enforceOrgMembership` resolves the uuid
from `organizations.uuid` by LEFT JOIN on every authenticated request. All 68
route files using `authenticateToken` inherit it; only 2 reference
`enforceOrgMembership` directly, which is why it looks unmounted and is not. That
composition is pinned by
`server/middleware/__tests__/auth-establishes-scope.integration.test.ts`.

**The residual hole is the degraded path, and it was pinned by nothing.** When the
LEFT JOIN throws, a membership-only fallback answers — correctly, since
`organization_users` is the sole authority — but `orgUuid` is null, which
`tenantSessionVars` turns into an EMPTY `app.current_org_id` for the whole
request. The module guards against the worst version of this with one `if`
(`if (!enrichmentDegraded) cacheMembership(…)`), because a cached null would
serve numeric-only scoping for the full 60s TTL. Ledger L148 is what the
unguarded shape costs: the flagship authoring journey ran EVERY request degraded
and proved its tenant-isolation steps with the org variable empty.
`server/middleware/__tests__/orgMembership-degraded-enrichment.test.ts` now pins
membership standing, the uuid being absent, the degradation being counted, the
answer not being cached, and the self-heal — verified by deleting the guard and
watching it go red.

**For the vault lane:** the §4.4 order is "prove the GUC, then FORCE". The GUC
carries a real uuid on every authenticated request whose enrichment JOIN
succeeds, independent of mint path — so FORCE is safe with respect to mint paths.
It is NOT safe with respect to the degraded path: while the JOIN is broken, FORCE
empties the vault for that user rather than merely under-scoping them. The
degradation is now counted (`degradedEnrichmentCount()`), so that rate is
measurable before FORCE lands rather than after.

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
