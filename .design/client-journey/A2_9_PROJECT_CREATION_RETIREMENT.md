# A2.9: retire alternate project creators

Launch row D2, 2026-10-26; canonical branch `concept2cure-v2`. Continues the
accepted IA and `SLICE_A2_PLAN.md` A2.9 from `a54e56337`.

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx`, `programAction.ts` and
  `shared/navigation/surface-actions.ts` own the canonical human-reviewed wizard
  and `projects.new-project` opening action; A2.4 converged live creation doors.
- `server/routes/c2c/projects.ts` owns `POST /api/c2c/projects`, the sole current
  `regulatory_programs` insert, with validated recorded filing/product/market,
  client/actor access, quota and atomic canonical project-anchor creation.
  `server/services/c2c/program-project-anchor.ts` owns that anchor insert.
  Existing `projects-create-anchor.pglite.test.ts`, client intake/creation suites,
  A2.4 door tests and native wizard flows prove the reachable replacement.
- `server/routes/concept2cure.ts` still registers alternate PM project creation
  and duplication; its reads, existing updates/collaboration/transfer/export
  have separate consumers and remain. `device-projects.ts` still registers an
  alternate insert; its reads/update/delete and their safeguards remain.
  The legacy POST's actual bounds extend beyond discovery-time line 1135: it
  also has best-effort registry/legacy-IND section initialization, blueprint
  milestone seeding and an invented assistant greeting in `ai_threads`. Those
  are uncalled creator side effects, not the active client's workflow. Retain
  bootstrap/milestone services and their independent proofs; do not transfer
  the all-IND fallback or auto-greeting into canonical intake. The reachable
  client uses current rule-pack document scaffolding, the submission spine,
  `ProjectPlan.tsx`'s filing catalogue/work packages and assignments, and
  `ProjectHome.tsx`'s actual conversation composer/list. This is a retirement
  of the enumerated unused creator, not a claim that its background side effects
  were identical to the canonical workflow.
- `server/routes/projects-management.ts` POST creates a default workspace and
  delegates to `atomicQuotaService.js`; its GET supports Tasks. The service has
  separate quota tests and is explicitly deferred by the accepted plan.
- `server/routes/project-hierarchy.ts` POST writes child projects. Tree/ancestor/
  child/rollup/flat reads and other existing non-create mutations remain.
  `server/services/rules-engine/actions/index.ts` has a separate
  `create_child_project` writer, explicitly deferred until traced.
- `server/bootstrap/register-advanced-platform-routes.ts` POST
  `/api/workspace/projects` writes alternate IND/510(k)/CER stores, accepting an
  unchecked client id and fabricated defaults. The distinct GET remains.
- `server/routes/ctd-onboarding.ts` POST `/projects` delegates to
  `server/services/ctd-ingestion-service.ts` `createCTDProject`; document upload,
  detection, validation, status and list APIs remain. No store removal is planned.
- `server/routes/ana-platform-control.ts` exposes project creation, automated
  onboarding and arbitrary execution. `server/services/ana-platform-controller.ts`
  contains `createProject`, plus onboarding/execute branches that reach it.
  Existing settings/module/compliance/AI/usage/update paths are distinct owners;
  trace their consumers before removing dead creator calls and related tests.
- `server/routes/program-journey.routes.ts` has two uncalled POSTs alongside the
  GET consumed by `BiopharmaJourney.tsx`. Its service reads/writes separate
  `program_journeys`/`program_journey_stages` stores; A2.10 governs store/shell
  retirement, so data and reads stay in this slice.
- Existing route/service tests cover these older creators and retained writes.
  Migrate creation outcomes to canonical intake and keep retained guard tests;
  do not preserve an obsolete creator just to satisfy its old success test.
- `tests/ci/` and `scripts/ci/` contain established structural source gates;
  no project-creator single-owner gate was found. Extend that testing pattern
  with a source contract for the existing writer owners and explicit deferred
  project inserts, including negative fixtures for planted alternate writers.

Searches: SQL/ORM inserts into `regulatory_programs`/`projects`, project creation
route registrations and delegation, canonical wizard/actions, AnA controller,
CTD/journey service stores, production client callers and route/service tests.
Deleted history: `git log --all --diff-filter=D` over project/Program/controller/
Concept2cure names found prior consolidation/removal, including `8b192f1e7`,
`0fc2fc294`, `ecb6d4ea9`, `2895218b8` and the earlier editor/kit retirements.
The current writer scan finds five unapproved direct PM inserts; the discovery
plan's ten-site count is historical, not a required current count.

## Execution boundary

Retire the enumerated handlers, preserving their routers and unrelated reads or
mutations. Keep stores and entitlements intact; no migration or new creation
service. Trace controller indirections so no alternate creator remains callable.
Fail stale calls without writes. Add a red-first structural contract for the
single canonical program writer and reasoned, count-bounded PM writer exceptions.
Qualify canonical creation and retained reads/writes, production build and normal
publication gates. Record source/history/replacement evidence before deletion.
