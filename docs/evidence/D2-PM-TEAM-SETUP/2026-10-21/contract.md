# D2 Projects — existing team setup contract inventory

## What already exists

Inventory captured before implementation at `b9a48ce7136b8eecb076126d22e387d4d1b0ba84`; the limits below describe that starting state.

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

## Bounded completion: PM-04a

Reach the canonical sharing membership operations from the existing Team & activity section. Extend the existing sharing GET/PUT/DELETE (and apply the same current-manager guard to the existing visibility PATCH), rather than adding membership endpoints or a parallel permission implementation. PM-03 remains the responsibility read. Existing ProjectHome work panel and TaskBoard remain the delegation path; this slice does not claim named reassignment of existing tasks or completion of every PM-04 acceptance criterion.

- Bind requests from the UUID program view to its verified numeric anchor using a program UUID query parameter. Server must re-resolve the canonical program relationship and reject a mismatched project/client boundary. Legacy numeric callers retain their current workspace scope.
- Derive management eligibility from current active persisted organization membership, governed write role, active project/tenant and canonical owner/sharing policy. Claimed admin roles and read-only owners must never authorize mutation. The server is authoritative even when a control was rendered earlier.
- Extend sharing GET with scoped management eligibility and a manager-only active same-organization account picker. Use existing member label disambiguation. Failure to verify the roster is unavailable, not an empty success. Do not expose candidate accounts to ordinary readers.
- Allow only Use or Edit membership selection. Ownership transfer, program lead, freeform contacts, review approval and electronic signing retain their existing separate operations.
- Revoke an explicit share by status update, preserving its recorded account, role and timestamps/provenance. Do not delete task/author/reviewer attribution. Regrant uses the same durable identity. Do not claim complete loss of access: creator/owner, organization management and organization-visible policy can still grant it.
- UI must mask prior program/account/org data synchronously, use captured actor identity headers for mutations, validate program/project/workspace binding, prevent overlapping saves and reread the saved state. An unconfirmed transport outcome says to reread before retry. Audit persistence metadata is shown honestly; no fabricated audit success.
- Existing task navigation supplies assignment controls; project membership does not itself assign a task or grant approval authority.

## Scope and verification

Backend owns existing sharing route extension and focused SQL/HTTP admission tests; UI owns the reached team controls and component/scope tests. Root owns integration, supplemental native PostgreSQL/browser evidence, build/typecheck, ordinary commit/push and remote receipt. No dependency, schema, branch, PR or production deploy change.

Required boundaries: successful current manager grant/revoke; stale claimed admin denied; viewer/observer denied even if recorded owner; inactive/departed/foreign account refused for grants; mismatched UUID anchor and wrong client inaccessible; archived project denied; no management candidates for readers; revoked row retained and future private access removed while historical attribution remains; readonly team display unaffected by sharing read failure; mutation/audit/transport failure semantics; stale program/account responses and submissions suppressed.

## Frozen wire extension

Existing sharing endpoints accept `?programId=<UUID>` for v2. `data` retains `projectId: "proj_N"`, `visibility`, `legacyFallbackApplied` and `members`. Added: `programId: string | null`, `organizationId: number`, `clientWorkspaceId: number | null`, `actorUserId: number`, `canManage: boolean`, `candidates: { userId: number; label: string }[]`. Candidates are empty for non-managers. Each normalized member retains old fields and adds `explicit: boolean`, `implicitSources: ("project_owner" | "project_creator")[]`, `canSetRole: boolean`, `canRevoke: boolean`. Owner/creator and owner-role rows are protected; the UI never offers their removal or downgrade. Endpoint writes independently verify current authority and target identity. PUT keeps `{role:"use"|"edit"}`; DELETE revokes an existing active explicit row and refuses nonexistent/repeated revocation with 409. Existing `meta.auditTrail` remains the actual best-effort regulatory audit outcome.

UI prop boundary: `ProjectTeamSharing({programId, projectId, onChanged})` mounted only from verified current PM-03 facts; independent share-read state, current actor/organization/workspace guards, local audit notice, successful write triggers current read and team refresh. No candidate labels enter AnA context.

Revocation qualification: an existing explicit Use/Edit share can be revoked even if its account is now inactive or departed. This cleanup does not resolve or expose a historical name. Grant/update still requires a unique active current same-organization account. A COMMIT acknowledgement failure is unconfirmed, evicts the uncertain connection and requires reread; no automatic retry or claim of rollback.
