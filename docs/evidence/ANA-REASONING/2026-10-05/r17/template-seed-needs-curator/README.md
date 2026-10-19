# Rewriting every tenant's regulatory templates needed only a login

Step 3 of task #38. Filed under r17 with the rest of the P-29 round, because it
was found while making the seeder correctable (step 1) and is the gate that step
made safe to add.

## The surface

`POST /api/regulatory-intelligence/templates/seed` was guarded by
`requireAuthedOrgId` alone — any authenticated member of any tenant. It calls
`seedTemplates()`, which is unconditional and global: for every seeded template
it UPDATEs the template row, then deletes that template's section rows and
re-inserts them from source.

`intelligence.document_templates` has no organization column and no RLS policy
(it is platform reference data every tenant reads). So one member of one
customer could re-key the regulatory outlines that every *other* customer's
authored text binds to — the section codes included, which is what
`filingSectionKey` joins on.

This is not a disclosure. It is a cross-tenant **integrity** surface, and the
quietest kind available: after the rewrite both stores are internally
consistent, so no agreement check can report it. `filingAgreesWithEditing`
(P-29.2) compares the editing layer with the filing; it cannot see that the
outline both of them agree about changed underneath.

## The red, before the fix

An organization administrator of tenant 7 — an ordinary customer, no platform
standing — posting to the route with an empty body:

    POST /api/regulatory-intelligence/templates/seed  ->  200
    [template-seeds] Template seeds: inserted=0 updated=20 sections=141
    [regulatory-intelligence-routes] Template seeding by org=7:
        {"inserted":0,"updated":20,"sections":141}

Twenty templates and 141 section rows rewritten, on one ordinary customer's
session. The route's own log line named only the organization, so afterwards
there was no record of which account did it.

Test tally with the gate absent: `3 failed | 3 passed (6)`.

## Why the gate is only safe to add now, and not before

Until 2026-10-18 the boot seeder short-circuited on a row count, so once the
template rows existed a corrected `section_code` in source was never applied by
any deploy. This route was the ONLY path that applied one. A gate added then
would have removed the sole route to a correction — the ordering matters.

`seedTemplatesIfMissing` now compares the store against the seed set and
re-seeds on drift (`server/startup/services.ts` calls it at boot), so the deploy
is the reachable replacement, by path, for an operator's manual refresh. That is
what the refusal points the caller at.

## The standing required

The same one this router already requires to validate an agency requirement:
platform curator (`super_admin` / `platform_admin`, via `holdsPlatformRole`).
Both surfaces ask one question — may this session write reference data every
tenant is served? — so there is **one** constant (`PLATFORM_CURATOR_ROLES`,
renamed from `REQUIREMENT_CURATOR_ROLES`), not two with the same contents that
drift apart.

Deliberately **not** `requirePlatformAdmin`, which also admits `support`: a
support session should read across the platform, not re-key every customer's
regulatory outlines.

The refusal names the standing it wants and the path that does apply a
correction, carries no table or column names, and the log line now names the
curator as well as the organization.

## Verification

Six cases in
`server/routes/__tests__/ri-template-seed-needs-curator-standing.test.ts`.
The store-was-written assertion is behavioural — it watches the statements the
seeder's transaction client is given — so a refusal that arrives *after* the
DELETE+INSERT fails the test rather than passing on its status code.

Nine mutants, all killed (`mutants.txt`):

| Mutant | Killed by |
|---|---|
| M1 gate removed entirely | 3 failed |
| M2 gate runs AFTER the seed | the ordering assertion |
| M3 roles widened with org `admin` | the roles assertion |
| M4 roles widened with `support` | the roles assertion |
| M5 refusal no longer names the deploy | the remedy assertion |
| M6 refusal no longer names the standing | the standing assertion |
| M7 refusal leaks the table name | the no-internals assertion |
| M8 curator probed before the tenant gate | the membership-removed case |
| M9 403 becomes a silent 200 | the status assertion |

**M8 survived the first run** and the fix was to the test, not the product. The
ordering case used an anonymous caller, and `platformCuratorId` returns before
the role lookup when there is no user id at all — so probing it first was
invisible on that input and the assertion's comment claimed more than it
proved. The case now uses a signed-in user whose membership was removed:
authenticated, no organization, so the lookup would fire. M9's first run was an
anchor miss in the mutant script (indentation), not a survivor; it is recorded
as such rather than counted as a kill.

## Left open, deliberately

`seedTemplates()` writes **no audit row** — the only trace is a log line. For a
platform whose Part 11 posture rests on governed writes being attributable, a
rewrite of the outlines authored text binds to should leave a record in the
store, not only in a log. Out of scope for a role gate; recorded as a task.

Still owed before the 510(k) codes themselves change (steps 2 and 4 of #38):
a founder-visible decision about documents already created (their sections keep
the old codes; neither this change nor step 1 touches them), the re-code itself
label-mapped by RA judgment — `fda_pma` and `fda_ind` also appear to carry codes
that reach no CTD node — and the guidance-snapshot hole.
