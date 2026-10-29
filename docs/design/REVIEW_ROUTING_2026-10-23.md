# Assigned review and approval routing: Vault and QMS join the review loop that exists (2026-10-23)

Gap 4 of `docs/design/VEEVA_GAP_2026-10-22.md`: *"converge Vault and QMS onto the review loop that exists"*. Launch row **D2** (launch catalog: Vault, QMS controlled documents, Authoring). Evidence goes under `docs/evidence/D2-REVIEW-ROUTING/<date>/`, one folder per slice, each with its red and green output.

**Veeva gives:** named reviewers and approvers, multi-signer routes, due dates, tasks, reminders and an inbox.

This is a design for **converging and completing** what exists. It adds no surface, module, AnA tool or notification category. It names one additive migration, and it removes three parallel review paths, each with its replacement named by path.

Measured at `origin/concept2cure-v2` `202009d09` (fetched 2026-10-23), read with `git show`/`git grep` because the local checkout was then 40 commits behind. **Re-checked at `8b58354af` (2026-10-29).** Every file:line below is the `8b58354af` line. Three facts changed between the two heads:

- TaskTray's reads moved into `OpenWork.tsx`, which Home now shares.
- The UI copy says "Tasks" where it said "My work". The read is still `/api/task-management/my-work`.
- A named task reassignment path landed (`task-assignment.ts`, `2cc5ec6b1`, 2026-10-23). §2.8 and RR3 now reuse it instead of cancel-and-create.

---

## 1. What already exists

Searches run, by every name: `SendForReviewDialog`, `request-review`, `authoring_reviews`, `REVIEWER`, `review_requested`, `notifyTaskEvent`, `taskDueSweep`, `TaskTray`, `OpenWork`, `Awaiting my review`, `authoring_workflow_steps`, `/submit`, `approver_email`, `approvers`, `requireTaskSignoff`, `assignTask`, `document-lifecycle`, `review_signature`, `VaultLifecycle`, `vault-review-queue`, `sendQmsDocumentForReview`, `in_review`, `approveQmsDocumentSigned`, `controlled-document-service`, `review-threads`, `review-tasks`, `my-queue`, `/reviewers`, `concept2cureReviewAssignments`, `ApprovalOrchestrator`, `approval-workflows`, `quorum`, `approval_checkpoints`, `protocol-reviews`, `reassign`, `withdraw`, `review_route`, `sourceEntityType`, across `server/`, `client/src/`, `shared/`, `migrations/`, `db/migrations/`, `scripts/` and `docs/`.

Deletions searched with `git log --all --diff-filter=D` on `*periodicReview*`, `*ReviewerAssignment*`, `*SignatureWorkflow*`, `*Approvals.tsx`, `*ReviewQueue*`, `*review-board*`, `*ApprovalWorkflow*`, `*approvalWorkflow*`, `*ReviewRout*`, `*AssignReviewer*`, `*SendForReview*`, `*ApprovalRoute*`, `*review-assign*`, `*ReviewInbox*`, `*Inbox*`, `*ApprovalChain*`, `*WorkflowSteps*`, `*Quorum*`, `*Assign*`, `*Reminder*`, `*approval*`, `*signoff*`, `*ReviewTask*`. The clone is shallow, so `e5a74a4df` was confirmed through the GitHub API instead.

### 1.1 The Authoring loop: the one complete named-reviewer path

| Piece | Where | What it does today | What it does not do |
|---|---|---|---|
| Send for review dialog | `client/src/concept2cure/v2/editor/SendForReviewDialog.tsx:1-63` (contract), `:250` `requestReview`, `:274` `createTasksFor`, `:666` component | Reads existing requests first and cannot re-ask a pending reviewer. Requires a governed reason. Withholds the author (`useReviewerRoster`, `AssignReviewDialog.tsx:115`). Then makes **two separate writes**: the request, then one task per reviewer. | The two writes are not atomic. A task that fails leaves a request with no task, and the dialog reports it as refused or unknown (`tasksSentence`, `:291`). It has no approver field. |
| Request route | `server/routes/authoring.router.ts:3316` `POST /api/authoring/documents/:id/request-review` → `requestAuthoringPeerReviews` (`server/services/authoring/peer-review.ts:313`) | In one transaction: one `authoring_reviews` row per reviewer (pending, upsert on `(doc_id, reviewer_id, tenant_id)`), one audited `review_requested` row, and the Reviewer grant (`grantRequestedReviewers`, `authoring.router.ts:3255`). The grant applies only when the requester may manage the document's access. Refuses the author and contributors (`peer-review.ts:122-133`, `REVIEWER_IS_AUTHOR`). | Creates no task and sends no notification itself. It takes no due date and no approver. |
| Verdict ledger | `authoring_reviews`: deployed by `db/migrations/20260730_authoring_subsystem_schema.sql:79-102` (`doc_id TEXT`, `tenant_id INTEGER`, applied by `applyAuthoringSubsystem`). Also `migrations/20260728_authoring_reviews.sql` (`doc_id uuid` FK, install-fresh overlay only, deliberately off `C2C_MIGRATION_FILES`: `scripts/db/migration-set.mjs:1103-1113`) | One row per reviewer per document. Holds the status (`pending`/`approved`/`rejected`/`changes_requested`) and the reviewed snapshot and hash, bound to the saved Authoring sections. | It holds no due date, no role (reviewer vs approver) and no round: a re-ask reopens the same row. It is keyed `tenant_id`, not `organization_id`, and its two creators disagree on `doc_id`'s type. |
| Verdict closes the task | `authoring.router.ts:3131` `closeReviewTasksOnVerdict`, used by `POST /documents/:id/review` (`:3221`) | On the verdict's own transaction: finds the reviewer's open `unified_tasks` (`source_entity_type 'authoring_document'`, `task_type 'review'`), moves them through the state machine, cascades unblocking, writes `task.transition` ledger rows, and sends `task_completed` to the task's creator after commit. Lock order: task rows before the audit-chain lock. | Leaves an approval-gated task open, because a verdict is not a signature. |
| Approve readiness | `peer-review.ts:174` `canApprove` | Computes "every review current and approved". | **Not enforced.** No server path refuses an APPROVER signature (`/docs/:docId/e-sign`, `authoring.router.ts:5070`) on it. |
| Tasks | `unified_tasks` (`shared/schema.ts:7534`). Create: `server/routes/taskManagement.routes.ts:243` `POST /api/tasks/tasks`, inline transaction with audit; `notifyNewAssignee` `:222-238` | Assignee (FK `users.id`, membership checked in the org), `due_date`, `source_entity_type`/`_id`, `task_type`, `status` state machine, `approval_required`/`approvers`/`approval_history`, `created_by_id`, soft delete. `public`, `organization_id INTEGER`. | Create cannot run on a caller's transaction: it opens its own. |
| Reassignment (new since `202009d09`) | `PATCH /api/tasks/tasks/:taskId {action:'assign'}` (`taskManagement.routes.ts:419-428`) → `assignTask` (`server/services/tasking/task-assignment.ts:206`); roster `readTaskAssignmentOptions`/`readAssignableAccounts` (`:134`, `:142`, served at `taskBoard.routes.ts:537-539`) | A named handoff with a reason and an expected-version compare-and-set, the current project admission, an audit row and a notification to the new assignee. Workload-balanced auto-assign uses the same path (`taskManagement.routes.ts:1208`). | Knows nothing of review routes. It would reassign a route task without checking signing authority or separation of duties. |
| Notifications | `server/services/tasking/task-side-effects.ts:22-46` `notifyTaskEvent` → `createNotification` (`mdx_notifications`); categories fixed in `shared/constants/notifications.ts:2-16` (`task_assigned`, `task_blocked`, `task_completed`, `task_update`, `collaboration`, …) | Fire and forget, after commit. `resourceType 'unified_task'`. | No `actionUrl`. A notice opens the task, not its subject. |
| Completion cascade | `task-side-effects.ts:110` `cascadeUnblockOnCompletionInTx`; `unblockedNotice` `:155` (`task_update`) | On completion, unblocks dependents (`blockedBy[]` and `task_dependencies`) on the same transaction and notifies them. **This already gives sequential routing.** | Nothing uses it for review routing. |
| Reminders | `server/jobs/taskDueSweep.ts:128` `runTaskDueSweep`; `DUE_SOON_WINDOW_MS` 48 h (`:28`) | Tells each assignee once at due-soon and once at overdue, idempotent by metadata markers, tenant-lifecycle filtered. | Nothing to the sender. No escalation. |
| Tray and Home | `client/src/concept2cure/v2/TaskTray.tsx:14-39` (contract); reads in `client/src/concept2cure/v2/OpenWork.tsx:77-82` `useOpenWorkReads`, shared by `TaskTray.tsx` and Home (`surfaces/HomeSections.tsx:198`) | My work (`/api/task-management/my-work`, `server/services/tasking/my-work.ts`), the Phase-13 queue (`/api/concept2cure/reviews/my-queue`), approvals at my sign-off (`/api/review/board?scope=mine`), notifications. Each source fails on its own and never shows as empty. | Shows no Vault or QMS assignment, because none exists. |
| Review board | `client/src/concept2cure/v2/surfaces/Review.tsx:78` ("Awaiting my review"), `:667` (the chain); `server/routes/review-board-routes.ts:95`, `:150-154`; `server/services/review/authoring-review-board.ts:20-30`, `:616` | "mine" = a pending `authoring_reviews` row names me, or the current pending chain step's `approver_email` is mine. Also lists Vault versions in review (`vaultReviews`). | Has no due date ("The authoring store records no due date", `OpenWork.tsx:53-55`). |
| Task project | `server/services/tasking/task-project.ts:35-49`; `migrations/20261008d_unified_tasks_authoring_review_project.sql` | Resolves `project_id` for `authoring_document` tasks, so a project's Review tab lists them. | Handles no other source type. |
| Task links | `client/src/concept2cure/v2/taskTarget.ts:22` | Opens a task by id in Tasks. | I found no client mapping from `sourceEntityType` to the subject's location outside the editor's own `ReviewTasksPanel.tsx:83-110`. |

### 1.2 The `/submit` chain (`authoring_workflow_steps`)

- Created by `submitReviewWorkflow` (`authoring.router.ts:6665`) behind `POST /api/authoring/docs/:docId/submit` (`:6699`). Each step needs a `role` and an `approver_email`. Read by `GET /docs/:docId/workflow` (`:6731`). Table: `db/migrations/20260725_authoring_signatures_and_workflow.sql`.
- Advanced by `advanceWorkflowForSignature` (`:7072`), called from **`POST /docs/:docId/sign` (`:7256`), not `/e-sign`** (the gap doc said e-sign). The step update matches **any** pending step for that email (`:7097`), so the chain is parallel in practice, although `step_no` exists and the board shows only the "current" step. Authority comes from token roles `QA`/`RA_CMC` or the meaning, not the signing-authority policy (P-18). Approval and freeze happen only when steps exist and none is pending (`:7123-7142`).
- **No client caller** for `/submit` or `/sign`. The client signs through `/e-sign` (`AuthoringFilingBar.tsx:179`). The only caller of `/submit` is the launch demo pack (`scripts/demo/launch-demo/packs/biotech-authoring.mjs:113`).
- Read by the board (`authoring-review-board.ts:264-304`), `Review.tsx:667` and the tray's and Home's "approvals at my sign-off" (`OpenWork.tsx:80-82`). On a real database those reads find no rows.
- It has no due date, task or notification. Identity is an email, not `users.id`.

### 1.3 `unified_tasks.approvers` and task sign-off

- `server/services/tasking/task-signoff.ts:130` `requireTaskSignoff`. Completing an `approval_required` task needs the one signing ceremony. `:170-180`: when `approvers` is populated, only a designated approver may sign (`ESIGN_NOT_DESIGNATED_APPROVER`).
- `approvers` is `json` (`shared/schema.ts:7592`). **No writer** sets it. The file says so (`:163-168`), and says quorum is not implemented.

### 1.4 Vault lifecycle

| Piece | Where | Today | Not |
|---|---|---|---|
| Send for review | `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx:160-168` (`sendForReview`), `:291-310` (`SendForReviewConfirm`), `:394` `VersionLifecycleActions`, mounted at `VaultVersions.tsx:333` | Two client POSTs: start the record (`POST /api/regulatory/documents`, which is idempotent) and `advance {to:'in_review'}`. The confirm explains that the sender cannot review or approve. | Names nobody, sets no due date, creates no task, sends no notification. The two writes are not atomic. |
| Who may sign | `VaultLifecycle.tsx:257-275` `whoMaySign`; server `server/services/vault/vault-signing-posture.ts:46` `readOrgSigners` (exposed at `server/routes/c2c/project-vault.ts:1745`) | Lists members with signing authority, minus the uploader and the sender (and, for approval, the reviewer): "Not assigned to one person. Can sign the review: …". | This is eligibility, not assignment. |
| Routes | `server/routes/document-lifecycle.ts:403` `POST /` (start), `:461` `/:id/sign` (review only; `approved` is refused with `APPROVAL_IS_RECORDED_BY_ADVANCING`), `:537` `/:id/advance` (approval signs). `requireRole(AUTHOR)` on all of them. | Part 11: the one ceremony (`reverifySigner`), a binding digest, an `electronic_signatures` row, a chained audit row and a sealed trail event, all on one transaction under the record's row lock. | Nothing about assignment. |
| Separation of duties | `document-lifecycle.ts:235-260` `signingPrecheck` → `assertSignerIsNotAuthor` (the uploader and record creator are authors); `server/services/regulatory/vault-lifecycle-record.ts:125-145` `vaultApprovalRefusal` (FD4: the round's reviewer does not approve) | Enforced before the credential is asked for. | Knows only **one** reviewer: `review_signature.actor`. |
| Review round | `server/services/regulatory/canonicalDocumentStore.ts:82-97` `reviewSignatureRefusal`, `:297` `recordReviewSignature`; `migrations/20260731c_canonical_documents.sql:21-32` (`review_signature JSONB`, `approval_signature JSONB`, `organization_id INTEGER NOT NULL`) | **One** review sign-off per round, write-once. A second gets `SIGNATURE_ALREADY_RECORDED`. | Cannot hold two reviewers' sign-offs. |
| Board queue | `server/services/review/vault-review-queue.ts:1-20`, `:70-91`, `:103` | Lists `canonical_documents` in `in_review` with Vault sources. "mine" = I am an eligible signer. Every query is keyed by `organization_id`. | No assignee and no due date. |

### 1.5 QMS controlled documents

| Piece | Where | Today | Not |
|---|---|---|---|
| Send for review | `client/src/concept2cure/quality/SopRegister.tsx:224` → `qmsApproval.ts:118` `sendQmsDocumentForReview` → `PATCH /api/mdx/qms/documents/:id` (`server/routes/mdx-qms.ts:575`) → `updateControlledQmsDocument` (`server/services/qms/controlled-document-service.ts:142-175`) | A status change to `in_review` with a reason. Captures the authored content and moves the linked `authoring_documents` row to `IN_REVIEW`, all audited on one transaction. | Names nobody. No task, no notification, no due date, and no review signature. |
| Content | `qms_documents.authoring_document_id` (`controlled-document-service.ts:98`, `:123`) | A controlled document's text is an Authoring document. | — |
| Approval | `mdx-qms.ts:687` → `server/services/qms/document-approval-signature.ts:367` `approveQmsDocumentSigned`; SoD `:294-305` (author and contributors refused, `SELF_APPROVAL`); DB guard `migrations/20261001_qms_document_signature_required.sql` | One Part 11 approval by any signing-authority role, bound to the version digest. `effective` only in the transaction that writes the signature. | No named approver, no quorum, no reviewer-vs-approver check. |
| Signed review precedent | `POST /qms/documents/:id/periodic-review` (`mdx-qms.ts:505`, `docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md`) through `signGovernedAct` (`server/routes/governed-signed-act.ts`), meaning `review` (`REVIEW_ACT_MEANINGS`) | A signed `review` act on a QMS document exists for the version in force. | Not for a draft under review. |
| Notification target | `server/services/notifications/notification-record-target.ts:97`, `:137`; `notification-reference.ts:8` | Resolves a `qms_document` target. | Nothing emits one. |
| Plan already written | `docs/work-orders/MR-12-qms-controlled-document-control.md:253-275` (Stage 7), `:314` (NEW-4) | Plans a signed review act (`POST /qms/documents/:id/review`, type `qms-document-review`) and N-of-M approver routing "per document type", effective on the final signature. **Not built.** | This design completes Stage 7 steps 4–5 on the shared route below. It does not write a parallel plan. |

### 1.6 Duplicate review stores (outside Vault and QMS)

| Store | Where | Reached? | What it is |
|---|---|---|---|
| Phase-13 threads and review tasks | `server/routes/c2c/reviews.ts` (`concept2cure_review_threads`, `_thread_comments`, `_review_tasks`): `POST …/review-threads` `:266`, `POST …/review-tasks` `:1212`, `GET /reviews/my-queue` `:1749` | **Reads and resolve are reached**: `ReviewThreadsPane` (`surfaces/ReviewThreads.tsx:201-332`, always mounted by `Review.tsx:454`, `:782`) and `OpenWork.tsx:79` (the tray and Home). **Creation has no client caller.** One server writer: `server/services/ana-biostats/workflow-integrator.ts:271`, `:415`. | Discussion threads (a separate capability from assignment), plus a second review-task store. |
| P12 artifact reviewers | `server/routes/c2c/artifacts.ts:3513` (assign, with `dueDate`), `:3668`, `:3763` (withdraw), `:3899` (remind), `:3974` (decision), `:4158` (status); `concept2cure_review_assignments`; quorum `server/services/artifact-approval-act.ts` | **No client caller** for assignment. But its rows are read by the concept2cure artifact approval quorum and by about ten access and readiness readers (`project-access.ts`, `readiness-engine.ts`, `digest-access.ts`, `document-catalog-admission.ts`, …). | A third assignment store, with its own due date, withdrawal and reminder, for c2c artifacts. |
| Unified workflow store | `server/services/workflow/ApprovalOrchestrator.ts` (serial/parallel, delegate, over `document_workflows`/`unified_documents`); mounted `server/bootstrap/register-advanced-platform-routes.ts:215` `/api/approval-workflows` | **MDx only**: `services/programTabsService.ts:280`, `mdx/hooks/usePathwayTabsData.ts:217` (pending list, reject). Nothing at launch writes it (`TaskTray.tsx:26-31`). | A fourth routing engine. |
| Orchestration quorum gates | `server/routes/orchestration-checkpoints.ts:105-125`, `:267` (`approval_checkpoints`, written by the PDEV workflow bridge) | Reached by the Orchestration surface. | N-of-M distinct-approver quorum, **explicitly not a Part 11 signature**. Scoped by joining `workflow_runs`; it has no org column. |
| **Protocol reviewers** (not in the gap doc) | `server/routes/protocol-reviews.ts:116`; `server/services/protocol-reviews/protocol-reviews-service.ts:131` (`protocol_review_assignments`: `due_date`, role, disposition signature) | **Reached**: `ProtocolDevWrites.ts:310`, the request-a-review drawer. Inside the catalog (Authoring's `protocol-dev`, `shared/constants/launch-scope.ts:89-109`). | A fifth assignment store: due date, no task, no notification. Its QA follow-up already records that "nothing reassigns or withdraws an account-bound review" (`docs/evidence/QA-2026-10-08/followups-5/README.md:58-66`, `:185-188`). |

### 1.7 Deletions (re-verified)

- `server/jobs/periodicReview.js`: `85616c46f` (2026-08-02).
- `client/src/concept2cure/components/editor/ReviewerAssignment.tsx` and `SignatureWorkflow.tsx`: `e5a74a4df` (2026-06-02, #675), confirmed through the GitHub API.
- Review-board write routes: `b4eb62419` (2026-09-21). Its deleted tests were `review-change-request.test.ts` and `review-decision-delegate.test.ts`.
- `client/src/concept2cure/communication/surfaces/Approvals.tsx` and `ReviewQueue.tsx`: `2895218b8` (2026-08-04).
- Also found:
  - `server/services/ana-ri/governed-action-signoff.ts` (`204c11347`, the twin signing verifier);
  - the unsigned authoring-actions approve/lock routes (`7038fec50`);
  - `_archive/…/EnhancedApprovalWorkflow.jsx`, `SignoffDrawer.jsx`, `ApprovalsPanel.jsx` (`1c2a42848`).

  None of them is a routing capability to restore.

**What this adds up to.** Only one path gives a named person an assigned task with a due date, a reminder and a tray entry: `unified_tasks`, reached through Authoring. Vault and QMS each have correct Part 11 signatures and separation of duties, but no assignment. Five other stores each carry part of "assignment" (Phase-13 review tasks, P12 assignments, ApprovalOrchestrator, the `/submit` chain, protocol reviewers), and none of them reaches Vault or QMS.

---

## 2. The converged model

### 2.1 The store: `unified_tasks` wins. `authoring_reviews` is not generalised

**One review-assignment store and one task path:** a review or approval assignment is a `unified_tasks` row. The subject's own Part 11 signature closes it. Nothing else closes it.

Why `unified_tasks`, and not `authoring_reviews` generalised by subject type:

1. **It is already the task path, end to end.** Assignee FK with org-membership check, due date, state machine, `task.transition` ledger, the four notification categories, `taskDueSweep`, the tray and Home, named reassignment, soft-delete tombstones, and the dependency cascade. Authoring reviewers' tasks already live there.
2. **Tenant shape.** It is in `public` with `organization_id INTEGER`, under the integer tenant sweep. `authoring_reviews` is keyed `tenant_id` on the authoring-subsystem lineage, and its two creators disagree on `doc_id`. Generalising it means amending both creators in place (Rule 1) and re-keying a unique index that the migration header calls a security boundary.
3. **The verdict is not the assignment.** In Vault and QMS the reviewer's answer is a Part 11 signature, already stored in `electronic_signatures` and the record's own columns. What they lack is the assignment. In Authoring, the `authoring_reviews` row is a content-bound verdict over Authoring sections (`reviewed_snapshot_hash`). That binding is specific to Authoring and stays where it is.
4. **Sequential routing exists.** `task_dependencies` and `cascadeUnblockOnCompletionInTx` already block and unblock and notify. A store built on `authoring_reviews` would have to rebuild that.

So `authoring_reviews` stays as **Authoring's verdict record**. The assignment for all three subjects is the task. RR5 below removes Authoring's second assignment write: the client-side task create.

### 2.2 The migration (Rule 1)

One additive file, `migrations/20261023_unified_tasks_review_route.sql`, with a dated header. It goes into `C2C_MIGRATION_FILES` **immediately before `UUID_TENANT_ISOLATION_NONPUBLIC`** (at `8b58354af`, after `migrations/20261027_cdi_public_reference_seed.sql`), so the final pair stays last (`ci:migration-set-order`). It creates no table, so no RLS entry is needed: `unified_tasks` is already policed. It drops nothing.

```sql
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_route_id uuid;
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_role text
  CHECK (review_role IN ('reviewer','approver'));
-- Named, conditional on pg_constraint (no later file defines it; every existing row is NULL/NULL):
--   unified_tasks_review_route_pair_check CHECK ((review_route_id IS NULL) = (review_role IS NULL))
-- One live assignment per person per route, whatever the role: a person is a reviewer or an approver, not both.
CREATE UNIQUE INDEX IF NOT EXISTS unified_tasks_review_route_member_key
  ON public.unified_tasks (organization_id, review_route_id, assignee_id)
  WHERE review_route_id IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled';
CREATE INDEX IF NOT EXISTS unified_tasks_review_subject_idx
  ON public.unified_tasks (organization_id, source_entity_type, source_entity_id)
  WHERE review_route_id IS NOT NULL;
```

The same change adds the two columns to `shared/schema.ts`'s `unifiedTasks`. A partial index whose predicate admits only new rows cannot fail on existing data. The selftest shows `ci:migration-drop-safety` and `ci:migration-set-order` failing on a wrong placement before the file lands.

**What a route is.** A *route* is the set of live tasks sharing one `review_route_id` on one subject:

| `source_entity_type` | `source_entity_id` |
|---|---|
| `canonical_document` | a Vault version's lifecycle record, `canonical_id` |
| `qms_document` | `qms_documents.id` |
| `authoring_document` | existing |

- Each task carries `review_role`, `assignee_id`, `due_date` and `created_by_id` (the sender).
- **Order** is `task_dependencies`. Approver tasks are blocked by every reviewer task, always. Reviewers are parallel by default and chained in the sender's order when the sender chooses "one after another".
- **Who sent it and why**: one governed action row on the subject's target (`recordGovernedAction`, command `review-route.send`, payload `{routeId, reviewers, approvers, dueDate, order}`, the sender's reason).
- **Withdrawal and reassignment**: their own governed rows (§2.8).
- No route table is added. The route is reconstructed from its tasks and its ledger rows, and both are already tenant-keyed and audited.

**Service.** `server/services/review/review-route.ts` composes existing pieces only:

- `sendReviewRoute(tx, …)`;
- `routeStanding(q, {organizationId, subjectType, subjectId})`, which returns `{route: null | {routeId, sentBy, dueDate, reviewers[], approvers[]}, reviewComplete, approvalComplete}`;
- `closeRouteTaskOnSignature(tx, …)`;
- `withdrawRoute` and `reassignRouteMember`. `reassignRouteMember` composes `assignTask`'s mutation (`task-assignment.ts:206`) under the route's checks; it does not write a second handoff path.

Task creation moves out of `POST /api/tasks/tasks` (`taskManagement.routes.ts:243`) into `createTaskInTx` (`server/services/tasking/`), and that route then calls it: one create path, not two. Status moves go through `unifiedTaskService.updateTaskStatus` with `expectedStatus`, as `closeReviewTasksOnVerdict` already does. `closeReviewTasksOnVerdict` itself moves into this service in RR5.

### 2.3 Vault: "Send for review" names reviewers and a due date

- **Client.** `SendForReviewConfirm` (`VaultLifecycle.tsx:291`) becomes the route form:
  - reviewers (one or more), chosen from the server's signer list (`readOrgSigners` minus the uploader and the sender, the list `whoMaySign` already renders);
  - a due date (required);
  - "at the same time" or "one after another";
  - the governed reason;
  - an approver field, from RR2.

  The field components shared with `SendForReviewDialog.tsx` (`TaskFields`, `:363`) are extracted to one module and used by both. They are not copied.
- **Server.** `advance {to:'in_review'}` (`document-lifecycle.ts:537`) accepts `route: {reviewers, approvers?, dueDate, order, reason}`. On the transition's own transaction, under the record's row lock, `sendReviewRoute`:
  1. validates every member;
  2. writes the tasks: `task_type 'review'`/`'approval'`, title "Review {title} v{version}", `project_id` resolved by extending `projectForTaskSource` to `canonical_document` (via `vault.documents.program_id`);
  3. writes the ledger rows;
  4. returns the `task_assigned` notices, which are sent after commit.

  The start (`POST /`) stays separate and idempotent. The client's two calls become start, then one advance that carries the route. A refused route refuses the transition, and nothing is written.
- Without `route`, the advance is refused (`REVIEW_ROUTE_REQUIRED`) once RR1 ships. Records already `in_review` with no route keep today's "Not assigned to one person" rendering (§2.9).

### 2.4 QMS: send for review names reviewers and approvers

- `PATCH /qms/documents/:id {status:'in_review'}` (`controlled-document-service.ts:142`) accepts the same `route`, with reviewers and at least one approver both required. It writes the tasks on the transaction that already captures content (`source_entity_type 'qms_document'`).
- The register's send action (`SopRegister.tsx:224`) opens the shared route form.
- `sendQmsDocumentForReview` (`qmsApproval.ts:118`) carries `route`. It stays the one client call.

### 2.5 The signatures close the tasks

| Subject | Reviewer | Approver |
|---|---|---|
| Vault | `POST /api/regulatory/documents/:id/sign {meaning:'reviewed'}`. With a route: admitted only for a named reviewer with an open task (`ROUTE_NOT_NAMED` otherwise, before the credential). It writes their `electronic_signatures` row and trail event and closes **their** task on the same transaction. `canonical_documents.review_signature` is written **only by the sign-off that completes the review** (every named reviewer signed). So the column keeps its meaning, "this round's review is complete", and every reader of it stays correct (`vault-review-queue.ts:70`, `VaultLifecycle`, carryover). `reviewSignatureRefusal` admits one signature per named reviewer per round. | `advance {to:'approved'}` (one approver, RR1/RR2), and `/:id/sign {meaning:'approved'}` for each earlier approver when several are named (RR2; today it is refused with `APPROVAL_IS_RECORDED_BY_ADVANCING`, which stays the rule for a route with one approver). The stage moves only on the transaction of the last approval. |
| QMS | A new signed act, `POST /qms/documents/:id/review` (MR-12 Stage 7 step 4), through `signGovernedAct`, meaning `review`, type `qms-document-review`, bound to the same version digest as approval (`computeQmsDocumentContentDigest`). It closes the reviewer's task. | `approveQmsDocumentSigned` (`document-approval-signature.ts:367`). With a route: the signer must be a named approver with an open task, and every named reviewer must hold a `qms-document-review` signature on **the same digest**. It closes the approver's task. The document becomes `effective` only on the last named approver's transaction, so the `20261001` guard's "same transaction" rule holds unchanged. If it ever stops holding, amend that file in place (Rule 1). |
| Authoring | The verdict already closes the task (`closeReviewTasksOnVerdict`). Unchanged until RR5. | RR6: the APPROVER `/e-sign` closes the approver's task, and refuses while `canApprove` is false. |

**Ordering.** In every path the task rows are locked before the signature's ledger row takes the audit-chain lock. That is the order `closeReviewTasksOnVerdict` documents. Task ledger rows are written after the signature's row.

**No other path closes or moves a route task.**

- `PATCH /api/tasks/tasks/:id` (`taskManagement.routes.ts:419`), `PATCH /api/regulatory/tasks/:id/status` (`unifiedTasks.routes.ts:462`) and AnA's `update_task` all refuse `completed` (and `cancelled`) on a task with `review_route_id` (`ROUTE_TASK_CLOSED_BY_SIGNATURE`).
- `assignTask` (`task-assignment.ts:206`) refuses a route task (`ROUTE_TASK_REASSIGNED_BY_ROUTE`), whether named or workload-balanced. Route reassignment goes through `reassignRouteMember`.
- Route tasks are not `approval_required`, so `requireTaskSignoff` never offers a second signature for the same act.

### 2.6 Separation of duties: kept, and checked at assignment too

Kept as it is today:

- `assertSignerIsNotAuthor` (Vault; the uploader and record creator are authors);
- `vaultApprovalRefusal` (FD4);
- the QMS author and contributor refusal;
- `REVIEWER_IS_AUTHOR` (Authoring).

Added:

1. **At send**, refused with nothing written, each by name:
   - the author, uploader or sender named in any role;
   - a non-member, or a member of another organization (resolved by `organization_users` in SQL);
   - a member whose role lacks signing authority (`isSigningAuthorized`, the lesson of protocol-review `REVIEWER_CANNOT_SIGN`, 409);
   - the same person twice (the unique index is the backstop).
2. **At approval**, `vaultApprovalRefusal` and the QMS approval refuse a signer who signed **any** review of the round, not only `review_signature.actor`. This is a new refusal for QMS.
3. **At signing**, authority is re-checked as it is today. A member whose role was lowered after assignment is refused at the ceremony. Their assignment shows "cannot sign: role lacks signing authority", and the sender is offered reassignment (§2.8).

### 2.7 Notifications and reminders: the existing path and categories

| Event | Category | To |
|---|---|---|
| Route sent | `task_assigned` | each reviewer, and each approver (their task starts `blocked`) |
| A reviewer signs | `task_completed` | the sender |
| The last reviewer signs | `task_update` ("Unblocked: …", from the cascade) | each approver |
| An approver signs | `task_completed` | the sender |
| Withdrawal or reassignment | `task_update` | each removed member |
| Reassignment | `task_assigned` (`assignTask`'s own notice) | the new member |

- Reminders: `taskDueSweep`, unchanged, sends due-soon (48 h) and overdue once each to the assignee.
- No new category, no new scheduler, no `actionUrl` invented. The notice opens the task.
- RR1 adds the task drawer's link to the subject. First, under Rule 3, check `docs/design/TASK_DRAWER_HANDOFF_2026-10-14.md` and the Tasks surface for an existing subject link. I found none by `sourceEntityType`.

### 2.8 Reassignment and withdrawal (the open QA item)

- **Withdraw a route.**
  - Who: the sender or an org admin, with a governed reason.
  - What it does: on one transaction under the subject's row lock, every open task of the route moves to `cancelled` through the state machine (ledger rows), and one `review-route.withdraw` governed row is written.
  - Signatures already recorded stay. Part 11 records are never removed. A withdrawn route's signatures do not count toward a new route.
  - The subject stays where it is (`in_review`). It shows "No reviewers named: the route was withdrawn by {name} on {date}" until a new route is sent on the same record. For Vault that is `POST /:id/review-route`, the same validator.
- **Reassign one member.**
  - Who: the sender or an admin, with a reason.
  - What it does: moves that member's open task to the new member through `assignTask`'s audited handoff (`task-assignment.ts:206`: expected-version compare-and-set, ledger row, notice), keeping the task id, role, due date and dependencies. Before that, `reassignRouteMember` applies the send-time checks to the new member, under the subject's row lock.
  - A member who has already signed cannot be reassigned: their signature stands.
- **Effect on protocol review.** This answers the QA decision for protocol reviews too, once RR8 moves them onto routes.

### 2.9 Honest state

| State | What is shown |
|---|---|
| No route | "Not sent for review" or, for an in-review record from before RR1, "Not assigned to one person. Can sign: …", the existing sentence. |
| Route read failed | "Reviewers could not be read". Never "Not assigned" and never an empty list. |
| Route | Each named person: role, due date, open, signed with the time from the signature row, or cancelled. |

The tray, Home and the board degrade per source, as they do today.

### 2.10 The duplicate stores

| Store | Disposition | Reason / replacement |
|---|---|---|
| `/submit` chain, `authoring_workflow_steps` | **Migrated and deleted in RR6.** Removed: `POST /docs/:docId/submit`, the step logic in `advanceWorkflowForSignature`, `GET /docs/:docId/workflow`, the board's chain reads (`authoring-review-board.ts:264-304`), `Review.tsx:667`'s chain block, the "at my sign-off" read in `OpenWork.tsx:80-82`, and the demo pack call. | Replaced by route approver tasks: `review-route.ts`, the board's route rendering in `Review.tsx`, and the My work read in `OpenWork.tsx` (tray and Home). The **table** stays. Removing it means amending its creator in place (Rule 1), and it is left with a dated note instead. |
| Authoring client-side task create in `SendForReviewDialog.tsx:274` | **Migrated in RR5**: `request-review` writes the tasks on its own transaction. | Replacement: `requestAuthoringPeerReviews` + `sendReviewRoute`. `AssignReviewDialog.tsx`'s generic task create stays for non-review tasks. |
| Phase-13 review tasks (`c2c/reviews.ts:1212`, `concept2cure_review_tasks`) | **Creation route deleted in RR7.** Before that, confirm whether the `ana-biostats/workflow-integrator.ts` writer is reachable inside the catalog. If it is, it moves onto `createTaskInTx`. The Phase-13 group in `OpenWork.tsx` is removed with it. | Replacement: route and review tasks in `OpenWork.tsx`'s My work group (tray and Home). The threads and comments stay: discussion is a different capability, and it is reached. |
| P12 artifact reviewers (`artifacts.ts:3513-4158`) | **Left unreached, not extended.** | Its rows gate the c2c artifact approval act's quorum and about ten access and readiness readers. Converging the artifact act is a change across those readers and is not gap 4. Open question 3. |
| ApprovalOrchestrator, `/api/approval-workflows` | **Left, not extended.** | MDx pathway reads only. Nothing at launch writes it. Whether MDx's Approvals tab converges or goes is a catalog decision (open question 3). |
| Orchestration checkpoints | **Left.** | They gate workflow runs, not documents, and declare themselves not signatures. Their distinct-approver quorum is the precedent for §4's "no one counts twice". |
| Protocol reviewers (`protocol_review_assignments`) | **Converged in RR8**: assignment writes a route task, and the disposition signature closes it. The assignment table's own `due_date` is then read from the task. Columns are left in place with a note (Rule 1). | Replacement: `review-route.ts`. |
| `unified_tasks.approvers` and designated-approver enforcement | **Left as it is.** Routes do not use it: the routed approval is the subject's own signature. | Open question 6. |

---

## 3. Multi-signer routes

**Converge** the `/submit` chain onto the route. Do not reach it. Reaching it would put five defects in front of users, each of which the route already avoids:

1. identity by email;
2. authority by token role names instead of P-18;
3. parallel decisions under a `step_no` the board reads as sequential;
4. no due date, task or notification;
5. Authoring-only scope.

- **Sequential or parallel.** Reviewers are parallel by default. "One after another" chains the reviewer tasks in the order the sender listed. Approvers are always after every reviewer. Approvers among themselves are parallel; the order of approvals does not change the record.
- **The cascade.** `cascadeUnblockOnCompletionInTx` unblocks and notifies on the closing signature's transaction. A blocked task cannot be signed: the route refuses a signer whose task is `blocked` (`ROUTE_STEP_NOT_OPEN`).
- **Quorum.** The rule in §4, evaluated by `routeStanding` over live tasks and verified signatures, under the subject's row lock.
  - The review is complete when every named reviewer's task is closed by a signature on the current digest.
  - The approval is complete when every named approver's task is.
  - Content that changes under a route makes its signatures stale (the digest differs). That cannot happen on a Vault version, which is immutable. For QMS and Authoring the route is then withdrawn and sent again: the existing stale-content rule.

## 4. Decision NEW-4 (review quorum): recommendation for the coordinator to record

Made under the founder's delegation of 2026-10-07. Proposed as **P-46** (or the next free number).

1. **Send for review is not a signature.** It is a governed act with a stated reason and an audit row. The review is the reviewer's own Part 11 signature, meaning `review` (QMS gets the signed act MR-12 Stage 7 planned; Vault already has it).
2. **A route names at least one reviewer and at least one approver.** There is no route with nobody named. Vault's approver may be left unnamed only until RR2 ships: until then any eligible signer who is not excluded approves, as today.
3. **Every named reviewer must sign their review**, on the same content digest, before any approval is admitted. There is no N-of-M among reviewers.
4. **Approval needs every named approver**, each signing the same digest. The record moves (approved or effective) only in the transaction of the last approval.
5. **No one counts twice, and the approver is independent.** A person holds one role on a route. No approver is the author, a recorded contributor, the uploader, the sender, or any reviewer of the round. Every named person holds signing authority when named and again when signing.
6. **No default quorum below this, and no per-document-type configuration at launch.** A document type may later *raise* the minimum (for example "an SOP needs a QA approver"), never lower it. MR-12 Stage 7's "configurable per document type" is answered by this floor.
7. **Withdrawal and reassignment** are governed acts by the sender or an admin. Recorded signatures always stand. A withdrawn route's signatures do not count toward the next one.
8. **Not decided here:** NEW-4's first part, the word for retirement (MR-12 Stage 5), is not a routing question.

---

## 5. Slices

Each slice is red first, then green, with evidence in `docs/evidence/D2-REVIEW-ROUTING/<date>/RRn/`. Acceptance at 390×844 means: one column, 16 px gutters, no horizontal scroll, targets at least 44 px, the form fitting in the version row's expansion or a sheet. Desktop means 1440×900.

### RR1: Vault send-for-review with named reviewers and a due date, creating tasks and notifications

- **Files:**
  - `migrations/20261023_unified_tasks_review_route.sql`
  - `scripts/db/migration-set.mjs` (one entry)
  - `shared/schema.ts`
  - `server/services/tasking/create-task.ts` (`createTaskInTx`, extracted; `taskManagement.routes.ts:243` calls it)
  - `server/services/review/review-route.ts`
  - `server/services/tasking/task-project.ts` (`canonical_document`)
  - `server/routes/document-lifecycle.ts` (`advance` takes `route`; `/:id/sign` route-aware; per-reviewer sign-offs; `review_signature` on completion)
  - `server/services/regulatory/canonicalDocumentStore.ts` (`reviewSignatureRefusal` per named reviewer)
  - `server/services/regulatory/vault-lifecycle-record.ts` (approver ≠ any reviewer)
  - `server/routes/taskManagement.routes.ts`, `server/routes/unifiedTasks.routes.ts`, AnA `update_task` and `server/services/tasking/task-assignment.ts` (refuse closing or reassigning a route task)
  - `server/services/review/vault-review-queue.ts` (named reviewers, due date, "mine" = my open task)
  - `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx`
  - the extracted shared field module from `SendForReviewDialog.tsx`
  - the task drawer's subject link
- **Red first:**
  - pglite: an advance with a route of two reviewers writes two tasks (assignee, due date, `canonical_document`, `review_role`, one route id), one governed row and notices only after commit;
  - each of these refuses with nothing written: the uploader, the sender, a non-member, another org's user id, a member with no signing authority, a duplicate, a missing due date;
  - a named reviewer's sign closes only their task; the first of two sign-offs leaves `review_signature` null and approval refused; the second completes it;
  - an eligible signer who is not named is refused before the credential;
  - `PATCH /api/tasks/tasks/:id {status:'completed'}` and `{action:'assign'}` on a route task are each refused;
  - `runTaskDueSweep` notifies a route task due within 48 h;
  - `ci:migration-set-order` fails with the file after the sweep pair;
  - client: Send is disabled until a reviewer, a due date and a reason are given; the picker excludes the uploader and sender; the receipt names each reviewer's task; a refusal says nothing was sent;
  - the board shows "Reviewers could not be read" on a failed read, not "Not assigned".
- **Acceptance:** a sender names two reviewers and a due date on a Vault version.
  - Each reviewer sees a notification, a task in Tasks (the tray and Home), and the version in Review's "Awaiting my review" with its due date.
  - Each signs, and their task closes.
  - Approval is offered only after both have signed, to someone who is neither.
  - Same on 390×844 and desktop.

### RR2: Vault named approvers; one after another

- **Files:** `review-route.ts`, `document-lifecycle.ts` (`/:id/sign {meaning:'approved'}` admitted for a non-final named approver; `advance` for the last), `VaultLifecycle.tsx` (approver field, order choice), `vault-review-queue.ts` (`step 'approve'` for named approvers).
- **Red first:**
  - approver tasks start `blocked` and unblock with a `task_update` notice on the last review;
  - a blocked approver is refused;
  - with two approvers, the first leaves the stage `in_review` and the second approves and supersedes, as `supersedeOnVaultApproval` does today;
  - a reviewer named as approver is refused at send;
  - sequential reviewers: the second reviewer's task is blocked until the first signs.
- **Acceptance:** the approver gets a notification only when it is their turn, and the version is approved by the named approver alone. Both viewports.

### RR3: Reassign and withdraw

- **Files:** `review-route.ts` (`withdrawRoute`; `reassignRouteMember` composing `task-assignment.ts`'s mutation); `POST /api/regulatory/documents/:id/review-route/withdraw` and `…/reassign` on `document-lifecycle.ts`; `VaultLifecycle.tsx` (sender's controls; "cannot sign" marker; the roster from `readAssignableAccounts` narrowed to signers).
- **Red first:**
  - withdraw cancels every open task with ledger rows, keeps recorded signatures, and shows "withdrawn by … on …";
  - reassigning a signed member is refused;
  - reassignment keeps the task id, records the handoff through `assignTask`'s ledger row, and the new member gets `task_assigned`;
  - a new member without signing authority, or one who is an author or already on the route, is refused with nothing written;
  - someone other than the sender or an admin is refused;
  - a member whose role was lowered shows "cannot sign" and can be reassigned.
- **Acceptance:** QA's "nothing reassigns or withdraws" is closed for Vault. Both viewports.

### RR4: QMS route: named reviewers' signed review, named approvers

- **Files:**
  - `controlled-document-service.ts`
  - `server/routes/mdx-qms.ts` (`PATCH` takes `route`; new `POST /qms/documents/:id/review` through `signGovernedAct`; withdraw and reassign)
  - `document-approval-signature.ts` (named approver; every reviewer signed the same digest; approver ≠ reviewer; effective on the last)
  - `client/src/concept2cure/quality/qmsApproval.ts`
  - `SopRegister.tsx`
  - the shared route form
- **Red first** (MR-12 Stage 7's own list): with two approvers, one leaves it `in_review` and the second makes it effective; the same user cannot sign twice; the author cannot approve; approval is refused without every review signature on the same digest; the `20261001` guard still refuses `effective` without a same-transaction signature.
- **Acceptance:**
  - An SOP is sent to two reviewers and one approver.
  - Each sees the task and the notification.
  - The register shows who has signed and who is outstanding.
  - It becomes effective on the approver's signature.
  - Both viewports.

### RR5: Authoring request-review writes its tasks on its own transaction

- **Files:** `peer-review.ts` and `authoring.router.ts:3316` (`route` with due date; tasks via `sendReviewRoute`); `closeReviewTasksOnVerdict` moved into `review-route.ts`; `SendForReviewDialog.tsx` (the second write is removed, and the receipt reads the server's tasks).
- **Red first:** the request and its tasks commit together, or neither does; a refused reviewer writes no task; the dialog makes one request only.
- **Acceptance:** the "unknown task outcome" state no longer exists, because there is no second write. Both viewports.

### RR6: Authoring approvers on the route; the `/submit` chain is deleted

- **Files:** `authoring.router.ts` (`/e-sign` APPROVER needs a named approver and `canApprove`; closes the task); delete `/docs/:docId/submit`, `/docs/:docId/workflow` and the step logic in `advanceWorkflowForSignature`; `authoring-review-board.ts`, `Review.tsx`, `OpenWork.tsx` (chain reads → route); `biotech-authoring.mjs:113`; a dated note in `db/migrations/20260725_authoring_signatures_and_workflow.sql`.
- **Red first:** an APPROVER signature with a pending reviewer is refused; with two named approvers the document is approved on the second; a grep gate shows no reader of `authoring_workflow_steps` remains.
- **Acceptance:** the commit message names the replacement by path and the gate that proves it is reachable (working agreement). Both viewports.

### RR7: One inbox

- **Files:** `review-board-routes.ts`, `authoring-review-board.ts`, `vault-review-queue.ts` ("mine" = an open route task for every subject, with legacy rows unchanged); `OpenWork.tsx` (the Phase-13 group removed; the tray and Home follow); `c2c/reviews.ts:1212` (creation deleted, after the biostats writer check).
- **Acceptance:** "Awaiting my review", the tray and Home agree, for Authoring, Vault and QMS, on one source.

### RR8: Protocol reviewers on the route

- Converge `assignReviewerTx` onto `sendReviewRoute`, so the disposition signature closes the task.
- **Acceptance:** protocol reviewers get tasks, reminders and reassignment.

## 6. Risks

- **Part 11.**
  - A route task is closed only by its subject's signature, on that signature's transaction. The three generic status writers refuse it, and `assignTask` refuses to move it. A test covers each writer.
  - Signatures are never deleted or reassigned. Withdrawal cancels tasks, not records.
  - Every signature binds the content digest the route is about. A stale digest does not count.
  - `review_signature` changes from "the one sign-off" to "the sign-off that completed the round". Every reader is listed in RR1 and re-tested.
  - Lock order: subject row, then task rows, then the audit chain. A deadlock test runs two concurrent reviewer sign-offs.
  - AnA gets no path to send, sign, withdraw or reassign.
- **Tenant isolation.**
  - Every new query carries `organization_id = $n` in SQL, not only RLS: `routeStanding`, the member check (`organization_users` join), the task and signature reads, and the subject lock `(id, organization_id)`.
  - A route id is never looked up without its organization.
  - The unique index leads with `organization_id`.
  - One pglite test per route names another org's user and another org's subject and expects a refusal with nothing written.
  - No new table, so no new RLS surface. Confirm `unified_tasks` is under the integer sweep in RR1's evidence, by reading `pg_policies`.
- **Honest state.**
  - An assignment that could not be read is shown as unread, never as "no reviewers".
  - A legacy in-review record is labelled as unassigned, not given invented assignees.
  - A withdrawn route says who withdrew it and when.
  - Due and overdue come from the stored due date: `classifyDue` uses the server clock.
- **Partial migration.** Until RR6 and RR7 land, the Authoring board still reads two stores. Each slice states which store a screen reads.
- **Due-date semantics.** A date-only input stored as `timestamp` without time zone can read as overdue a day early or late (open question 5).

## Open questions

1. **What a Vault reviewer does to refuse.** The lifecycle has no "changes requested" act, and a Vault version is never edited. Withdrawal plus a new version is the only path today.
2. **Should Authoring reviewers sign** (Part 11 `review`) instead of recording a verdict, so that all three subjects have one review act?
3. **P12 artifact reviewers and MDx's ApprovalOrchestrator: converge or retire.** This is a catalog decision; this design leaves both unreached and unextended.
4. **Vault records already in review without a route:** grandfather them (recommended) or require a route before anyone signs.
5. **Due-date time zone:** end of day in the organization's time zone, or UTC.
6. **`unified_tasks.approvers` and designated-approver sign-off:** it still has no writer. Keep it or remove it (Rule 1: amend in place).
7. **Per-document-type minimums** (for example "a QA approver for SOPs") are deferred by NEW-4 item 6. Confirm.
