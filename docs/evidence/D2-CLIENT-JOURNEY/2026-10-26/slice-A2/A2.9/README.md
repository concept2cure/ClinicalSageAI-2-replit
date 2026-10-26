# A2.9 — converge project creation on the core workflow

Launch row D2; branch `concept2cure-v2`; base `1f6a8bf7`.

## What already exists

Checked from `1f6a8bf7`, under launch row D2. This continues the accepted
central-service direction; it does not add a project service or store.

- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns the existing wizard and
  `projects.new-project` action. `server/routes/c2c/projects.ts` is the only
  shipped `regulatory_programs` insert and owns the canonical create, scaffold,
  audit and accepted client/project-anchor flow. `program-project-anchor.ts`
  owns the accompanying `projects` insert. A2.4/A2.8 native flows already reach
  the wizard and recorded device/drug project workflows.
- `concept2cure.ts` still has POST `/projects` and `/projects/:id/duplicate`,
  each inserting only a legacy project. Its GET, update, sharing, artifact and
  governed-work routes are live and retained. The old create schema also
  shapes the retained update schema, so it must not be blindly removed.
- `device-projects.ts` POST `/` inserts a legacy device project;
  `projects-management.ts` POST `/` selects/creates a default client workspace
  then calls `atomicQuotaService`; `project-hierarchy.ts` POST `/:id/children`
  inserts a child project. Their read/update/delete routes have other callers
  and remain. Existing route tests must replace old creation expectations
  with retirement/no-write checks and preserve unrelated safeguards.
- `register-advanced-platform-routes.ts` inline POST `/api/workspace/projects`
  writes IND/510(k)/CER stores, accepts a body client id without membership
  verification and invents default sponsor/phase. Its aggregate GET remains.
- `ana-platform-control.ts` POST `/projects`, `/onboard`, `/execute` reach
  `ana-platform-controller.ts.createProject`, directly or through onboarding/
  dispatch. Only that private creation chain is retired; independent settings,
  module/configuration, usage and controlled write safeguards remain.
- `ctd-onboarding.ts` POST `/projects` calls `createCTDProject` in
  `ctd-ingestion-service.ts`. `program-journey.routes.ts` POST `/` and
  `/:id/stages/:stageId` write the separate journey stores. Their GET readers
  and existing stored rows remain. Service writers must be traced for other
  callers before removing them.
- Global shipped-source SQL/ORM search found nine direct insert sites: one
  canonical program insert; five legacy project inserts to retire; and the
  canonical anchor plus `rules-engine/actions/index.ts` and
  `atomicQuotaService.js`. The latter two are explicitly retained by A2.9's
  pre-existing exception pending their own caller/functional trace. They need
  narrow, reasoned ownership entries, not an unscoped exemption.
- Existing proof includes `projects-create-anchor.pglite.test.ts`,
  `projects-create.test.ts`, `projectCreationDoors.contract.test.ts`, canonical
  client/scoped list tests, device/project-management governance tests,
  `ana-platform-control.test.ts`, journey read/service tests and the native
  creation/plan browser flows. No second creator is needed.
- Deleted-history search over all eight route/registrar paths returned no
  deletion commits. The earlier discovery additionally traces the last legacy
  concept2cure create caller to deleted commit `2895218b8`; the canonical wizard
  is its reachable replacement. All current callers will be checked again.

Retire only the listed uncalled HTTP write handlers and unreachable private
creation helpers after caller review. Preserve readers/stores and separately
retained rule/quota owners. Add a source contract that rejects unowned program/
project insert sites, missing owner reasons or extra inserts at an allowed
owner, with deliberately planted failures. Prove removed endpoints cannot write
and prove canonical creation still yields the program, anchor, scaffold and
audit with accepted scope. Route retirement does not confer support for legacy
specialist stores on the canonical wizard or retire their existing records.

## Qualification

Caller review found no production caller for the twelve retiring HTTP writes.
The sole active client creator is `projectIntakeRequest.ts` from the existing
Projects wizard. Unrelated project readers, sharing, updates, governed artifacts
and existing stores remain. After discovery, the branch fast-forwarded from
`1f6a8bf7` to `a54e5633`, preserving concurrent Account, editor-context and
MDX integration work; none of the retired production paths differed.

The ownership/registration contract failed in **13 intended cases**: one grouped
assertion identified five unapproved project inserts, and twelve assertions
identified the old POST registrations. Ten planted/negative scanner probes
passed. The final contract passes **40 checks**, including seventeen required
retained route registrations and exact nonzero counts/reasons for four insert
owners. Planted raw SQL (quoted/public/case/multiline), ORM alias/member/bracket
inserts and an extra insert inside an allowed owner are rejected. Comments and
unrelated stores cannot create misleading results.

Six actual-router retirement reds showed the secondary endpoints calling their
private writers. The final route tests return 404 without calling those writers;
retained CTD/journey GETs still return recorded data. Private controller creation/
onboarding/dispatch, CTD creation and journey creation/stage-update helpers were
removed only after their caller closure was established. Direct settings,
configuration, module, usage and project-update handlers remain.

Combined regression passed **427/427 tests in 25 files** (60.48 seconds).
Canonical PGlite and route tests retain program/accepted-anchor/scaffold/audit,
rollback, client/workspace membership, role, stated device/class facts, scoped
portfolio, current-access and wizard/action reachability proof. Existing legacy
update/delete governance and device-class withdrawal tests remain. One bootstrap
assertion still expected `/dossier`, retired by the unchanged A2.7 suggested-
actions service; it now pins the current `/protocol` suggestion and the absence
of that retired command. The initial 107-pass/one-stale-expectation log is kept.

Real PostgreSQL audit checks passed **20/20** (2.94 seconds), asserting runtime
`app_service`, `NOSUPERUSER`, `NOBYPASSRLS`, RLS enforcement, admin/connector
refusals and same-transaction chained role/settings/AI/compliance records. Two
new tests initially assumed an empty audit history; they now require exactly
one added row, validate its chain and compare its transaction ID to the changed
organisation. This preserves append-only history. Both red and corrected logs
are retained; production behavior was unchanged by the test correction.

The native Chromium flow passed (21.7 seconds): a fresh synthetic sign-up used
the real Projects wizard and canonical API (201), received an accepted integer
anchor and reached ProjectHome. Authenticated POSTs to all twelve retired paths
returned **404**, including the workspace endpoint carrying an unchecked client
id. The canonical portfolio remained unchanged after those attempts. The local
fixture used the normal provisioned schema and `app_service` with RLS on.
Browser tokens stayed in page context; selected JSON/screenshots contain only
synthetic records and runtime/auth logs are excluded.

Production client, server and audit-verifier build passed (Vite 24.52 seconds).
Scoped ESLint has zero errors and existing warnings only; required no-growth
checks and full TypeScript/publication gates run on the accepted tree as recorded below.
Independent read-only AST review found exactly twelve route deletions across
eight files, no route additions, and byte-identical retained handler/service
method bodies and middleware. The hierarchy move still enforces MAX_DEPTH=3.
Canonical creator/access/sharing/anchor and the two deferred internal writers
are unchanged; no migration or stored table was removed.

## Deliberate boundary and next work

`create_child_project` in the rule engine and `atomicQuotaService.js` remain
explicitly allowed internal owners pending their separate functional/caller
trace. This slice retires the duplicated HTTP write paths and does not claim
all internal project creation has been consolidated. Their source-contract
entries each allow exactly one site with a written reason, so another insert
cannot hide in an allowed file.

No specialist store or route family is deleted. Retained legacy records remain
readable, and an existing record keeps its update/governance controls. This
work does not claim that the canonical wizard writes CTD/journey/IND/510(k)/CER
legacy stores. Its supported project/scaffold flow remains authoritative.
Local development authentication/browser proof is not production authentication
qualification or formal OQ execution/sign-off. A2.10 is next, with every remaining
screen/catalogue fold gated by its per-function parity and recorded decisions.

## Accepted Account integration (base `98987035`, 2026-10-26)

A further fast-forward preserved the independent Account invitation/reporting
request change. It changed one Account component and its tests, with no overlap
in the retired routes/services. The combined Account/intake/ownership selection
passed **99 tests in seven files** (19.8 seconds). The production build passed
again (Vite 21.25 seconds). The 427-test and real database results above retain
their initial base attribution; no affected production handler changed between
those qualifications and this accepted tree.

The stronger final native check passed in **9.5 seconds** after server readiness:
real wizard create 201, accepted anchor, actual dossier scaffold read 200 with
module rows, explicit navigation to Author and visible module completion, then
all twelve retired writes 404 with the canonical portfolio unchanged. Current
selected JSON/screenshots are at this directory's root; the earlier navigation-
only snapshot is under `pre-account/`. A preliminary expanded check waited for
Author content while the project had opened on Plan; the corrected test makes
the person's Author navigation explicit.

The whole repository TypeScript gate passed with **zero errors against the
unchanged zero baseline** (`accepted-typecheck.log.gz`). Its first run caught a
named import from an untyped JS module in a new retirement test; that test now
uses a directly typed hoisted spy. Final scoped lint is clean. Source hashes
identify the checked source; normal publication hooks still check the final
committed tree without bypass or baseline expansion.

The final integration also preserves Account publication receipt `5c24914f`.
That commit changes only Account evidence prose/logs; all checked A2.9 source
hashes remain identical. The implementation is `ce8cae23`; required publication
hooks run on the merged source without changing a type/lint baseline.

The first publication attempt correctly stopped at the SQL ratchet: deleting
the journey writer reduced that file's interpolation count from two to one.
The allowance is narrowed to one in `sql-interpolation-baseline.json`; it is
not expanded. The retained read's existing allowance remains unchanged.
Normal hooks are rerun after this required reduction.
