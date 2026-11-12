# P-122 §3.5: the project-management reads are admitted to production (Plan: R1)

## What already exists (Rule 3)

- The mechanism is the launch-scope verdict (`server/services/entitlements/launch-scope-api.ts`), run by the
  entitlement gate (`server/middleware/moduleEntitlementGate.ts`) on every `/api` request. A path is served when a
  launch surface claims it in `UI_SURFACES[].apiPrefixes` (`shared/constants/ui-surface-registry.ts`, longest prefix
  wins). Nothing else refused these routes: every router below is mounted in production.
- `/api/project-sections` (`server/routes/project-sections.ts`): claimed only by `regulatory-workspace`, outside the
  catalog, so **out-of-scope** (403). Its project admission (`admitNamedProject`) already existed (F1, 2026-11-05).
- `/api/sentinel` (`server/routes/sentinel-routes.ts`): claimed by nothing, so **unmapped** (403 in production).
  Its reads were organization-scoped only: every member read every project's findings.
- `/api/submission-ops` (`server/routes/submission-ops.ts`): `/packages*` and `/artifact-section-map` are claimed;
  the rest is **unmapped**. `/blockers` and `/due-soon` were organization-scoped only.
- `/api/concept2cure/projects/:id/tasks` (`server/routes/c2c/tasks.ts`) and `/api/project-hierarchy` were already
  **launch** (project-home). `/api/concept2cure/submission-milestones` was **unmapped**. The hierarchy's `tree` and
  `rollup` answered for any project of the organization, a private one included.
- Not admitted, not needed by these screens: `/api/pm-settings`, `/api/project-home/:id`, `/api/unified-tasks`,
  `/api/sentinel/status|scan|config`, `/api/submission-ops/workload|approval-bottlenecks|command-center|hotspots`.

## The change

| Path (claimed exactly) | Surface | Access check it is served behind |
|---|---|---|
| `/api/project-sections/summary`, `/timeline` | project-home | the project sharing policy before any read (existing); no section route answers to a route word, so `/timeline/comments` cannot write |
| `/api/concept2cure/submission-milestones` | project-home | a static catalogue, the same for every organization |
| `/api/sentinel/findings` | projects | **new**: lists a finding only when its project and every project it names are ones the person can open; the PATCH under it refuses one they cannot |
| `/api/submission-ops/blockers`, `/due-soon` | projects | **new**: only the projects the person can open; a named private project is 404; the blocker PATCH under it keeps its editor gate and refuses a project the person cannot open |
| `/api/project-hierarchy/:id/tree`, `/rollup` (already served) | project-home | **new**: the project is admitted by the sharing policy first |

## Proof (`tests/db/p122-project-management-reads.dbtest.ts`)

Real PostgreSQL, app_service, `RLS_ENFORCE=on` (asserted), the production auth boundary and the gate as production
builds it (launch scope on, unclaimed refused). Two organizations; in A an open project and a private one.

- `admission-red.txt`: HEAD's sources. 9 of 15 fail: every admitted read is 403 `LAUNCH_SCOPE`.
- `admission-red-claim-only.txt`: the registry claim without the route checks. 6 of 15 fail, and they are the reason
  the checks exist: a colleague not on the private project read its Sentinel finding, a cross-project finding naming
  it, its blocker and its due work; changed its finding (200); read its roll-up; and `POST
  /api/project-sections/timeline/comments` wrote a comment (200).
- `admission-green.txt`: 15 of 15 pass.
- `unit-suites.txt`: the narrowing, resolver, gate and listing-doors suites. The two failures are
  `launch-scope-api-gate`'s real-registry cases refusing `/api/cmc-changes`, called by another session's uncommitted
  `CmcVariationAssessment.tsx` in the shared working tree (HEAD has no client caller of it). Neither file is in this
  commit; `ci:launch-scope-api` passed on this change before that edit appeared (639 paths, none refused).

## Found, not fixed here

- `project_milestones.project_id` references `cer_projects`, not `projects` (`shared/schema.ts` projectMilestones,
  `migrations/0000_sweet_joseph.sql`). So `POST /api/project-sections/milestones` cannot record a milestone on a
  project, and the timeline lists none on any project. Fixing it is a schema change (Rule 1), not a reach.
- `GET /api/project-hierarchy/:id/tree|rollup` writes each node's roll-up into `projects.metadata` as a side effect,
  and its `worstRiskLevel` reads 'medium' where no risk is recorded.
