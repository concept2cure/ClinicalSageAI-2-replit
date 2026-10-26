# A2.9: retire alternate project creators

Launch row D2; branch `concept2cure-v2`; starting source `a54e56337`.

## What already exists

The searched owner inventory, exact paths and limits are in
`.design/client-journey/A2_9_PROJECT_CREATION_RETIREMENT.md`. Projects' existing
wizard and `POST /api/c2c/projects` already own creation and atomic accepted
project/client anchoring. Alternate PM, device, workspace, CTD, AnA-controller
and journey creation registrations remain; their separate read/update consumers
and stored data must survive. `atomicQuotaService.js` and the rules-engine
`create_child_project` writer are explicitly deferred by the accepted plan.

Searches included SQL/ORM writer sites, routes/services, AnA methods, table
names, current client callers and tests, plus deleted project/Program/controller/
Concept2cure history. Prior consolidation commits include `8b192f1e7`,
`0fc2fc294`, `ecb6d4ea9`, `2895218b8`. Existing canonical creation, intake,
anchor, door and native wizard tests supply the reachable replacement proof;
this slice adds no project service, store, route or grant.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| PM retirement tests on unchanged handlers | 8 intended failures, 33 passes | `pm-red.log.gz` |
| Auxiliary retirement tests on unchanged handlers | 10 intended failures, 23 passes | `aux-red.log.gz` |
| Writer inventory against original production source | Five alternate PM inserts refused; two guard self-checks passed | `writer-red.log.gz` |
| Adversarial cast/parenthesis cases before fixing the guard | New case fails, two contract checks pass | `writer-wrapped-red.log.gz` |
| Final registration detector against original `a54e56337` source, read from Git | All 12 retired registrations reported as failures | `registration-baseline-red.log.gz` |
| Final combined focused regression | **307 tests in 21 suites pass**, 38.03 seconds | `final-regression.log.gz`, `test-files.txt` |
| Real PostgreSQL role/settings/audit checks | **20 pass**, 3.71 seconds; runtime non-superuser/NOBYPASSRLS, enforcement on | `native-settings-audit.log.gz` |
| Native Chromium canonical action → wizard → Create | **1 pass**, 14.4 seconds | `browser.log.gz`, `review-before-create.png`, `create-action-result.json` |
| Production client/server/audit-verifier build | Pass; frontend 21.65 seconds | `build.log.gz` |

The final focused selection includes the four structural contract cases, 94
canonical creation/anchor/regional cases, the retained route/audit suites,
and existing client creation-door/action checks. Smaller worker runs overlap
this selection; their counts are not added to 307. The native DB lane uses
`vitest.db.config.ts`, which rejects mocked PostgreSQL or a placeholder URL.
It proves retained direct settings writes still commit with their audit record,
and a failed audit still refuses the write; retired execute/onboard requests
cannot use those former paths to change settings.

The browser uses a fresh synthetic organization and the real app/runtime role.
Opening intake and repeating the opener preserve typed input and produce zero
project writes. Only the person's final Create sends one canonical request,
returns 201 with the saved PM anchor, and changes the real portfolio from zero
to one. The review screenshot was inspected. No model/provider call or auth
token/trace archive is needed. This native flow proves the reachable canonical
replacement; handler absence is separately qualified by the red/green route
tests and structural registration contract.

## What changed and what remains

Removed exactly 12 enumerated POST registrations: PM create/duplicate, device
create, projects-management create, hierarchy child create, workspace create,
CTD onboarding create, AnA platform create/onboard/execute, and both journey
writes. Three dead creator-reaching controller methods are gone. No router,
table, stored record, commercial grant, entitlement or canonical intake is removed.

Static AST comparison against `a54e56337` confirms **all 50 retained HTTP
registrations and all 11 retained controller method bodies are byte-identical**.
The transfer schema and update-schema fields are unchanged. Details and source
hashes are in `pm-retained-route-proof.json` and `aux-retained-route-proof.json`.
This is source comparison, not a runtime proof by itself; retained guards also
run in the focused SQL/route tests.

The old PM creator's uncalled best-effort blueprint/legacy-IND seeding and
invented greeting are not copied into canonical intake. Their underlying
bootstrap/milestone services and direct tests remain. Active clients already
use current rule-pack scaffolding and the submission/PM spine, the IND/device
Plan and assignment owners, and the actual project conversation composer/list.
The design records this boundary instead of claiming identical background
side effects.

The new `scripts/ci/check-project-creation-owners.mjs` runs from both normal
pre-push and CI. It permits one `regulatory_programs` insert only in canonical
intake, one PM anchor insert in its owner, and the accepted plan's two explicitly
deferred PM writers (`atomicQuotaService.js` and `create_child_project`). Each
exception names its reason and is bounded to one site: a new site, a freed
allowance or an unreasoned exception fails. The self-test rejects 19 planted
SQL/ORM forms, plus three retired-registration forms and invalid allowances;
comments/read-only and retained GET examples pass. Casts, aliases, namespace
targets, static concatenation, SQL comments, uppercase/quoted tables, ONLY and
known interpolated table references are covered. Separate registration scanning
keeps the old workspace writer closed even though it wrote other stores.
This structural contract supplements endpoint authorization rather than replacing it.

Scoped lint reports zero errors and existing warnings only. The full warning
ratchet and zero-baseline TypeScript check remain mandatory publication gates;
no baseline expansion or bypass is used. No schema/data retirement or formal
OQ execution is claimed. A2.7's documented broader MDX policy mismatches/formal
qualification limits are not reclassified by this slice.

Next is A2.10, checking each remaining fold against its function-parity row.
No remaining shell or catalogue identity is retired until its specific carryover
and admission prerequisites are satisfied.
