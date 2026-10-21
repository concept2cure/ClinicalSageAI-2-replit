# D2 Projects — complete existing team setup reachability

## What already exists

- `server/routes/concept2cure.ts`: canonical integer-project sharing GET, member PUT/DELETE and visibility PATCH; existing audit outcome metadata. Member controls are not reached from the v2 ProjectHome. These handlers still use claimed actor role and legacy workspace/access helpers; membership removal currently deletes the share row.
- `server/routes/c2c/project-access.ts`: existing integer-project admission and durable sharing loader, including a missing-table legacy fallback. `server/services/project-sharing-access.ts` is the single canonical owner/edit/use and visibility policy. Neither freeform responsibilities nor task assignment constitute access grants.
- `server/services/c2c/current-program-access.ts`, `server/routes/c2c/project-route-access.ts`: UUID program admission against a unique integer-project anchor and current actor; client workspace and read/write boundaries are explicit. Do not add a second program-to-project resolver.
- `server/services/c2c/project-team.ts`, `shared/project-team.ts`, `client/src/concept2cure/v2/surfaces/ProjectTeamResponsibilities.tsx`: admitted, scoped team read, actual IDs, account verification, responsibility/sharing separation, unlinked name contacts, fail-closed UI. It provides no membership mutation controls.
- `shared/schema.ts` (`projectMembers`) and `db/migrations/20260401_project_sharing_visibility.sql`: existing active/revoked durable sharing memberships with inviter/accepted timestamps, plus visibility store. No new membership table is needed.
- `server/routes/taskManagement.routes.ts`, `server/routes/taskBoard.routes.ts`, `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`: real task assignee IDs, creator/assigner history, organization roster, named assignment on task creation and existing automatic assignment of unfinished tasks. TaskBoard already reaches these operations. This is business work delegation, separate from access and document-specific approval.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: existing project work panel and Team & activity; currently read-only team facts. `shared/utils/member-labels.ts` already disambiguates real identities.
- `server/services/part11/signing-authority.ts` and authoring review assignments: document-specific authority. Project sharing must not replace these policies.
- `server/services/ana/*tool*.ts`: searched member/sharing/delegation names; no project membership editing tool found. Existing surface actions reach the task board; governed mutations remain human-operated.

Searches covered member/team/sharing/access/delegation/assignee names across client surfaces, server routes/services/AnA, schema and migrations. `git log --all --diff-filter=D` for ProjectShare/project-sharing/ProjectTeam/project-team/project-member/delegat returned no deleted implementation matches. No existing client caller of sharing/members or sharing/visibility was found.

## Qualification status

Inventory recorded before implementation prompts. Contract and verification will be completed after focused admission and UI discovery. This evidence concerns launch row D2 and PM-04 in the retained PM enhancement roadmap, across all requested client segments. It does not claim production deployment or completion of every roadmap row.

## Value across client workflows

The same verified account/sharing controls support Biotech's outsourced study and CMC contributors, Pharma's cross-functional document contributors, Medical device design/V&V contributors and IVD analytical/clinical performance contributors. CRO/consultancy delivery uses the same controls within each admitted client project. These are access and coordination controls: no study acceptance, design verification, performance claim, approval or filing verdict follows from membership. Existing task assignment remains on the task board and existing document-specific review/signing remains authoritative.
