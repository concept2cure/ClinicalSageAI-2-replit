# D6: every write under /api/concept2cure/projects admits the project first

**Row:** D6 (tenant isolation: role and project access inside one organization). **Date:** 2026-10-29. **Session:** `session_01T2wooCZu46W7msw4TJuuzr`.

This completes what 11624b268 did for `program-twin.ts` (`docs/evidence/D6-CMC-TWIN-TENANT/2026-10-29/`) for every other router mounted at `/api/concept2cure`, and for the Vault's governed-artifact export, `GET /api/artifacts-center/:artifactId/export`. It uses existing checks only: `projectAdmissionMiddleware` for the project routers, and for the export the read policy its own listing already used. No new check was built.

## The finding

**At head, 22 project-scoped POST/PUT/PATCH/DELETE routes let a caller change a project they may not change. 21 of them are writes; the 22nd is a read-shaped POST. 19 of the 22 wrote rows in this run.** Row-Level Security cannot help here: every case is inside one organization.

| Who | Routes open at head | Of which a row was written in this run |
|---|---|---|
| An approver (who may edit every project) on an **archived** project | 21 | 19 |
| An organization **reviewer** who is not an edit member | 14 | 11 |
| An organization **viewer** | 14 | 13 |
| A project member with **use, not edit,** permission | 12 | 11 |
| A member who is **not on a private project** | 5 (tasks: 4 writes, and the assessment read) | 4 |
| A caller in **another organization** (RLS off) | 0 | 0 |

- **The archived row includes one approval.** At head an approver approved an in-review artifact of the archived project, and a `concept2cure_signatures` row was written. This is the approval pin below. The census's status probe (review → review) is refused by the route's own transition table, so the census alone does not show it.
- **Review acts:** for them, a use member and a reviewer are admitted by design (review mode), so their cases count only where review mode refuses: viewer, private, archived, other org.
- **"Open"** means the request got past every project-access check and into the handler. "Written" means the database reported a changed row. Where a handler wrote and then rolled back (`PUT …/artifacts/:artifactId`, which failed on a table this fixture lacks), the row is counted as attempted, not kept.
- **Where the 22 are:**
  - `tasks.ts`: 4 writes, plus `POST …/tasks/assess`, which read a private project's tasks for a non-member;
  - `artifacts.ts`: 13 writes;
  - `reviews.ts`: 2 writes;
  - `haq-sessions.ts`: 1;
  - `governance-ops.ts`: 1.
- **What their handlers checked:** `verifyProjectAccess` or `authorizedProjectId` (read access only), or nothing at all (tasks), sometimes followed by a role table keyed on the organization role. None of them checked edit permission or archived status.
- **Reads:** of the 52 GETs under `/projects/:projectId` or `/projects/:id`, three answered a member who is not on a private project with its data:
  - `GET …/tasks` and `GET …/tasks/summary` gave its task list and health score;
  - `GET …/collaborators` gave its collaborators' names and emails.
- **Another project's review record through this project's URL:**
  - `GET …/review-threads` and `GET …/review-tasks` loaded the artifact by id and organization only. A member admitted to the open project read the private project's threads and tasks through the open project's URL.
  - `GET …/review-record/export` loaded another project's artifact the same way.
- **The organization gallery:** `GET /api/concept2cure/artifacts` listed the private project's artifact titles to that member. Its join named another organization's project for a mis-keyed row (PF-03).
- **The Vault's governed export:** `GET /api/artifacts-center/:artifactId/export` read the artifact by id and organization alone. A member not on a private project received its artifact's DOCX (200).
- **What already held:** 42 writes refused every case at head.
  - Their routers already mounted `router.param('projectId', projectAdmissionMiddleware())`: conversations, communication-center with the agency-responses routes registered on it, project-knowledge, knowledge-sources and program-twin.
  - Or they admit per route: `projectRecordAdmission` and the pinned sharing admission in `concept2cure.ts`.
  - Or they admit in the service: the schedule of events (`admitHumanSchedule`).
  - The D2 scan (`docs/evidence/D2-ONE-ANA/2026-10-29/vault-artifact-leaf/found/routes-under-the-two-prefixes.tsv`) reported these as "NONE FOUND" because it cannot see `router.param`. It also missed 15 writes outright: the 10 agency-response routes registered on the communication-center router, the 3 sharing routes, and both legal-document routes. Its total was 49 writes; the routers register 64.

## What already exists

| What | Where | What it does / how it was used |
|---|---|---|
| `requireProjectAdmission`, `projectAdmissionMiddleware` | `server/routes/c2c/project-access.ts` | **The canonical check, used for every gate here.** It reads the current membership (`readCsrProjectActor`), finds the project by id, organization and workspace, and applies the sharing policy, which admits a live review assignment. In write mode it also requires a role in `GOVERNED_WRITE_ROLES` and `canEditProject`, and refuses an archived project. Its answers are 404, 403, 409 and 503. **Extended, not replaced:** a third mode (`'review'`, below), plus two options on the middleware: `routes` (a per-route mode) and `projectId` (a URL translation). |
| `router.param('projectId', projectAdmissionMiddleware())` | `conversations.ts:46`, `exports.ts:66` (read mode), `knowledge-sources.ts:59`, `project-knowledge.ts:49`, `communication-center.ts:198` (with its own uuid translation), `program-twin.ts:47` | The mounting pattern, copied as-is into the five routers that lacked it. |
| `projectRecordAdmission` | `server/routes/concept2cure.ts:100` | The main router's per-route wrapper over the same check. Its PUT, PATCH, DELETE, export and transfer routes already used it; `GET …/collaborators` now does too. |
| `requirePinnedProjectAdmission` (`requireProjectAdmission` with an executor) | `project-access.ts`, used by `project-sharing.ts` | The same check on a caller's connection. It has no review variant, and the new mode refuses to run pinned rather than read as a read. |
| `admitHumanSchedule` | `server/services/projects/schedule-of-events/service.ts:80` | The schedule service's own write admission: `GOVERNED_WRITE_ROLES`, not archived, and `canAccessReportProject` with `forWrite`. **It held at head and was not touched.** It is a second implementation of the canonical write check; see Not done. |
| `authorizedProjectId`, `loadProjectArtifact` | `server/routes/c2c/artifact-project-scope.ts` | The artifact routes' read check and their same-project artifact load (PF-17). **Kept.** Its first half, the URL to tracking-record translation through `resolveCmcArtifactProject`, is now `urlProjectId`. The artifacts router's admission and `authorizedProjectId` both call it, so there is one translation rule. |
| `getAccessibleReportProjectIds` | `server/services/report-os/project-access.ts:47` | The canonical "projects this actor may use" set, read by reporting, AnA's source scope and insights. `GET /artifacts` filters by it. |
| `GOVERNED_WRITE_ROLES` | `server/middleware/orgMembership.ts:509` | admin, manager, member, owner and super_admin, widened by P-18 to approver and reviewer. **Review mode uses this set.** It admits every role `reviews.ts` lets comment today (member, reviewer, approver, manager, admin) and refuses viewer and a caller with no role. The legacy `editor`, `author` and `user` names that `reviews.ts`' table also lists are not assignable organization roles (`ASSIGNABLE_ORG_ROLES`). The admission reads the membership's role, not the token's, so they cannot arrive. |
| The status route's ceremony: `refuseArtifactTransition` (its role table), `checkSigningAuthority`, `verifyReauth`, `commitSignedArtifactAct` | `server/services/artifact-approval-act.ts`, `server/services/part11/signing-authority-gate.ts`, `server/routes/c2c/actions.ts`, `server/services/artifact-signed-act.ts` | Who may move an artifact's status and who may sign. **Kept, unchanged, after the gate.** The gate only decides who takes part in review. |
| The Vault listing's read policy: `readCurrentProgramActor` plus `getAccessibleReportProjectIds` and `canAccessReportProject` | `server/routes/artifacts-center-routes.ts` (`GET /`), `server/services/report-os/project-access.ts` | The governed-artifact listing already admitted projects this way; so does the project Vault, through `installProjectRouteAccess`. **The export now admits its artifact's project by the same policy, in read mode,** so an artifact the listing shows can be exported and one it hides cannot. Its review gate (`shouldEnforceExportReviewGate`) and recorded download (`sendAuditedDownload`) are kept. |
| The program-twin suite and its harness | `server/routes/c2c/__tests__/program-twin-project-access.pglite.test.ts` | The model for the new suite: PGlite, `drizzle-kit` tables from `shared/schema`, the production `instrumentPool` and `establishRequestTenantScope`. |

**Searches run:**
- the route census itself (`registerConcept2CureRoutes`, read from the routers' stacks: 118 routes under `/projects`, of which 64 are writes);
- `router.param|projectAdmissionMiddleware|requireProjectAdmission|projectRecordAdmission|installProjectRouteAccess` across `server/routes`;
- callers of each changed route under `client/src`. No write this change gates has a client caller; one fixture comment names the status route. Of the reads it now admits, `GET …/artifacts`, `…/versions`, `…/audit-report`, `…/team` and `…/review-record/export` have callers. They pass a program uuid or an integer, and both are still admitted;
- `getAccessibleReportProjectIds|canAccessReportProject` for the canonical list filter;
- `git log --all --diff-filter=D -- '*project-access*' '*write-gate*' '*admission*'`: nothing deleted;
- for the export: `artifacts-center` across `server/` and `client/src`. The Vault's governed-artifact leaf (`client/src/concept2cure/v2/surfaces/VaultGovernedArtifacts.tsx`) is its caller.

## How it was established: by running it

`server/routes/c2c/__tests__/project-write-gates.pglite.test.ts`, 691 tests. Its organization, route table and verdict vocabulary are in `support/project-write-gates-fixture.ts`.

- **The routers:** mounted by calling `registerConcept2CureRoutes` itself, so the order and the set are production's.
  - The census test lists every registered write under `/projects` and requires each to carry a verdict in the file. A new write fails it until someone states its mode.
  - The read census runs every GET under `/projects/:projectId` and `/projects/:id`.
- **The database:** PGlite, a real PostgreSQL, holding every public table and enum `shared/schema` declares, created by `drizzle-kit`. 438 tables are created; tables on pgvector types, and one of each pair of clashing index names, are absent.
  - Four migrations from the deploy set are applied from disk, in the set's order: `20260527_mutation_primitives`, `20260609_audit_hmac_seal`, `20260921_audit_logs_chain_seq` and `db/migrations/20260730_c2c_ana_actions_command_vocab`. They give `audit_logs` the tamper-evident chain and `c2c_ana_actions` its vocabulary, which a signed act writes.
  - The Vault export router is mounted at `/api/artifacts-center`, as `register-regulatory-routes` mounts it.
  - Tables only a migration creates are absent too: the communication center's and `document_span_lineage`. So some owner controls get the handler's own 503, 500 or 400 once past the gate.
  - The owner control therefore asserts that the owner is admitted: not refused by project access, and no `PROJECT_ACCESS_UNAVAILABLE`. It does not assert that every handler succeeds.
- **"Wrote":** the rows the database itself reported changed, tracked through BEGIN, COMMIT and ROLLBACK.
- **Stubbed:** authentication, the rate limiter and the tenant-context middleware are pass-throughs, and the request carries a verified session's identity. `establishRequestTenantScope` and its lazy request client are real.
- **`RLS_ENFORCE=off` throughout:**
  - inside one organization RLS decides nothing (11624b268's negative control);
  - off is the database that passes another organization's row, so a cross-organization refusal here is the application's.
- **Who asks:**
  - Organization A has an owner who is an org member and owns projects 401, 402 (private) and 403 (archived);
  - a viewer;
  - a colleague who is a `use` member of 401 only;
  - a reviewer with a live assignment on 401's and 402's artifacts and no membership;
  - an approver, used for the archived case so that only the archived status can refuse;
  - organization B has project 501.

**Every request's answer** is recorded, one line per request, in `verdicts-head.tsv` and `verdicts-after.tsv`: method, path, case, status, code, message, rows kept, rows attempted. The tables below are drawn from them.

**Mode per write:**
- **write:** refuses everyone but the owner;
- **review** (six acts: a thread, a review task, the status change, a comment, its resolution, a review decision): refuses the viewer, a non-member of the private project, the archived project and the other organization. It admits the use member, the reviewer and the owner;
- **read:** refuses the non-member of the private project and the other organization.

### The routes that changed (head → after)

Legend:
- WPD `PROJECT_WRITE_PERMISSION_DENIED`; NF `PROJECT_NOT_FOUND`; ARCH `PROJECT_ARCHIVED`;
- `h-NF` the handler's own "Project not found" with no code; `h-role` the handler's role table; `h` the handler's own answer (validation, a missing row, a failed transition);
- **bold**, the request was admitted. "wrote" means the database changed a row.
- One cell holds both states when the head answer equals the after answer.

| Route | Viewer | Use member | Reviewer, no edit | Not on private | Archived (approver) | Other org | Owner |
|---|---|---|---|---|---|---|---|
| `POST …/:projectId/artifacts/:artifactId/review-threads` | 403 h-role → 403 WPD | **200 wrote** | **200 wrote** | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/artifacts/:artifactId/review-tasks` | 403 h-role → 403 WPD | **200 wrote** | **200 wrote** | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/tasks` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `PUT …/:projectId/tasks/:taskId` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 404 NF | **200 wrote** → 409 ARCH | 404 h → 404 NF | **200 wrote** |
| `DELETE …/:projectId/tasks/:taskId` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 404 NF | **200 wrote** → 409 ARCH | 404 h → 404 NF | **200 wrote** |
| `POST …/:projectId/tasks/bulk` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/tasks/assess` | **200** | **200** | **200** | **200** → 404 NF | **200** | 404 h-NF → 404 NF | **200** |
| `POST …/:projectId/artifacts` | **201 wrote** → 403 WPD | **201 wrote** → 403 WPD | **201 wrote** → 403 WPD | 404 h-NF → 404 NF | **201 wrote** → 409 ARCH | 404 h-NF → 404 NF | **201 wrote** |
| `PUT …/:projectId/artifacts/:artifactId` | **500 wrote, rolled back** → 403 WPD | **500 wrote, rolled back** → 403 WPD | **500 wrote, rolled back** → 403 WPD | 404 h-NF → 404 NF | **500 wrote, rolled back** → 409 ARCH | 404 h-NF → 404 NF | **500 wrote, rolled back** |
| `PUT …/:projectId/artifacts/:artifactId/placement` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/artifacts/:artifactId/audit-report/export` | **201 wrote** → 403 WPD | **201 wrote** → 403 WPD | **201 wrote** → 403 WPD | 404 h-NF → 404 NF | **201 wrote** → 409 ARCH | 404 h-NF → 404 NF | **201 wrote** |
| `PUT …/:projectId/artifacts/:artifactId/status` | 403 h-role → 403 WPD | **200 wrote** | **200 wrote** | 404 h-NF → 404 NF | 403 h-role → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `PUT …/:projectId/artifacts/:artifactId/ctd-section` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/artifacts/:artifactId/rollback` | 403 h-role → 403 WPD | 403 h-role → 403 WPD | 400 h → 403 WPD | 404 h-NF → 404 NF | 400 h → 409 ARCH | 404 h-NF → 404 NF | 403 h-role |
| `POST …/:projectId/artifacts/:artifactId/comments` | **200 wrote** → 403 WPD | **200 wrote** | **200 wrote** | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `PUT …/:projectId/artifacts/:artifactId/comments/:commentId/resolve` | **200 wrote** → 403 WPD | **200 wrote** | **200 wrote** | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/artifacts/:artifactId/reviewers` | 403 h-role → 403 WPD | 403 h-role → 403 WPD | 400 h → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | 403 h-role |
| `DELETE …/:projectId/artifacts/:artifactId/reviewers/:assignmentId` | 403 h-role → 403 WPD | 403 h-role → 403 WPD | 403 h-role → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | 403 h-role |
| `POST …/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/artifacts/:artifactId/reviews/submit` | 403 h-role → 403 WPD | 403 h-role | 400 h | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | 403 h-role |
| `PUT …/:projectId/haq-session` | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | **200 wrote** → 403 WPD | 404 h-NF → 404 NF | **200 wrote** → 409 ARCH | 404 h-NF → 404 NF | **200 wrote** |
| `POST …/:projectId/governance/decisions/:decisionId/transition` | 500 h → 403 WPD | 500 h → 403 WPD | 500 h → 403 WPD | 404 h-NF → 404 NF | 500 h → 409 ARCH | 404 h-NF → 404 NF | 500 h |

### The routes that held at head, unchanged

PD `PROJECT_PERMISSION_DENIED` (pinned sharing admission); WAD `PROJECT_WRITE_ACCESS_DENIED` and NA `PROJECT_NOT_ACTIVE` (the schedule service). The other abbreviations are as above.
- An owner cell of `503 h`, `500 h` or `400 h` is the handler's own answer once past the gate. These are tables this fixture lacks (communication center) or probe bodies the handler rejects; none is `PROJECT_ACCESS_UNAVAILABLE`.
- The three read-mode POSTs (`submission-package`, `…/:id/export`, `tasks/assess`) write only their export's audit record, if anything.

| Route | Viewer | Use member | Reviewer, no edit | Not on private | Archived (approver) | Other org | Owner |
|---|---|---|---|---|---|---|---|
| `POST …/:projectId/submission-center/items` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `PATCH …/:projectId/submission-center/items/:itemId/status` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `POST …/:projectId/authority-profiles` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `POST …/:projectId/agency-communications` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `PATCH …/:projectId/agency-communications/:eventId/advance` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `POST …/:projectId/agency-communications/:recordId/legal-documents` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 500 h |
| `POST …/:projectId/submission-center/items/:recordId/legal-documents` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 500 h |
| `POST …/:projectId/agency-communications/:eventId/questions` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `PATCH …/:projectId/agency-communications/:eventId/questions/:questionId` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `PUT …/:projectId/agency-communications/:eventId/questions/:questionId/response` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/agency-communications/:eventId/questions/:questionId/withdraw` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/agency-communications/:eventId/no-response-required` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/agency-communications/:eventId/questions/:questionId/approve` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/agency-communications/:eventId/questions/:questionId/commitments` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/commitments/:commitmentId/fulfill` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `PATCH …/:projectId/agency-communications/:eventId/questions/:questionId/owner` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:projectId/agency-communications/:eventId/response-package` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 500 h |
| `POST …/:projectId/publishops/services` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `PATCH …/:projectId/publishops/services/:serviceId/status` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 503 h |
| `POST …/:projectId/conversations` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **201 wrote** |
| `POST …/:projectId/conversations/:conversationId/messages` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `PATCH …/:projectId/conversations/:conversationId` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 404 h |
| `DELETE …/:projectId/conversations/:conversationId` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 404 h |
| `POST …/:projectId/submission-package` | **200 wrote** | **200 wrote** | **200 wrote** | 404 NF | **200 wrote** | 404 NF | **200 wrote** |
| `PUT …/:projectId/cmc` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `POST …/:projectId/linked` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `PATCH …/:projectId/knowledge` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `POST …/:projectId/apps` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `DELETE …/:projectId/apps/:appId` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 404 h |
| `PUT …/:id` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `PATCH …/:id/ownership-preferences` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `PUT …/:id/sharing/members/:userId` | 403 PD | 403 PD | 403 PD | 403 PD | 409 ARCH | 404 NF | **200 wrote** |
| `DELETE …/:id/sharing/members/:userId` | 403 PD | 403 PD | 403 PD | 403 PD | 409 ARCH | 404 NF | **200 wrote** |
| `PATCH …/:id/sharing/visibility` | 403 PD | 403 PD | 403 PD | 403 PD | 409 ARCH | 404 NF | **200 wrote** |
| `PUT …/:projectId/collaborators` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `DELETE …/:id` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | **200 wrote** |
| `POST …/:id/export` | **200 wrote** | **200 wrote** | **200 wrote** | 404 NF | **200 wrote** | 404 NF | **200 wrote** |
| `POST …/:id/transfer` | 403 WPD | 403 WPD | 403 WPD | 404 NF | 409 ARCH | 404 NF | 400 h |
| `POST …/:id/schedule-of-events/generate` | 403 WAD | 403 WAD | 403 WAD | 403 PD | 409 NA | 403 PD | **200 wrote** |
| `POST …/:id/schedule-of-events/amend` | 403 WAD | 403 WAD | 403 WAD | 403 PD | 409 NA | 403 PD | **200** |
| `POST …/:id/schedule-of-events/review` | 403 WAD | 403 WAD | 403 WAD | 403 PD | 409 NA | 403 PD | **200** |
| `POST …/:id/schedule-of-events/goals/reset` | 403 WAD | 403 WAD | 403 WAD | 403 PD | 409 NA | 403 PD | **200 wrote** |

### Reads

| GET | Not on private, head → after | Other org (RLS off), head → after |
|---|---|---|
| `…/:projectId/tasks` | **200, the private project's tasks** → 404 NF | 200, an empty list (organization predicate) → 404 NF |
| `…/:projectId/tasks/summary` | **200, its health score** → 404 NF | 200, empty → 404 NF |
| `…/:projectId/collaborators` | **200, names and emails** → 404 NF | 404 h-NF (unchanged) |
| `…/review-record/export` | 403 `AUDIT_READ_RESTRICTED`, the audit-reader gate, which ran before project access → 404 NF | the same → 404 NF |
| the other 48 | refused at head, unchanged | refused at head, unchanged |

The viewer and the owner are admitted to all 52 GETs, before and after.

**Through the open project's URL** (`/projects/401/artifacts/art_402/…`, the artifact of the private project 402):

| GET | Head | After |
|---|---|---|
| `…/review-threads`, as a member admitted to 401 and not on 402 | **200, the private project's thread** | 404 Artifact not found |
| `…/review-tasks`, the same member | **200, its review task** | 404 Artifact not found |
| `…/review-record/export`, an audit reader (approver) | **200, the private project's review record** | 404 Artifact not found |

Through 402's own URL, its owner still reads both (the control).

**`GET /api/artifacts-center/:artifactId/export`, the governed DOCX:**

| Caller → artifact | Head | After |
|---|---|---|
| A member not on the private project → its artifact | **200, the DOCX** | 404, nothing recorded |
| The same member → the open project's artifact | 200 | 200, recorded |
| The private project's owner → its artifact | 200 | 200, recorded |
| The owner → another organization's artifact | 404 | 404 |

## What changed

- **`server/routes/c2c/project-access.ts`**
  - **Review mode:** `requireProjectAdmission(req, id, 'review')`. It applies:
    - the current role gate (`GOVERNED_WRITE_ROLES`, which refuses a viewer and a caller with no role);
    - the read sharing policy, so a live review assignment still admits;
    - the archived refusal.

    It skips `canEditProject`, which would refuse the reviewer the assignment names.
  - The existing boolean `forWrite` keeps its meaning for every existing caller.
  - The pinned path refuses `'review'` with a TypeError instead of reading it as a read.
  - **`projectAdmissionMiddleware({ routes, projectId })`:**
    - `routes` names a route as `'METHOD /path'` in another mode (review, or read for a POST that changes nothing). Any other route keeps its method's mode, so a new write is admitted as a write.
    - `projectId` translates a URL that may name the project another way.
- **`server/routes/c2c/artifact-project-scope.ts`:** `urlProjectId` was split out of `authorizedProjectId`, so the router's admission and the handlers' check share one translation, an integer id or a program uuid through its anchor.
- **`server/routes/c2c/artifacts.ts`**
  - `router.param('projectId', projectAdmissionMiddleware({ projectId: urlProjectId, routes }))`. The review acts are `POST …/comments`, `PUT …/comments/:commentId/resolve`, `POST …/reviews/submit` and `PUT …/status`.
  - **`PUT …/status` is a review act, by main's decision.** An approver is often deliberately not an editor of what they approve (separation of duties). The gate admits whoever may take part in review: role gate, assignment, archived refusal. The route's own ceremony then decides who may approve or lock: its role table, signing authority, re-authentication and the signed act.
  - Rollback and assigning or withdrawing reviewers stay writes.
  - Each act keeps its own ceremony after the gate: the reviewer/approver/admin role tables, the assignment, self-review.
  - **`GET /api/concept2cure/artifacts`:**
    - rows are limited to `getAccessibleReportProjectIds` for the caller's current membership;
    - the projects join is `projects.id = … AND projects.organization_id = $org`;
    - the cache key carries the user, since the list is now per caller. It is not deleted; whether it goes is the Vault fold's call.
- **`server/routes/c2c/tasks.ts`**
  - `router.param` (assess in read mode).
  - `PUT` and `DELETE …/tasks/:taskId` now also carry `project_id = <admitted project>`. They matched by task id and organization, so an editor of one project could change or delete a task of another project, private or archived, through the first one's URL.
- **`server/routes/c2c/reviews.ts`**
  - `router.param`; the two creators are in review mode.
  - The artifact lookup of the two creators and of the three reads (`GET …/review-threads`, `…/review-tasks`, `…/review-record/export`) also carries `project_id = <admitted project>`, for the same reason as the tasks.
- **`admittedProjectId(req)`** (`project-access.ts`): the integer project `router.param` admitted. It is used by tasks.ts and reviews.ts, defined once.
- **`server/routes/c2c/haq-sessions.ts`, `server/routes/c2c/governance-ops.ts`:** `router.param('projectId', projectAdmissionMiddleware())`. The decision transition keeps its lifecycle rules after the gate.
- **`server/routes/concept2cure.ts`:** one line, `projectRecordAdmission(false)` on `GET …/collaborators`, as its PUT twin has. Agreed with main.
- **`server/routes/artifacts-center-routes.ts`:** the export also reads the artifact's `project_id`. `artifactProjectRefusal` then admits that project in read mode, using `readCurrentProgramActor` and `canAccessReportProject`, the listing's own policy. This happens before the content check, the review gate or the file.
  - A project the caller cannot open gets the same 404 as an id of no artifact.
  - A check that could not run is 503 `PROJECT_ACCESS_UNAVAILABLE`.
  - The review gate and the recorded download are unchanged.
- **Every query these change keeps its organization predicate.** The new task predicates add the project; they do not replace the organization.

### Approving: the gate admits the reviewer, the ceremony decides the signature

Pinned on PGlite in the new suite, against the real status route. The role table, signing authority, the real bcrypt re-authentication (`signerReverificationDeps` over the fixture's own password hash) and the signed act's transaction all run. Only the contradiction engine, which is not part of the act and reads tables this fixture lacks, answers "nothing blocks", as it does in `artifact-approval-ceremony.pglite`.

| Case | Head | After |
|---|---|---|
| An organization reviewer, not an edit member, who holds signing authority, approves an in-review artifact | 200, signed | **200, signed:** `concept2cure_signatures` holds the reviewer's own signature, meaning `approval`, authentication not `session_jwt` |
| An approver on the **archived** project approves its in-review artifact | **200, signed** | **409 `PROJECT_ARCHIVED`**, from the gate, before the ceremony; nothing written |
| A viewer | 403, the role table (unnamed) | **403 `PROJECT_WRITE_PERMISSION_DENIED`**, from the gate; nothing written |
| A member without signing authority | 403, the role table | **admitted by the gate, refused by the ceremony:** 403 from the route's role table ("not permitted to perform transition"), not an admission code; nothing written |

### The suites that stub project access

Eleven existing suites drive these routers over a queued query mock and stub `verifyProjectAccess`:
- five in `server/routes/c2c/__tests__/`;
- `tasks-tenant-scope`;
- five in `tests/`, agreed with main.

They need a `projectAdmissionMiddleware` to load. **`server/routes/c2c/__tests__/support/admission-double.ts`** decides it with the suite's own stub:
- it takes the project the real middleware would (the router's translation, else the URL's);
- it admits on grant;
- it refuses 404 `PROJECT_NOT_FOUND` on deny;
- it answers 503 `PROJECT_ACCESS_UNAVAILABLE` when the translation throws.

`tasks-tenant-scope` has no stub of its own; it admits every project, and says so.

- **With the double:** 118 of 118, after one assertion change, agreed with main.
  - In `tests/artifact-status-project-scope.test.ts`, a project lookup that could not complete is now 503 `PROJECT_ACCESS_UNAVAILABLE`. The admission runs first now, and that is its answer; it was the handler's 500.
  - Its "never a not found" assertion stays beside it.
- **With a plain `next()` in the double's place:** 117 of 118 (`mocked-suites.txt`).
  - **The one red** is that same lookup-failure case: without the double, the handler answers 500.
  - **No 404 denial case goes red.** Every one of them is decided after the middleware:
    - `authorizedProjectId` calls the same stub;
    - `loadProjectArtifact` refuses another project's artifact;
    - the translation returns null for an unanchored or unknown project.

  So the double neither hollows those cases out nor is what they prove. The refusals only the middleware makes (viewer, member without edit permission, archived, private project) are proven on PGlite, and the mutations below show each one red without its gate.

**`server/routes/__tests__/artifacts-center-export-governance.test.ts`** (agreed with main) queues `pool.query` answers for the export's artifact read.
- The export's admission now asks first, so this suite stubs it:
  - `readCurrentProgramActor` answers the suite's user as a current member;
  - `canAccessReportProject` answers true and records its call.
- The suite has no access stub of its own; its one artifact is the caller's.
- One assertion is added: the export asked for the artifact's own project (33).
- 9 of 9 pass. The admission itself is pinned on PGlite in the new suite.

## Tests: red, green, mutations

- **`red.txt`:** HEAD `18ecfe003` plus the new suite (and its support files) and nothing else, run in a scratch extraction of HEAD outside the shared tree. **144 failed, 547 passed (691).** Each failure prints the route's whole answer at head. The 144:
  - **57** census refusal cases where the database changed a row for a caller who should have been refused. The rolled-back artifact edit is among them: it rolled back only because this fixture lacks a table;
  - **22** census refusal cases that no project-access check refused:
    - 12 refused only by the handler's organization-role table, unnamed;
    - 2 that answered "Task not found" through the organization predicate;
    - 7 that ran into handler logic: the governance transition, which failed for want of a decision (×4), and the rollback and reviewer validation (×3);
    - 1, the assessment of a private project, answered to a non-member;
  - **37** census cases the handler did refuse, but only with its own unnamed `404 Project not found` (a member not on the private project, the other organization). They are red because the suite requires the admission's named refusal. They were not leaks;
  - **28** targeted tests:
    - the viewer on each of the six review acts, and the reviewer refused an edit (7);
    - the archived approval, which was signed at head, and the viewer's approval (2);
    - a row of another project through this project's URL: task PUT and DELETE, both review creators, the predicate check (5);
    - the three review reads (3);
    - `GET /artifacts` (3);
    - the export (1);
    - the read census: tasks, tasks summary, collaborators, review-record export (7).

  The 547 that pass include every case of the 42 writes that held, the 48 reads that held, and the cases where an assigned reviewer completes each review act and approves. Those held at head too; they are the regression guard for review mode.
- **`green.txt`:** the working tree at 46db6c762 with this change. **1129 of 1130** across 44 files:
  - the new suite, 691 of 691;
  - the 43 suites that load a changed router, stub project-access, or load the artifacts-center router (its five suites among them).

  The one failure, `server/__tests__/routes/smoke.test.ts` "keeps concept2cure router tenant-scoped and envelope-based", fails the same way at HEAD. It looks for `router.post('/projects'` in `routes/concept2cure.ts`, which A2.9 removed.
- **`mutations.txt`:** each mutation applied alone to HEAD plus this change in the scratch tree, the suite run, and the file restored. **22 of 22 red.**

| # | Mutation | Red | What went red |
|---|---|---|---|
| M1 | drop the param middleware (`tasks.ts`) | 30 of 691 | all six refusal cases of the 4 task writes; the assessment for a non-member and the other organization; the two task reads |
| M2 | drop the param middleware (`artifacts.ts`) | 77 of 691 | every refusal case of the artifact writes and the review acts; the viewer review-act cases; the approval pins for the viewer and the archived project; the reviewer refused an edit |
| M3 | drop the param middleware (`reviews.ts`) | 12 of 691 | the four refusal cases of the thread and task creators (a non-member and the other organization red on the name: the handler's own unnamed 404 still refuses them); the viewer review-act cases; the review-record export reads, where the audit-reader gate answers first |
| M4 | drop the param middleware (`haq-sessions.ts`) | 6 of 691 | all six refusal cases of PUT …/haq-session |
| M5 | drop the param middleware (`governance-ops.ts`) | 6 of 691 | all six refusal cases of the decision transition |
| M6 | drop the read admission on GET …/collaborators (`concept2cure.ts`) | 1 of 691 | GET …/collaborators for a member not on the private project |
| M7 | read mode for the writes (`artifacts.ts`) | 37 of 691 | viewer, use member, reviewer and archived on the 9 artifact writes outside review mode; the reviewer refused an edit |
| M8 | read mode for the writes (`tasks.ts`) | 16 of 691 | viewer, use member, reviewer and archived on the 4 task writes |
| M9 | review acts admitted in write mode (`project-access.ts`) | 19 of 691 | the use member and the reviewer on each of the six review acts; the assigned reviewer completing each act; the reviewer's approval; the member refused by the ceremony (now by the gate) |
| M10 | review acts admitted in read mode (`project-access.ts`) | 20 of 691 | viewer and archived on each review act; the viewer review-act cases; the archived and viewer approval pins |
| M11 | review mode without the archived refusal (`project-access.ts`) | 7 of 691 | archived on each review act; the archived approval |
| M12 | review mode without the current-role gate (`project-access.ts`) | 13 of 691 | the viewer on each review act, both suites; the viewer's approval |
| M13 | drop the organization predicate on GET /artifacts' projects join (`artifacts.ts`) | 1 of 691 | the statement check on the projects join (the access filter excludes a mis-keyed row before the join could name it, so only the statement shows it) |
| M14 | drop the project-access filter on GET /artifacts (`artifacts.ts`) | 1 of 691 | the member not on the private project sees its artifact |
| M15 | drop the project predicate on the task PUT (`tasks.ts`) | 2 of 691 | the private project's task changed through the open project's URL; the predicate check |
| M16 | drop the organization predicate on the task PUT (`tasks.ts`) | 1 of 691 | the predicate check (the project predicate alone still finds no other organization's row) |
| M17 | drop the project predicate on the review-thread artifact lookup (`reviews.ts`) | 1 of 691 | the private project's artifact reached by the thread creator through the open project's URL |
| M18 | the status change admitted in write mode (`artifacts.ts`) | 4 of 691 | the use member and the reviewer on the status change; the reviewer's approval; the member refused by the ceremony (now refused by the gate instead) |
| M19 | drop the project predicate on the review-thread read (`reviews.ts`) | 1 of 691 | the private project's review threads read through the open project's URL |
| M20 | drop the project predicate on the review-task read (`reviews.ts`) | 1 of 691 | its review tasks, the same |
| M21 | drop the project predicate on the review-record export (`reviews.ts`) | 1 of 691 | its review record exported through the open project's URL |
| M22 | drop the export's project admission (`artifacts-center-routes.ts`) | 1 of 691 | the member not on the private project is given its artifact's DOCX |

## Gates (`gates.txt`)

| Gate | HEAD 46db6c762 + this change | Shared tree at 46db6c762 |
|---|---|---|
| `npm run ci:sql-interpolation` | OK, no new value interpolated | OK |
| `npm run ci:program-ownership-single-source` | OK, every program-ownership check calls `programInOrganization` | OK |
| `npm run ci:tenant-isolation:no-regression` | OK, 0 current findings, 0 baseline | OK |
| `npm run ci:tenant-entry-points` | OK, 13 entry points, none unclassified | OK |
| `npm run ci:drizzle-tenant-scope` | OK, 90 sites, all baselined; it reports no site fixed or added, so there is no baseline to bank | OK |

At 18ecfe003, `ci:tenant-isolation:no-regression` failed on HEAD alone, with or without this change. The finding was `server/services/qms/training-compliance.ts:113`, from 5c75de2ab; main fixed it in c5f8e1ac4.

The scoped `tsc` reports **0 errors** across the 24 changed files (`typecheck.txt`, `typecheck-tsconfig.json`). `npx eslint --no-ignore` on every changed file shows the same warning count as HEAD, and 0 on the new files (`eslint.txt`). The suite's route table and fixture live in `support/project-write-gates-fixture.ts`, so the suite stays under the 500-line rule.

## Not done, and found

- **The schedule of events admits its writes twice, in two shapes.**
  - The route's `admitRouteProject` runs in read mode.
  - The service's `admitHumanSchedule` is a second implementation of write admission (role, archived, edit through `canAccessReportProject`).
  - It holds, so it was not touched. Converging it onto `requireProjectAdmission` pinned would be zero-duplication work for main.
- **Rollback and assigning or withdrawing reviewers stay writes, by main's decision.** An organization reviewer who is not an edit member cannot do them. Approving through `PUT …/status` is a review act and is open to them, subject to its ceremony.
- **`GET /api/concept2cure/artifacts`:**
  - It does not filter by client workspace. The canonical set does not, and single-project admission does.
  - It still lists archived projects' artifacts, which can be read.
  - It still caps at 200.
  - Deleting it is the Vault fold's call.
- **The Vault export admits by the listing's policy, like the listing:**
  - `canAccessReportProject` does not check the client workspace, as single-project admission does, so the listing and the export agree with each other rather than with `requireProjectAdmission`;
  - an archived project's artifact can be exported (read mode), subject to the review gate.
- **No real-PostgreSQL route run.** The `*.dbtest.ts` lane needs a disposable database. The route-level proof is PGlite, with the production pool primitive and request scope.
