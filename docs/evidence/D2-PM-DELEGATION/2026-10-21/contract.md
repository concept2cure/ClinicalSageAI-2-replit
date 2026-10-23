# D2 Projects — task delegation contract inventory

## What already exists

Inventory before design/implementation at `30afd3bd17a90c8de4a44098354d9de3a34cb4bc`.

- `server/routes/taskManagement.routes.ts`: canonical task creation accepts a named real organization assignee and stores assignedBy/assignedAt; existing PATCH changes status/progress, not assignment. Existing POST `/tasks/auto-assign` reassigns tasks with an atomic task.assign ledger entry and post-commit in-product notification. Its task/recipient selection is organization scoped, with no visible project admission at these assignment sites. These operations must be completed in place, not rebuilt on another task store.
- `server/routes/unifiedTasks.routes.ts`: sibling routes share the same unified_tasks store, governed write and audit helpers; creation supports assignee fields and status routes retain their own signoff. No existing named reassignment handler found here.
- `client/src/concept2cure/v2/surfaces/TaskBoard.tsx`: real named assignee picker on creation and an Auto-assign task button in existing TaskDetail. There is no named selector for an existing task. The project task panel already reaches this board.
- `server/routes/taskBoard.routes.ts`: existing GET `/api/task-management/assignees` provides organization identities and shared member label disambiguation. It does not filter inactive users; a missing store currently returns success with an empty roster. It is not yet a verified task/project-specific assignment roster.
- `server/services/tasking/task-planning.ts`: workload balancing through getOptimalAssignee; it counts active tasks but selects organization members without checking their current project sharing admission.
- `server/services/tasking/task-audit.ts`, `governed-task-write.ts`, `task-state-machine.ts`, `task-signoff.ts`: canonical attributable task writes, enlisted hash-chain audit, unknown COMMIT semantics, lifecycle and approval/signing boundaries. task.assign already exists. Do not replace or weaken them.
- `server/services/tasking/task-project.ts`: derives a new authoring review task's project from the canonical document/program anchor. It is not a manual reassignment writer or an access grant.
- `shared/schema.ts` unifiedTasks: durable assignee_id, assignee_name, assigned_by, assigned_at, project_id, organization_id, lifecycle/signature and provenance fields. No new task or assignment table is needed; ledger retains prior/current assignee facts.
- `server/services/report-os/project-access.ts`, `server/services/csr/project-scope.ts`, `server/middleware/orgMembership.ts`: current persisted actor, canonical project Use/Edit policies and governed role boundaries. PM-04a's existing sharing controls (`server/routes/c2c/project-sharing.ts`) grant access separately; assigning work must not grant a share.
- `shared/utils/member-labels.ts`: canonical duplicate-name account labels. Use account IDs, never infer identity from a recorded name.
- `server/services/ana/agentic-workflow-tools.ts`: run_agent is read-only research delegation, not human task assignment. Searched task.assign/assignee/delegation tool names; no named human reassignment tool found. No new AnA mutation tool is needed.

Searches cover task/assignment/assignee/delegation names in client surfaces, server routes/services/AnA, schema and migrations. Deleted-history search found `b4eb62419` deleting review-change-request/review-decision-delegate tests as review work converged on Authoring; that is document review delegation, not a missing unified-task reassignment implementation, and must not be resurrected.

## Scope status

Existing capability inventory preceded worker prompts. The contract below is frozen for implementation. Work remains D2 Projects, supporting all requested client segments through the current task board. No new store, permission system, dependency, branch or PR.

## Frozen bounded contract — complete named task reassignment

Extend existing PATCH `/api/tasks/tasks/:taskId` with strict assignment branch `{action:"assign",assigneeId:positiveInt,expectedAssigneeId:positiveInt|null,expectedVersion:64hex,reason:trimmed3..1000}`. Reject mixed assignment/status bodies. Existing status/progress/signature contracts remain unchanged. A fresh persisted governed actor is authoritative for this branch and existing automatic assignment, even if a token's role is stale.

Extend existing GET `/api/task-management/assignees?taskId=...` with the existing `data:[{id:string,name:string,label:string}]`, `total` and `meta:{organizationId,actorUserId,taskId,projectId:number|null,clientWorkspaceId:number|null,status,canAssign:boolean,assigneeId:number|null,assignmentVersion:string}`. Version is SHA-256 of exact native row identity, xmin and updated_at text, never a rounded JavaScript date. An admitted read-only/terminal read returns canAssign false and no directory. Unscoped callers keep the existing directory shape, with verified active unique accounts and honest unavailable errors.

Success PATCH is `{success:true,data:{taskId,organizationId,actorUserId,projectId,clientWorkspaceId,status,assigneeId,assigneeName,assignedBy,assignedAt:string,assignmentVersion}}`. Same-assignee, stale-version, terminal or changed-scope writes are refused, without rewriting completion/approval/creation provenance. Only assignment fields, last modifier and updated timestamp change.

Existing POST `/tasks/auto-assign` keeps `{taskIds,reason?}` and its result/count/partial/unconfirmed semantics. It may additionally accept `expectedAssignments:[{taskId,expectedAssigneeId,expectedVersion}]` for an already-read UI task. Manual and automatic assignment share one request-pinned engine, current permissions, recipient eligibility, state protection and atomic task.assign lineage. Automatic balancing extends the existing getOptimalAssignee with the transaction executor and eligible IDs; do not copy its algorithm or use the global pool from the transaction. Genuine no-candidate/not-found/terminal cases can be skipped by the existing batch contract; verification failure must not be converted into a successful empty batch.

Use current GOVERNED_WRITE_ROLES and project Edit for the actor, current active unique organization membership/governed role and existing project Use for recipients. Assignment never creates sharing, approval, signing or document review authority. Parent-project admission/workspace comes from the recorded integer project; reject mismatched nonnull task/client claims. Organization-wide tasks with null project/workspace stay organization-wide; never invent a workspace. Parent lock precedes task lock; recheck project/version after locking; retain current actor/recipient/sharing admission until commit; acquire the existing audit-chain lock last.

Task and its existing hash-chained task.assign ledger entry are one transaction via the canonical task-audit writer on the same request client. Audit failure rolls both back. Unknown COMMIT evicts the uncertain connection, sends no notification and requires reread. Product notifications remain post-commit; qualification uses synthetic data and notification sinks, not real recipients.

UI extends existing TaskDetail through a bounded assignment component and existing captured actor guards. A fresh scoped read supplies current assignment/version and candidate identities; validate task/project/actor/org/workspace before enabling save. A real reason is required for named handoff. Named and automatic controls share in-flight/uncertainty blocking; stale scope handlers send no request. Reread saved facts and refresh the existing board. Other native-store tasks remain read-only here. No AnA mutation tool, table, dependency, permission model or new endpoint.

## Qualification boundary

Focused tests must fail first for stale role, inactive/foreign/no-access target, other client/project, stale assignment/version, terminal task, mixed status payload, failed audit and unknown commit. Native PostgreSQL will qualify real restricted-role RLS, atomic task/chain persistence and independent-session stale assignment when practical; full production authentication/deploy-schema proof remains excluded. Browser/component tests cover named handoff, no-op/empty/read failures, actor/task/workspace retirement, unknown-outcome refresh and approval/signature field preservation. Complete normal build/typecheck/hooks and direct branch publication; no PR or production deployment.
