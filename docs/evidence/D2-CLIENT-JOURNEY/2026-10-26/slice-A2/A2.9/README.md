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

## Pre-merge continuation verification

The following results qualify the continuation before reconciling concurrent
A2.9 work through `a0d4ada6f`. Its independent qualification is preserved intact
in `pre-merge-a0d4ada6f/`. The source hashes and counts in each snapshot belong
to that snapshot. Final combined qualification is recorded separately below.

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

## Concurrent Account integration

Concurrent actor-owned Account invitation/reporting work through `5c24914f0`
was merged as `e33b7fe3d`. It uses the existing recipient/reporting APIs and does
not call a retired creator. The A2.9 qualified source/test/gate hashes remain
unchanged. Seven targeted Account/creation-door/action/AnA-control/owner-contract
suites pass **97 tests** (16.80 seconds); these overlap earlier proof and are not
added to 307. The combined production client/server/audit-verifier build passes
(frontend **20.68 seconds**). Results are `account-integration.log.gz` and
`account-build.log.gz`. Normal publication gates, including full TypeScript and
the no-new-warning check, still apply to the final combined tree.

## Concurrent A2.9 reconciliation

The first normal push passed every gate, including full TypeScript with zero
errors and a net reduction of 12 lint warnings, then met concurrent A2.9 work
on the remote (`gates-ref-race.log.gz`). No forced push or bypass was used.
Both versions retire the same 12 HTTP creators and retain the same canonical
intake. Their useful assertions and source guards are reconciled onto one
canonical checker, with independent pre-merge evidence preserved. The duplicate
incoming detector is removed after carrying its assertions into the shared owner.

The incoming removal of now-uncalled CTD/journey creation helpers is retained:
no production caller remains, readers/records/stores stay, and the existing SQL
interpolation allowance is narrowed from two to one. This extends the dead-writer
cleanup; it does not retire a table or the remaining journey shell. The earlier
continuation's retained-service statements describe its pre-merge choice.

## Final combined qualification

The combined selection passes **523 tests in 33 suites**, partitioned without
overlap by file: 161 server cases/16 files (`merged/server.log.gz`), 39 contract
cases/one file (`merged/contract.log.gz`), and 323 canonical/client/service/Account
cases/16 files (`merged/remaining.log.gz`). The exact union is
`merged/test-files.txt`. No test count from an earlier snapshot is added again.

The one checker/allowlist now covers **25 planted writer forms**, exact-one-site
checks, all 12 retired POSTs and 17 retained-route checks. Bracketed ORM methods
and targets were demonstrated red before correction
(`merged/contract-red.log.gz`). CI and pre-push still invoke that same checker.
The 50 retained HTTP bodies and retained CTD/journey service bodies are unchanged
from the continuation source; `merged/retained-server-proof.json` records the
static comparison. The earlier 11-method controller preservation proof remains.

Native PostgreSQL passes **24 cases** on the same non-superuser/NOBYPASSRLS
runtime role with enforcement on (`merged/native-db.log.gz`). It includes the
stale execute confirmation/category matrix and direct AI/compliance settings
writes with their actual same-transaction audit rows. The incoming delta-based
audit assertion respects existing append-only history rather than requiring an
empty historic audit log.

Both Chromium flows pass together in **18.8 seconds**, with release and RLS
enforcement on (`merged/browser.log.gz`). Canonical intake returns 201 and its
accepted anchor, the real dossier read returns 200 with five governed module
rows, and Author is reached. All 12 legacy requests refuse writes and the
canonical portfolio remains unchanged after the probes. Seven return 404; the
three AnA paths and two journey paths return **403 `LAUNCH_SCOPE`** before the
router. The initial imported browser expectation of 404 for every path failed
under normal enforcement (`merged/browser-policy-red.log.gz`); the corrected
test accepts only router 404 or the explicit `LAUNCH_SCOPE` refusal. No release,
auth, role or entitlement guard changed. Router/AST tests independently prove
handler absence, so the policy refusal is not presented as that proof.

Selected results/screenshots are in `merged/`; the canonical Author screenshot
was inspected. No token or trace archive is included. The combined production
client/server/audit-verifier build passes (frontend **23.05 seconds**,
`merged/build.log.gz`). `merged/source-proof.json` pins the merge parents and
qualified source/test/gate hashes. Mandatory final publication gates still apply.

## Further CSR/CRF integration

Concurrent CSR/CRF coverage work through `c89a78956` was merged as `621151183`.
All 38 pinned A2.9/canonical source, test and gate hashes remain unchanged.
Independent source review found no creator, access-scope or guard overlap: CSR
output coverage and CRF safety preservation tighten existing document behavior.
Five affected server suites plus the creator contract and current creation-door
checks pass **141 tests in seven suites** (25.32 seconds); these overlap earlier
proof and are not added to 523. The production client/server/audit-verifier
build passes again (frontend **22.30 seconds**). `merged/editor-*.log.gz` records
these results. Final normal publication gates run on this combined source.
