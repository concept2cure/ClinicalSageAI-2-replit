# Assigned review and approval routing: Vault and QMS join the review loop that exists (2026-10-23)

Gap 4 of `docs/design/VEEVA_GAP_2026-10-22.md`: *"converge Vault and QMS onto the review loop that exists"*. Launch row **D2** (launch catalog: Vault, QMS controlled documents, Authoring). Evidence goes under `docs/evidence/D2-REVIEW-ROUTING/<date>/`, one folder per slice, each with its red and green output.

**Veeva gives:** named reviewers and approvers, multi-signer routes, due dates, tasks, reminders and an inbox.

This is a design for **converging and completing** what exists. It adds no surface, module, AnA tool or notification category. It adds one route header table and five route columns on `unified_tasks`, and it removes three parallel review paths, each with its replacement named by path.

**History of this document**

| Date | Commit | What happened |
|---|---|---|
| 2026-10-23 | `202009d09` | Measured. |
| 2026-10-29 | `8b58354af` | Re-checked; committed at `33219c736`. |
| 2026-10-29 | after `33219c736` | **Revised** after two independent reviews (Part 11; product and architecture). Every finding and its disposition is listed in §8. Decision NEW-4 is recorded as decided (§4). |

File:line references are at `33219c736` unless stated.

**Three changes since `202009d09`:**

1. TaskTray's reads moved into `OpenWork.tsx`, which Home now shares.
2. The UI says "Tasks" where it said "My work". The read is still `/api/task-management/my-work`.
3. A named task reassignment path landed (`task-assignment.ts`, `2cc5ec6b1`).

**What the reviews changed:**

- A route now has its own **header record**.
- Every generic task writer is barred from route tasks.
- **Authority comes from the route record and verified signatures, never from task status.** The task is the person's inbox entry: a projection, not the source of truth.

---

## 1. What already exists

**Searches run**, by every name: `SendForReviewDialog`, `request-review`, `authoring_reviews`, `REVIEWER`, `review_requested`, `notifyTaskEvent`, `taskDueSweep`, `TaskTray`, `OpenWork`, `Awaiting my review`, `authoring_workflow_steps`, `/submit`, `approver_email`, `approvers`, `requireTaskSignoff`, `assignTask`, `TASK_TRANSITIONS`, `linkTasks`, `dependencies`, `document-lifecycle`, `review_signature`, `reviewSignature`, `VaultLifecycle`, `vault-review-queue`, `sendQmsDocumentForReview`, `in_review`, `approveQmsDocumentSigned`, `controlled-document-service`, `training-controlled-text`, `signGovernedAct`, `review-threads`, `review-tasks`, `my-queue`, `/reviewers`, `concept2cureReviewAssignments`, `ApprovalOrchestrator`, `approval-workflows`, `quorum`, `approval_checkpoints`, `protocol-reviews`, `reassign`, `withdraw`, `review_route`, `sourceEntityType`, `notification_preferences`, `SERVER_ONLY_NOTIFICATION_CATEGORIES`, `requireGovernedReason`. Locations: `server/`, `client/src/`, `shared/`, `migrations/`, `db/migrations/`, `scripts/` and `docs/`.

**Deletions searched** with `git log --all --diff-filter=D` on: `*periodicReview*`, `*ReviewerAssignment*`, `*SignatureWorkflow*`, `*Approvals.tsx`, `*ReviewQueue*`, `*review-board*`, `*ApprovalWorkflow*`, `*approvalWorkflow*`, `*ReviewRout*`, `*AssignReviewer*`, `*SendForReview*`, `*ApprovalRoute*`, `*review-assign*`, `*ReviewInbox*`, `*Inbox*`, `*ApprovalChain*`, `*WorkflowSteps*`, `*Quorum*`, `*Assign*`, `*Reminder*`, `*approval*`, `*signoff*`, `*ReviewTask*`. The clone is shallow, so `e5a74a4df` was confirmed through the GitHub API.

### 1.1 The Authoring loop: the one complete named-reviewer path

**Send for review dialog**
- Where: `client/src/concept2cure/v2/editor/SendForReviewDialog.tsx`.
  - Contract `:1-63`; `requestReview` `:250`; `createTasksFor` `:274`; component `:666`.
- Today:
  - It reads existing requests first and cannot re-ask a pending reviewer.
  - It requires a governed reason.
  - It withholds the author (`useReviewerRoster`, `AssignReviewDialog.tsx:115`).
  - It then makes **two separate writes**: the request, then one task per reviewer.
- Not:
  - The two writes are not atomic (`tasksSentence`, `:291`).
  - It has no approver field.

**Request route**
- Where: `server/routes/authoring.router.ts:3316` `POST /api/authoring/documents/:id/request-review` → `requestAuthoringPeerReviews` (`server/services/authoring/peer-review.ts:313`).
- Today, on one transaction:
  - one `authoring_reviews` row per reviewer;
  - one audited `review_requested` row;
  - the Reviewer grant (`grantRequestedReviewers`, `:3255`).
- It refuses the author and contributors (`peer-review.ts:122-133`).
- Not: no task, no notification, no due date, no approver.

**Verdict ledger**
- `authoring_reviews` is deployed by `db/migrations/20260730_authoring_subsystem_schema.sql:79-102` (`doc_id TEXT`, `tenant_id INTEGER`).
- An install-fresh copy is `migrations/20260728_authoring_reviews.sql` (`doc_id uuid` FK). It is off the applier on purpose (`scripts/db/migration-set.mjs:1103-1113`).
- Today: one row per reviewer per document, holding a status and a reviewed snapshot bound to the saved Authoring sections.
- Not:
  - no due date, no role and no round;
  - it is keyed by `tenant_id`;
  - its two creators disagree on `doc_id`'s type.

**Verdict closes the task**
- Where: `authoring.router.ts:3131` `closeReviewTasksOnVerdict`, used by `POST /documents/:id/review` (`:3221`).
- Today, on the verdict's own transaction, for **every** verdict, including `rejected` and `changes_requested`, it:
  - completes the reviewer's open `review` tasks;
  - cascades unblocking (`:3206`);
  - writes `task.transition` rows;
  - sends `task_completed`.
- A `blocked` task, or an approval-gated task, is left open (`:3179-3184`).
- Not: a negative verdict still completes the task and unblocks dependents. That is a defect once approvers depend on reviewers (finding B5).

**REVIEWER and APPROVER e-signatures**
- Where: `authoring.router.ts:852` `SIGNATURE_MEANINGS = ['AUTHOR','REVIEWER','APPROVER']`; `POST /docs/:docId/e-sign` (`:5070`); client `AuthoringFilingBar.tsx:179`.
- FD5(c) carry-over reuses them: `server/services/regulatory/authoring-approval-carryover.ts:222-233` (`independentSigners`: reviewer ≠ author, approver ≠ author, approver ≠ reviewer) and `:260` `carryAuthoringApproval`. That code advances through the orchestrator itself, not through the route handler (`:305-316`).
- Today: a Part 11 REVIEWER and APPROVER signature on an Authoring document. When the document is filed to the Vault, both are carried as the version's sign-offs.
- Not:
  - a REVIEWER signature closes no task;
  - `canApprove` (`peer-review.ts:174`, "every review current and approved") is computed and never enforced.

**Tasks**
- Where:
  - `unified_tasks` (`shared/schema.ts:7534`);
  - create: `server/routes/taskManagement.routes.ts:243` (`notifyNewAssignee` `:222-238`);
  - `unifiedTaskService.createUnifiedTask` (`server/services/unifiedTaskService.ts:148`), used by `POST /api/regulatory/tasks/unified` (`unifiedTasks.routes.ts:126`).
- Today: assignee FK checked for org membership, `due_date` (`timestamp`, no time zone), source entity, `task_type`, status, `approval_*`, `created_by_id`, `assignee_name`, soft delete. The table is `public` with `organization_id INTEGER`.
- Not: create cannot run on a caller's transaction.

**State machine**
- Where: `server/services/tasking/task-state-machine.ts:24-31` `TASK_TRANSITIONS`.
- Today it allows `completed→review/in-progress` (an audited reopen), `cancelled→pending` and `blocked→pending`.
- Not: it has no notion of a task owned by a route.

**Every generic writer of a task row**
- **Status and fields:**
  - `PATCH /api/tasks/tasks/:taskId` (`taskManagement.routes.ts:419`, update `:522`);
  - `PATCH /api/regulatory/tasks/:id/status` (`unifiedTasks.routes.ts:462` → `updateTaskStatus` `unifiedTaskService.ts:734`/`:801`);
  - AnA's task update (`server/services/ana-ri/command-executor.ts:1334`).
- **Assignment:**
  - `{action:'assign'}` → `assignTask` (`server/services/tasking/task-assignment.ts:206`, update `:189`);
  - `POST /tasks/auto-assign` (`:1200`).
- **Archive:** `DELETE /api/tasks/tasks/:taskId` (`:1542`, update `:1564`).
- **Links and dependencies:**
  - `POST /tasks/dependencies` (`:1017`, update `:1103`);
  - `POST /api/regulatory/tasks/:id/link` (`unifiedTasks.routes.ts:289` → `linkTasks` `unifiedTaskService.ts:289`, `:342`, `:348`);
  - the completion cascade (`task-side-effects.ts:110`, update `:222`).
- **Module sync:** `POST /api/regulatory/tasks/sync/:module` (`unifiedTasks.routes.ts:388` → `syncTasksFromModule` `:457`).
- **Other creators:**
  - bulk (`:715`, `:673`);
  - from-template (`:806`, `:886`);
  - AnA (`command-executor.ts:1033`);
  - the rules engine (`server/services/rules-engine/actions/index.ts:82`);
  - blueprint milestones (`server/services/tasking/blueprint-milestones.ts:61`).
- **Reminder markers:** `server/jobs/taskDueSweep.ts:100`.
- Today each of these writes any task it can admit.
- Not: none of them knows a route exists. A route task written by any of them would contradict the route (findings B1, M11).

**Reassignment**
- Where: `taskManagement.routes.ts:419-428` → `assignTask` `task-assignment.ts:206`. Roster: `:134`, `:142` (`taskBoard.routes.ts:537-539`).
- Today: a named handoff with a reason and an expected-version compare-and-set; a `task.assign` ledger row; a notice to the new assignee.
- Not:
  - it opens its own transaction;
  - it **does not clear `dueSoonNotifiedAt`/`overdueNotifiedAt`** (`:189`), so the new assignee never gets the reminders the old one already had.

**Notifications**
- Where: `task-side-effects.ts:22-46` `notifyTaskEvent`. Categories: `shared/constants/notifications.ts:2-16`. `SERVER_ONLY_NOTIFICATION_CATEGORIES` (`:26`) is `['ana_turn']` only.
- Target: `notification-record-target.ts:124-127` resolves a `unified_task` to the Tasks surface. Remind: `POST /api/tasks/tasks/:taskId/notify` (`taskManagement.routes.ts:1367`).
- Today: notices are sent after commit.
- Not:
  - `task_*` categories can be **created by a client or by AnA** (`mdx-notifications.ts:61`, `AnaToolExecutor.ts:10714`). Anyone could send a fake "task assigned" notice: a phishing vector (finding M4).
  - No target resolves a task to its subject, and there is no `canonical_document` target.

**Cascade and reminders**
- Where: `task-side-effects.ts:110` cascade; `unblockedNotice` (`:155`); `taskDueSweep.ts:128`. The sweep's statuses include `blocked` (`:169`). The due-soon window is 48 h (`:28`).
- Today: unblocking happens on completion. The assignee is reminded once at due-soon and once at overdue.
- Not:
  - a blocked task is swept and nags someone who cannot act;
  - the sender is never reminded.

**Time zone**
- Where: `notification_preferences.timezone` (`migrations/0000_sweet_joseph.sql:4105-4130`, default `'UTC'`; served from `server/bootstrap/register-platform-routes.ts`).
- Today: a per-user time zone.
- Not: no due date uses it.

**Tray and Home**
- Where: `TaskTray.tsx:14-39`; reads in `OpenWork.tsx:77-82` (shared with `surfaces/HomeSections.tsx:198`); `server/services/tasking/my-work.ts:51-104` (it counts `blocked` as open and triages it).
- Today: My work, the Phase-13 queue, approvals at my sign-off, and notices. Each source fails on its own.
- Not: no Vault or QMS assignment appears.

**Review board**
- Where: `Review.tsx:76-80` (scopes `mine`, `requested` "Requested by me", `all`), `:667` (the chain); `review-board-routes.ts:95`, `:150-154`; `authoring-review-board.ts:20-30`, `:616`.
- Today, "mine" means one of:
  - a pending `authoring_reviews` row names me;
  - the current chain step's email is mine;
  - I am an eligible Vault signer.
- Not: no due date (`OpenWork.tsx:53-55`).

**Task project and links**
- Where: `task-project.ts:35-49`; `taskTarget.ts:22`.
- Today: `authoring_document` tasks get a project. A task opens by id.
- Not: no other source type, and no link from a task to its subject.

**Governed reason**
- Where: `server/routes/governed-reason.ts:30` `requireGovernedReason`, with `REASON_REQUIRED` as used at `ana-skills.ts:164`.
- Today: the reason floor and ceiling.
- Not: no review act uses it.

### 1.2 The `/submit` chain (`authoring_workflow_steps`)

- **Created** by `submitReviewWorkflow` (`authoring.router.ts:6665`), behind `POST /docs/:docId/submit` (`:6699`). **Read** by `GET /docs/:docId/workflow` (`:6731`). The table is created by `db/migrations/20260725_authoring_signatures_and_workflow.sql`.
- **Advanced** by `advanceWorkflowForSignature` (`:7072`), from `POST /docs/:docId/sign` (`:7157`, call at `:7256`). It is not advanced by `/e-sign`.
  - It matches **any** pending step for the signer's email (`:7097`).
  - Authority comes from the token role names `QA`/`RA_CMC`.
  - Approve and freeze run when no step is left pending (`:7123-7142`).
- **No client caller** for `/submit` or `/sign`. The only caller is the demo pack (`scripts/demo/launch-demo/packs/biotech-authoring.mjs:113`). `/sign`'s ceremony evidence is `docs/evidence/D5/2026-10-01-sign-ceremony-approval-stamps/README.md`.
- **Read** by `authoring-review-board.ts:264-304`, `Review.tsx:667` and `OpenWork.tsx:80-82`.

### 1.3 `unified_tasks.approvers` and task sign-off

- `task-signoff.ts:130` `requireTaskSignoff`.
- `:170-180`: the designated-approver branch, which applies only when `approvers` is populated.
- `approvers` is `json` (`shared/schema.ts:7592`) and **has no writer** (`:163-168`). The branch is therefore unreachable.

### 1.4 Vault lifecycle

**Send for review**
- `VaultLifecycle.tsx:160-168` makes two client POSTs: start, then `advance {to:'in_review'}`.
- `SendForReviewConfirm` is at `:291-310`, and `VersionLifecycleActions` at `:394` (mounted at `VaultVersions.tsx:333`).

**Step and eligibility**
- `stepOf` (`:212`) and `nextStep` (`:230`) read `lifecycle.review`.
- `whoMaySign` (`:257-275`) gives "Not assigned to one person. Can …", from `readOrgSigners` (`vault-signing-posture.ts:46`, at `project-vault.ts:1745`).

**Routes** (all under `requireRole(AUTHOR)`)
- `document-lifecycle.ts:403` start.
- `:461` `/:id/sign`, for the review only. `approved` is refused with `APPROVAL_IS_RECORDED_BY_ADVANCING` (`:486`).
- `:537` `/:id/advance`, where approval signs.

**Transitions** (`shared/regulatory/document-lifecycle.ts:188-195`)
- `in_review → approved | authoring | withdrawn`.
- The gate refuses `in_review→approved` without a review sign-off over the current content (`REVIEW_SIGNOFF_REQUIRED`, `:217`; `reviewCoversContent` `:244`).
- `in_review→authoring` drops `reviewSignature` (`documentLifecycleOrchestrator.ts:235-239`, "a request for revision ends this review round").

**Separation of duties**
- `signingPrecheck` → `assertSignerIsNotAuthor` (`document-lifecycle.ts:235-260`).
- `vaultApprovalRefusal` (`vault-lifecycle-record.ts:125-145`; the reviewer check is at `:130`).

**Review round**
- `reviewSignatureRefusal` (`canonicalDocumentStore.ts:82-97`) and `recordReviewSignature` (`:297`).
- `review_signature` is a single JSONB (`migrations/20260731c_canonical_documents.sql:21-32`).

**Readers of `review_signature`**
- `server/services/vault/vault-lifecycle.ts:263-336` (the lifecycle read and its manifestation, `:277`, `:285`, `:298`, `:332`).
- `vault-review-queue.ts:64-74`.
- `vault-lifecycle-record.ts:130`.
- `documentLifecycleOrchestrator.ts:129`, `:239`.
- `shared/regulatory/document-lifecycle.ts:217`, `:244`.
- `authoring-approval-carryover.ts` (it writes the carried review).
- `VaultLifecycle.tsx` `stepOf`/`nextStep`/`whoMaySign` (`:212-275`).
- `server/routes/c2c/artifacts.ts:2028` `reviewSignatureSummary`. Checked: it summarises c2c *artifact* signatures, not `canonical_documents.review_signature`. It is listed so the inventory is complete, and it is not changed.

**Signatures table**
- `electronic_signatures` (`shared/schema.ts:1964`): `id serial`, `organization_id` **nullable** (`:2025`), `signed_target`, `signature_type`, `signer_id`, `signer_name`, `signature_meaning`, `signed_at`, `bound_payload_digest`, and supersession columns.

### 1.5 QMS controlled documents

**Send for review**
- `SopRegister.tsx:224` → `qmsApproval.ts:118` → `PATCH /api/mdx/qms/documents/:id` (`mdx-qms.ts:575`) → `updateControlledQmsDocument` (`controlled-document-service.ts:142-175`).
- Today: a status change with a reason. Only a `draft` may be sent (`:155`).

**Demotion to draft**
- `server/services/qms/training-controlled-text.ts:48-58`: saving controlled text on a legacy (non-Authoring) document sets `status='draft'` from `in_review` too. That is an exit from review that nothing announces.

**No return**
- No act returns an `in_review` document to `draft`.

**Approval**
- `mdx-qms.ts:687` → `approveQmsDocumentSigned` (`document-approval-signature.ts:367`).
- Admissible only from `in_review` (`APPROVABLE_STATES`, `:129`).
- Separation of duties: `:294-305`.
- Guard: `migrations/20261001_qms_document_signature_required.sql`.

**Retirement**
- `retireQmsDocumentSigned` (`:545`) admits any document that is not already retired (`:484`), so an `in_review` document can be retired. That is another exit from review.

**The signing ceremony**
- `signGovernedAct` (`server/routes/governed-signed-act.ts:185`).
- It checks authority and reverifies the signer **before** it opens the transaction. Then, on one transaction, it runs `act.run` (the domain write), the ledger pair and `persistGovernedSignSignature`, and commits.
- `SignedAct` (`:105-126`) has **no hook before the credential and no hook after the signature row**, so a task cannot cite the signature's id.

**Periodic review**
- `POST /qms/documents/:id/periodic-review` (`mdx-qms.ts:505`) is a signed `review` act through `signGovernedAct`.

**Roles**
- `shared/constants/org-roles.ts:33` `ASSIGNABLE_ORG_ROLES = admin, approver, manager, reviewer, member, viewer`. **There is no quality role or designation** (finding D-Q).

**Plan**
- MR-12 Stage 7 (`docs/work-orders/MR-12-qms-controlled-document-control.md:253-275`, NEW-4 at `:314`) is not built.

### 1.6 Duplicate review stores

| Store | Where | Reached? |
|---|---|---|
| Phase-13 threads and review tasks | `server/routes/c2c/reviews.ts`: create threads `:266`, create tasks `:1212`, my-queue `:1749` | Reads and resolve are reached (`ReviewThreads.tsx:201-332`, `Review.tsx:454`, `:782`, `OpenWork.tsx:79`). Creation has no client caller. Its one writer is `ana-biostats/workflow-integrator.ts:271`, `:415`. |
| P12 artifact reviewers | `c2c/artifacts.ts:3513-4158`, `concept2cure_review_assignments`, `artifact-approval-act.ts` | Assignment has no client caller. Its rows are read by about ten access and readiness readers. |
| Unified workflow store | `ApprovalOrchestrator.ts`; `/api/approval-workflows` (`register-advanced-platform-routes.ts:215`) | MDx only (`programTabsService.ts:280`, `usePathwayTabsData.ts:217`). |
| Orchestration quorum gates | `orchestration-checkpoints.ts:105-125`, `:267` | Reached. They are explicitly not signatures. |
| Protocol reviewers | `protocol-reviews.ts:116`, `protocol-reviews-service.ts:131` | Reached (`ProtocolDevWrites.ts:310`). Open QA item: `docs/evidence/QA-2026-10-08/followups-5/README.md:58-66`, `:185-188`. |

### 1.7 Deletions (re-verified)

- `server/jobs/periodicReview.js`: `85616c46f`.
- `ReviewerAssignment.tsx` and `SignatureWorkflow.tsx`: `e5a74a4df` (via the GitHub API).
- The review-board write routes: `b4eb62419`. They included a change-request route and a delegate route (`review-change-request.test.ts`, `review-decision-delegate.test.ts`), which is why §2.10 specifies "hand back" and adding a reviewer.
- `Approvals.tsx` and `ReviewQueue.tsx`: `2895218b8`.
- Also deleted, and none of them to be restored:
  - `governed-action-signoff.ts` (`204c11347`);
  - the unsigned approve and lock routes (`7038fec50`);
  - `_archive/…` (`1c2a42848`).

---

## 2. The converged model

### 2.1 Where each fact lives

| Fact | Store | Written only by |
|---|---|---|
| A route exists, its subject, round, sender, order, due dates and status | `public.review_routes` (new header, §2.2) | `server/services/review/review-route.ts` |
| Who is named, in which role and step, and the printed name at naming | the route's member rows: `unified_tasks` rows carrying `review_route_id` | `review-route.ts` only (§2.3) |
| What each member did | their `electronic_signatures` row (review or approval), or their governed act (return or hand-back), **stamped on their member row** | the signing transaction, or the act's transaction |
| The naming history (send, reassign, add, withdraw, return) | governed action rows on the **subject's** target (`recordGovernedAction`) | `review-route.ts` |
| What the person sees in Tasks | the same member row, as a task | a projection of the above |

**Why `unified_tasks`**, and not `authoring_reviews` generalised:

1. It is already the inbox: assignee, due date, reminders, the tray and Home, and reassignment.
2. It is `public` with `organization_id INTEGER`. `authoring_reviews` is `tenant_id`-keyed and has two creators that disagree on `doc_id`.
3. In Vault and QMS the verdict is a Part 11 signature that already has its store.
4. Authoring's content-bound verdict stays in `authoring_reviews`.

**What is never decided from task `status`:**
- membership;
- whether a step is open;
- whether the review is complete;
- whether the approval is complete.

`routeStanding` computes all four from the header, the member rows' identity columns, and **verified** signatures. Task status is written by `review-route.ts` to match, for display only.

### 2.2 The migration (Rule 1)

One file, `migrations/20261023_review_routes.sql`. It goes into `C2C_MIGRATION_FILES` **immediately before `UUID_TENANT_ISOLATION_NONPUBLIC`**: at `33219c736`, after `migrations/20261027_cdi_public_reference_seed.sql`. It is a new `public` table with `organization_id INTEGER NOT NULL`, so the integer sweep that runs last polices it.

The dated header says so. It also says that **every `IF NOT EXISTS` object freezes once deployed**: a later change to a column, index or constraint is made by amending this file in place with a dated note and an explicit, conditional `ALTER`. It is never made by editing the `CREATE` and expecting a replay to apply it.

```sql
CREATE TABLE IF NOT EXISTS public.review_routes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    integer NOT NULL,
  subject_type       text NOT NULL,            -- 'canonical_document' | 'qms_document' | 'authoring_document'
  subject_id         text NOT NULL,
  round              integer NOT NULL,         -- 1 + routes previously sent on this subject (ordinal; SoD does not use it)
  sender_id          integer NOT NULL,
  sender_name        text NOT NULL,            -- printed name at sending
  review_order       text NOT NULL,            -- 'parallel' | 'sequential'
  review_due_at      timestamptz,              -- NULL when no reviewers (QMS may name none)
  reviewer_step_due_at timestamptz[],          -- per step, sequential order only
  approval_due_at    timestamptz NOT NULL,
  content_digest     text NOT NULL,            -- the digest the route is about
  status             text NOT NULL DEFAULT 'open',
  status_reason      text,
  status_by          integer,
  status_at          timestamptz,
  sender_overdue_notified_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- Each constraint below in its own named, conditional DO block (pg_constraint lookup), never inline:
--   review_routes_subject_type_check   CHECK (subject_type IN (...))
--   review_routes_order_check          CHECK (review_order IN ('parallel','sequential'))
--   review_routes_status_check         CHECK (status IN ('open','withdrawn','returned','complete'))
--   review_routes_closed_has_actor     CHECK (status = 'open' OR (status_by IS NOT NULL AND status_at IS NOT NULL))
CREATE UNIQUE INDEX IF NOT EXISTS review_routes_one_open_per_subject
  ON public.review_routes (organization_id, subject_type, subject_id) WHERE status = 'open';

ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_route_id uuid;
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_role text;
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS review_step integer;
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS route_signature_id integer;     -- electronic_signatures.id
ALTER TABLE public.unified_tasks ADD COLUMN IF NOT EXISTS route_act_id text;              -- c2c_ana_actions id of a return or hand-back
-- Named conditional constraints, each its own DO block:
--   unified_tasks_review_route_fk        FOREIGN KEY (review_route_id) REFERENCES review_routes(id)
--   unified_tasks_review_role_check      CHECK (review_role IS NULL OR review_role IN ('reviewer','approver'))
--   unified_tasks_review_route_pair      CHECK ((review_route_id IS NULL) = (review_role IS NULL))
--   unified_tasks_route_task_assignee    CHECK (review_route_id IS NULL OR assignee_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS unified_tasks_review_route_member_key
  ON public.unified_tasks (organization_id, review_route_id, assignee_id) WHERE review_route_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tasks_review_subject_idx
  ON public.unified_tasks (organization_id, review_route_id) WHERE review_route_id IS NOT NULL;
```

**The backstop trigger.** The same file adds a trigger, `unified_tasks_route_rows_guard`: `CREATE OR REPLACE FUNCTION`, then `DROP TRIGGER IF EXISTS` and `CREATE TRIGGER`. This is replay-safe, following the precedent of the `20261001` guard. It refuses:

- an INSERT, UPDATE or DELETE that sets, changes or touches a route row's `status`, `assignee_id`, `deleted_at`, `blocked_by`, `due_date`, `dependencies` or `review_*`/`route_*` columns;
- an INSERT into `task_dependencies` naming a route task;

…unless the transaction has set `SET LOCAL c2c.review_route_writer = 'on'`. Only `review-route.ts` sets it. `metadata` stays writable, so the sweep can write its markers. This is the database half of finding B1. The code half is §2.3.

The same change adds the columns to `shared/schema.ts`.

**Proof the gates fail first:**
- `ci:migration-set-order` fails with the file placed after the final pair.
- `ci:migration-drop-safety` fails on a narrowed constraint.

Both are shown before the file lands.

### 2.3 One guard for every generic writer (B1)

`server/services/tasking/task-state-machine.ts` gains:
- `isRouteTask(row)`, true when `review_route_id` is not null;
- `refuseRouteTaskWrite(row, writer)`, which throws `RouteTaskWriteRefused` (409 `ROUTE_TASK_OWNED_BY_ROUTE`): "This task belongs to a review route. Use the route's actions on the document. Nothing was changed."

**Every writer in §1.1's inventory calls it** after it reads the row and before it writes:

- the status writers;
- assignment and auto-assign;
- archive;
- dependencies and link (either end being a route task);
- the cascade (which skips a route task as a dependent);
- module sync;
- AnA's update.

The reminder sweep writes markers only and is exempt. The remind route (`POST /tasks/:id/notify`) writes nothing on the row and is allowed, for the sender and admins.

The five create paths, plus `createUnifiedTask`, **cannot set the route columns**: their input schemas do not admit them, and the trigger refuses them without the session setting.

`review-route.ts` writes route rows through its own functions, which set the session setting:
- `createTaskInTx` (extracted from `taskManagement.routes.ts:243`, which then calls it);
- `assignTaskInTx` (extracted from `task-assignment.ts:206`, which then calls it).

**Red tests, one per writer** (RR1a):
- PATCH status;
- PATCH assign;
- auto-assign;
- DELETE;
- dependencies;
- link from each end;
- regulatory status;
- sync;
- AnA update;
- cascade skip;
- the trigger refusing a raw `UPDATE` from the app role without the setting.

Plus one per create path (bulk, from-template, `createUnifiedTask`/`POST /unified`, AnA create, rules engine, blueprint milestones), each trying to set `review_route_id` and being refused.

### 2.4 `routeStanding`

`routeStanding(q, {organizationId, subjectType, subjectId})` returns exactly one of the states below. It **throws on a read failure** and never returns "none" for "unknown". Every statement carries `organization_id = $n`.

| State | Stored condition | Who may sign |
|---|---|---|
| `none` | no `review_routes` row, and the subject is not in review | nobody (nothing to sign) |
| `legacy` | no `review_routes` row, and the subject is in review (it entered review before its subject's cutover, §2.13) | as today: any eligible signer who is not excluded |
| `live` | the latest route is `open` | only named members whose step is open (§3) |
| `withdrawn` | the latest route is `withdrawn` and the subject is still in review | **nobody**: every signature is refused with `ROUTE_WITHDRAWN` until a new route is sent. It never falls back to "any eligible signer". |
| `returned` | the latest route is `returned` | nobody: the subject has left review (§2.9) |
| `complete` | the latest route is `complete` | nobody: the approval is recorded |

For `live`, it also returns each member, with:
- role, step and printed name at naming;
- `outcome`: `pending`, `signed` (a verified signature), `returned` or `handed back` (an act);
- `stepOpen`;
- plus `reviewComplete` and `approvalComplete`.

**Verified signature** means all of the following hold for the `electronic_signatures` row stamped on the member row:
- `organization_id = $n`;
- `signed_target` is the subject;
- `signer_id` is the member's assignee;
- `bound_payload_digest` is the route's `content_digest`;
- the meaning is the role's;
- it is not withdrawn (`isSignatureWithdrawn`).

A signature that is not stamped on **this route's** member row does not count (B3).

### 2.5 One member validator (B9)

`validateRouteMember(tx, {organizationId, subject, role, candidateId, actorId})` is used **at send, at adding a member, and at reassignment**. It refuses, in this order, each with nothing written:

1. **Not active, or not a member of this organization**: `organization_users` joined in SQL on `organization_id`.
2. **No signing authority** (`isSigningAuthorized`, the persisted membership role): 409 `MEMBER_CANNOT_SIGN`.
3. **No access to the subject's project.** The project comes from `readProgramAnchorRow(q, {programId, orgId})` (`server/services/c2c/program-project-anchor.ts:348`; its query is keyed on `organization_id`). Access is decided by the same admission `assignTask` uses (`canAccessReportProject`).
4. **Separation of duties, over the stage round.** The stage round is every signature on this version's digest, whichever route it was made on, and the route is used only for quorum. The candidate is refused if they are any of:
   - the author;
   - a recorded contributor (`resolveTargetAuthors`, at send **and** at reassignment);
   - the uploader;
   - the sender;
   - for an approver, anyone with a review signature on this subject's `content_digest` from **any** route, including a withdrawn one;
   - **the actor doing the reassigning**.
5. **Already on this route in any role.** The unique index is the backstop.

**Red test:** a reviewer who signed on a withdrawn route and is then named as approver on the next route is refused.

### 2.6 Vault: sending names reviewers, an approver and due dates

**Client.** `SendForReviewConfirm` (`VaultLifecycle.tsx:291`) becomes the route form:
- reviewers (one or more), from the server's signer list;
- **one or more approvers** (NEW-4: at least one);
- review and approval due dates;
- the order ("at the same time" or "one after another", with a due date per step when one after another);
- the reason.

The field components are extracted from `SendForReviewDialog.tsx` (`TaskFields`, `:363`) into one shared module. They are not copied.

**Server.** `advance {to:'in_review', route}` (`document-lifecycle.ts:537`). On the transition's transaction, under the record's row lock:
1. the reason (`requireGovernedReason`; missing gives `REASON_REQUIRED`, nothing written);
2. `validateRouteMember` for each person;
3. the header (`content_digest` = the version's hash);
4. the member rows (open-step reviewers `pending`, later steps and approvers `blocked`);
5. one `review-route.send` governed row on the subject, carrying the route id and each person's id, role, step and **printed name at naming**;
6. `task_assigned` notices to the open-step members only, sent after commit.

The start (`POST /`) stays idempotent and separate.

**`REVIEW_ROUTE_REQUIRED`** lives in the **route handler**, `document-lifecycle.ts`, and not in the orchestrator. So the FD5(c) carry-over, which calls `advanceDocument` directly (`authoring-approval-carryover.ts:305-316`), is unaffected. It is an explicit exemption and renders "carried from Authoring" (§2.13). The handler enforces it from RR1b, the slice that ships the form.

### 2.7 QMS: sending names at least one approver

`PATCH /qms/documents/:id {status:'in_review', route}` (`controlled-document-service.ts:142`) takes the same `route`.

Under NEW-4 (§4):
- **at least one approver, who holds the quality designation**;
- **zero or more reviewers**.

It writes the header and member rows on the transaction that already captures content. The register (`SopRegister.tsx:224`) uses the shared form. `sendQmsDocumentForReview` (`qmsApproval.ts:118`) carries `route` and stays the one client call.

### 2.8 Signatures close tasks and are bound to the route (B3, B7, B8)

**Vault: one endpoint for every routed sign-off.** `POST /api/regulatory/documents/:id/sign` with `{meaning:'reviewed'|'approved'}`. Every step below runs on one transaction under the record's row lock.

1. **Before the credential:**
   - `routeStanding` is `live`;
   - the signer is a named member in that role;
   - their step is open;
   - for approval, `reviewComplete`.

   Otherwise it refuses with `ROUTE_NOT_NAMED`, `ROUTE_STEP_NOT_OPEN`, `ROUTE_WITHDRAWN` or `REVIEW_INCOMPLETE`.
2. The ceremony, the `electronic_signatures` row (payload includes `routeId`) and the trail event.
3. `closeRouteTaskOnSignature` stamps `route_signature_id` on the member row, moves the task to `completed`, and writes a `task.transition` row citing `esig:<id>`.
4. **Review completion.** When this signature completes the review, `review_signature` is written, so the gate (`REVIEW_SIGNOFF_REQUIRED`) and every existing reader keep their meaning. The approvers' rows move from `blocked` to `pending`, and they get `task_update` "It is your turn".
5. **Approval completion.** When this signature completes the approval, the **server** advances `in_review → approved` on the same transaction, with the orchestrator's existing effects (supersession), and sets the route `complete`.

The `/advance {to:'approved'}` route **refuses a routed record** (`ROUTE_APPROVAL_BY_SIGN`). A `legacy` record keeps today's `/advance` path. `APPROVAL_IS_RECORDED_BY_ADVANCING` remains only for `legacy`.

**Changes to `reviewSignatureRefusal`.** It admits one review signature per named reviewer on a live route, and keeps refusing a second signature by the same person.

**QMS: `signGovernedAct` gains two optional hooks** on `SignedAct` (`governed-signed-act.ts:105-126`):
- `precheck(client, orgId, userId)`, run **before** the signing authority check and reverification. It reads `routeStanding` and the member's step, and refuses with the same codes.
- `afterSign(client, signature)`, run on the same transaction **after** `persistGovernedSignSignature` and before `COMMIT`. It stamps `route_signature_id` and writes the task-close row citing `esig:<id>`.

`run` locks `qms_documents` `FOR UPDATE`, re-checks what `precheck` read (the lock is the authority; the precheck only spares a credential check), and writes the domain change.

The signed acts on QMS:
- **`POST /qms/documents/:id/review`**: meaning `review`, type `qms-document-review`, MR-12 Stage 7 step 4.
- **Approval** (`approveQmsDocumentSigned`), on a routed document:
  - the signer is a named approver with the quality designation;
  - every named reviewer, if any, has a verified review signature;
  - `effective` only on the last approver's transaction, so the `20261001` guard holds.

**Test: the review digest equals the approval digest** (`computeQmsDocumentContentDigest`). If they ever differ, the approval is refused.

**Authoring (RR5/RR6).**
- A reviewer's route task closes on the **existing REVIEWER e-sign** (`authoring.router.ts:852`, `/e-sign` `:5070`), the act FD5(c) already carries.
- An approver's route task closes on APPROVER.
- `closeReviewTasksOnVerdict` keeps closing the task on an `approved` verdict. It **no longer closes or cascades on `rejected`/`changes_requested`**: those return the route (§2.9). It keeps leaving `blocked` tasks alone (`:3182-3184`).

### 2.9 Every exit from review cancels the route; "Return for revision" (B4, B5)

**Return for revision.** A governed act with a reason. It is not a signature.
- Who: a named member whose step is open, or the sender.
- Vault: `POST /api/regulatory/documents/:id/review-route/return`. QMS: `POST /qms/documents/:id/return`.
- On one transaction:
  - moves Vault `in_review → authoring` (the existing transition, which clears `review_signature`, `documentLifecycleOrchestrator.ts:235-239`) or QMS `in_review → draft` (new);
  - sets the route `returned` with the reason;
  - stamps the member's `route_act_id`;
  - cancels every other member row;
  - writes `review-route.return` on the subject;
  - notifies the sender (`task_update`).
- A member who returned the document cannot be reassigned.
- Each member's disposition is read from their signature or act, never from their task status.

**Every exit and what it does to an open route:**

| Exit | Route becomes | Same transaction |
|---|---|---|
| Vault `in_review→approved` (last approval) | `complete` | yes (§2.8) |
| Vault `in_review→authoring` (Return, or an `/advance` to authoring) | `returned` with the act's reason, or `withdrawn` with the advance's reason | yes |
| Vault `in_review→withdrawn` | `withdrawn` | yes |
| Vault check-in of a newer version, so this one is no longer current (`vault-version-checkin.ts`) | `withdrawn`, reason "superseded by version N" | yes, on the check-in |
| QMS `in_review→effective` (last approval) | `complete` | yes |
| QMS Return (new `in_review→draft`) | `returned` | yes |
| QMS controlled-text save on an `in_review` legacy document (`training-controlled-text.ts:48-58`) | **refused** while a route is open (`QMS_ROUTE_OPEN`, "Return it for revision first") | — |
| QMS edit of an Authoring-backed document's sections while in review | **refused** while a route is open (checked on the authoring save path; RR4 confirms where) | — |
| QMS `in_review→retired` (`retireQmsDocumentSigned`, `:545`) | `withdrawn`, reason "retired" | yes |
| Authoring `changes_requested`/`rejected` verdict (RR5) | `returned` | yes |

**Red tests:** one per row.

### 2.10 Withdraw, reassign, add a reviewer, hand back

**Withdraw**
- Who: the sender or an admin, with a governed reason.
- Effect: the route becomes `withdrawn`, its member rows are cancelled, and `review-route.withdraw` is written.
- If the review was already complete: `review_signature` is **cleared on the same transaction**, with a sealed `review-route.withdrawn` trail event (the sign-offs stay in the trail). Otherwise the next round could be approved on the old review.
- **Tests:**
  - the new route's reviewers can sign;
  - the old review does not satisfy `REVIEW_SIGNOFF_REQUIRED`.
- Re-sending on a record still in review: `POST /api/regulatory/documents/:id/review-route` (same validator).

**Reassign**
- Who: the sender or an admin, with a reason.
- Effect: `validateRouteMember`, then `assignTaskInTx`, which:
  - keeps the task id, role and step;
  - writes the `task.assign` row;
  - **clears `dueSoonNotifiedAt`/`overdueNotifiedAt`**, so reminders start again for the new assignee. The extraction fixes this for every handoff, routed or not.
- Plus `review-route.reassign` on the subject (route id, from, to, role, reason, and both printed names).
- Refused for a member who has signed, returned, or who is the actor.

**Add a reviewer to an open route**
- Effect: `validateRouteMember`, then a new member row. It **re-blocks the approvers**: their rows return to `blocked` and they get `task_update` "Waiting on a new reviewer".
- Refused once any approval signature exists on the route (`ROUTE_APPROVAL_STARTED`).

**Hand back (delegation)**
- No one signs on another person's behalf.
- A member who cannot do it records "hand back" with a reason: a governed act, stamped on `route_act_id`.
- The sender is notified, and the member stays named until the sender reassigns.

**Bulk send** (N versions → N routes, one transaction, one reason, each with its own ledger row, as VR-11b confirms in bulk): **deferred**.

### 2.11 Notifications, reminders, due dates (B11, M4, M5)

**Notices** (the existing path; no new category):

| Event | Category | To |
|---|---|---|
| Route sent | `task_assigned` | open-step members only |
| A step opens: the next reviewer, or approvers once the review is complete | `task_update` "It is your turn" | that step's members |
| A member signs | `task_completed` | the sender |
| Return or hand back | `task_update` | the sender |
| Withdraw, reassign away or re-block | `task_update` | the affected members |
| Reassign to | `task_assigned` | the new member |
| The route is overdue (review or approval due passes with members outstanding) | `task_update`, **once** (`review_routes.sender_overdue_notified_at`) | the sender |

**Anti-phishing.** `task_assigned`, `task_blocked`, `task_completed` and `task_update` join `SERVER_ONLY_NOTIFICATION_CATEGORIES` (`shared/constants/notifications.ts:26`). So neither `mdx-notifications.ts:61` nor AnA (`AnaToolExecutor.ts:10714`) can mint one. Test: a client POST with `task_assigned` is refused.

**Target.** `notification-record-target.ts:124-127`'s `unified_task` case resolves a route task to its **subject**: the Vault version, or the QMS document through the existing `qms_document` case. A new `canonical_document` case opens the version in the Vault. Both are keyed by `organization_id`.

**Reminders.**
- `taskDueSweep` (`:169`) leaves out `blocked` route tasks.
- `my-work.ts` reports them as "Waiting on {step}", outside the overdue and due-soon triage.
- Open route tasks are reminded as today.
- A handoff resets the markers (§2.10).
- The sweep adds the one sender notice above.

**Due dates.** Each date is the **end of the chosen day in the sender's `notification_preferences.timezone`** (UTC when unset), stored as an instant: `timestamptz` on the header, and the same UTC instant in `unified_tasks.due_date`. The form says which time zone it used.

**Sender view.**
- The board's existing "Requested by me" scope (`Review.tsx:76-80`) includes routes the reader sent, with each member's outcome.
- **Remind** calls the existing `POST /api/tasks/tasks/:taskId/notify` (`taskManagement.routes.ts:1367`) for a member whose step is open.

### 2.12 What the record shows: §11.50 (B6)

**The lifecycle read** (`vault-lifecycle.ts:263-336`) returns the round for each version:
- the route's state;
- **every** member;
- for each signature: printed name, meaning, UTC time and outcome, read from all of that round's `electronic_signatures` rows **filtered on `organization_id = $n`** (the column is nullable; route signatures are always written with it, and a test asserts that);
- returns and hand-backs from their governed rows.

An approver who has signed while others are outstanding shows "Approved (1 of 2 required)".

**The client** (`VaultLifecycle.tsx` `stepOf`/`nextStep`/`whoMaySign`) is route-aware:
- "You signed at 14:02 UTC; waiting for B";
- "Your turn: approve";
- "Returned by C: {reason}";
- "Withdrawn by D on …".

`whoMaySign`'s "Not assigned to one person" stays for `legacy` only.

**Every reader of `review_signature`** (§1.4) is changed or re-tested in RR1a/RR1b:

| Reader | What happens |
|---|---|
| `vault-lifecycle.ts:263-336` | Adds the round's members. |
| `vault-review-queue.ts:64-74` | "mine" = my open step, with the due date. |
| `vault-lifecycle-record.ts:130` | The approver check now covers every review signature on the digest. |
| `documentLifecycleOrchestrator.ts:129`, `:239` | Unchanged; tested with routed rounds. |
| `shared/regulatory/document-lifecycle.ts:217`, `:244` | Unchanged; tested. |
| `authoring-approval-carryover.ts` | The exemption; tested to still carry. |
| `VaultLifecycle.tsx` | Route-aware. |
| `c2c/artifacts.ts:2028` | Not a reader of this column; no change. |

### 2.13 Honest state and cutover

| Subject | Cutover | Before it (from stored state) |
|---|---|---|
| Vault | RR1b ships `REVIEW_ROUTE_REQUIRED` | A record in review with no `review_routes` row is `legacy`: today's eligible signers, labelled "Not assigned to one person". A record whose sign-offs were carried from Authoring (`signatureRef` `authoring:`) renders "carried from Authoring" and needs no route. |
| QMS | RR4 | An `in_review` document with no route is `legacy`: any signing-authority approver, as today. |
| Authoring | RR6 | A document with `authoring_reviews` rows and no route keeps today's loop. |

A read failure renders "Reviewers could not be read", never "not assigned" or an empty list. `routeStanding` throws, and the surface says so.

### 2.14 The duplicate stores

| Store | Disposition |
|---|---|
| `/submit` chain | **Deleted in RR6**, together with `POST /docs/:docId/sign`. The replacement is `/e-sign` (APPROVER and REVIEWER) on the route. D5's evidence README (`docs/evidence/D5/2026-10-01-sign-ceremony-approval-stamps/`) gets a dated note naming the replacement. **Proving gates:** a pglite test that an Authoring route approver task appears in `readMyWork` (`server/services/tasking/__tests__/my-work.pglite.test.ts`) and closes on `/e-sign` APPROVER, plus an `OpenWork` test that the tray and Home list it. **Demo pack:** `biotech-authoring.mjs:113` calls `request-review` with a route (reviewer and approver) instead of `/submit`. The table stays (Rule 1), with a dated note. |
| Authoring client-side task create | **Migrated in RR5**: `request-review` writes the route on its own transaction. |
| Phase-13 review tasks | **RR7**: first move the biostats writer (`workflow-integrator.ts:415`) onto `createTaskInTx`, or remove it if it is outside the catalog. Then delete creation (`c2c/reviews.ts:1212`) and the Phase-13 group in `OpenWork.tsx`. **Threads and comments stay.** |
| P12 artifact reviewers; ApprovalOrchestrator | **Frozen**: `scripts/ci/check-frozen-review-stores.mjs`, with a baseline of today's callers, refuses any new caller or writer. Its selftest shows it failing on an added import. Retirement is a founder catalog decision. |
| Orchestration checkpoints | Left. Not signatures; different subject. |
| Protocol reviewers | **RR8**: converged onto the route. |
| `unified_tasks.approvers` | Kept. The unreachable designated-approver branch (`task-signoff.ts:170-180`) is removed in RR6, with a dated note. |

---

## 3. Multi-signer routes

**The `/submit` chain is converged, not reached** (§2.14). Reaching it would expose:
- identity by email;
- authority by token role names;
- parallel decisions under a sequential-looking `step_no`;
- no due dates or tasks;
- Authoring-only scope.

**Order.** It is stored on the header (`review_order`), with members' `review_step`.
- Parallel: every reviewer is step 1.
- Sequential: reviewers are steps 1…n in the sender's order.
- Approvers are always the step after the last reviewer, and are parallel among themselves.

**Step open.** Computed by `routeStanding`: every member of every earlier step has a verified signature. `review-route.ts` opens steps itself. It does not use `task_dependencies` or the generic cascade, which are both barred from route rows (§2.3).

**Quorum.** NEW-4 (§4), evaluated by `routeStanding` under the subject's row lock.

**Content that changes under a route.** Its signatures stop verifying (the digest differs). A Vault version cannot change. QMS and Authoring refuse edits while a route is open (§2.9).

## 4. Decision NEW-4 (review quorum): decided

Recorded by the coordinator under the founder's delegation of 2026-10-07. This replaces the earlier recommendation. The coordinator records it as a P-number in `docs/LAUNCH_DEFINITION_OF_DONE.md`.

- **Vault.**
  - At least one reviewer and at least one approver.
  - Every named reviewer signs on the same content digest before any approval.
  - The approval needs every named approver.
  - No approver is the uploader, the author, a contributor, the sender, or any reviewer of the stage round.
- **QMS.**
  - At least one approver who holds a quality designation (a designated approver: 21 CFR 211.22(c), 21 CFR 820.40, ISO 13485 §4.2.4).
  - Reviewers are optional, zero or more. If any are named, all of them sign before the approval.
  - The approver is not the author or a contributor.
- **Everyone named** holds signing authority. There is no N-of-M.
- **A document type** may only raise the floor, later, through seeded data.
- **Sending** is a governed act with a reason, not a signature.

## 5. Slices

**Order:** RR1a → RR1b → RR3 → RR4 → RR2 → RR5 → RR6 → RR7 → RR8.

No slice ships `REVIEW_ROUTE_REQUIRED` without the way out (withdraw and return) in the same slice.

Each slice is red first, with evidence in `docs/evidence/D2-REVIEW-ROUTING/<date>/RRn/`.

Acceptance at 390×844 means:
- one column and 16 px gutters;
- no horizontal scroll;
- targets of at least 44 px;
- the route form in a sheet;
- the member list wrapping to one person per line.

Desktop means 1440×900.

### RR1a: The route's server half (the guards, the header, Vault send/sign/withdraw/return)

**Visible change:** none. The client and `REVIEW_ROUTE_REQUIRED` come in RR1b. This is the split the size required: RR1a is proven at the API.

**Files:**
- `migrations/20261023_review_routes.sql`, `scripts/db/migration-set.mjs`, `shared/schema.ts`;
- `task-state-machine.ts` (the guard);
- every writer in §1.1's inventory;
- `create-task.ts`/`createTaskInTx` and `assignTaskInTx` (extracted; their old callers now call them);
- `review-route.ts` (send, `routeStanding`, `validateRouteMember`, close-on-signature, withdraw, return);
- `document-lifecycle.ts` (`advance` with a route; routed `/sign`; `/advance→approved` refused when routed; `review-route`, `withdraw` and `return` routes);
- `canonicalDocumentStore.ts`, `vault-lifecycle-record.ts`, `documentLifecycleOrchestrator.ts` (exits);
- `vault-version-checkin.ts` (the supersede exit);
- `vault-lifecycle.ts` (round members);
- `task-project.ts` (`canonical_document`);
- `taskDueSweep.ts` and `my-work.ts` (blocked route tasks).

**Red tests:**
- one per writer and one per create path (§2.3), and the trigger;
- send refusals, each with nothing written:
  - no reason (`REASON_REQUIRED`);
  - no approver;
  - each `validateRouteMember` refusal, including another organization's user and a withdrawn route's reviewer named as approver;
- two reviewers and one approver:
  - the first review leaves `review_signature` null;
  - the second writes it and opens the approver;
  - the approver's signature advances to `approved` and completes the route;
- `/advance→approved` on a routed record is refused;
- a signature that is not on this route is not counted;
- withdraw after review complete: it clears `review_signature`; the new route's reviewers sign; the old review fails `REVIEW_SIGNOFF_REQUIRED`;
- `ROUTE_WITHDRAWN` refuses every signature while withdrawn;
- one test per Vault exit in §2.9;
- `routeStanding` throws on a failed read;
- the round read lists every member with name, UTC time, meaning and outcome, keyed by `organization_id`;
- a blocked route task is not swept;
- deadlock: two concurrent reviewer sign-offs complete.

**Acceptance:** the API evidence above, plus a `pg_policies` read showing `review_routes` is policed.

### RR1b: Vault send-for-review with named reviewers, an approver and due dates (first visible slice)

**Files:**
- `VaultLifecycle.tsx` (route form, route-aware steps, round panel, withdraw and return);
- the shared field module;
- `vault-review-queue.ts`, `review-board-routes.ts` and `Review.tsx` ("mine", "Requested by me");
- `OpenWork.tsx` ("Waiting on …");
- `notification-record-target.ts` and `notification-reference.ts` (`canonical_document`, task→subject);
- `shared/constants/notifications.ts` (server-only `task_*`);
- `REVIEW_ROUTE_REQUIRED` on in the handler.

**Red tests:**
- Send is disabled until there are reviewers, an approver, due dates and a reason;
- the picker excludes the uploader and sender;
- the round panel shows "Approved (1 of 2 required)" and "You signed at …; waiting for B";
- Return and Withdraw ask for a reason, and refuse without one;
- the notice opens the version;
- a client POST of `task_assigned` is refused;
- an advance without a route is refused;
- carry-over still carries.

**Acceptance:**
- A sender names two reviewers, one approver and due dates.
- Each person gets a notice when it is their turn, and a task in Tasks (the tray and Home).
- Each sees the version in "Awaiting my review" with its due date.
- The round panel shows each signature as it lands, and the approver's signature approves the version.
- A reviewer can return it instead.
- Both viewports.

### RR3: Reassign, add a reviewer, hand back

**Files:** `review-route.ts`, `document-lifecycle.ts` (`reassign`, `members`, `hand-back`), `VaultLifecycle.tsx`.

**Red tests:**
- reassign keeps the task id, resets the reminder markers, and writes `task.assign` and `review-route.reassign` with both printed names;
- reassign refuses a signed or returned member, the actor, and an author or contributor;
- add re-blocks the approvers, and is refused once an approval exists;
- hand back notifies the sender and leaves the member named.

**Acceptance:** the QA item ("nothing reassigns or withdraws") is closed for Vault. Both viewports.

### RR4: QMS route

**Files:**
- `controlled-document-service.ts`;
- `mdx-qms.ts` (`PATCH` with a route; `POST /qms/documents/:id/review`; `return`; withdraw, reassign, add, hand back);
- `governed-signed-act.ts` (`precheck` and `afterSign`);
- `document-approval-signature.ts` (named, designated approver; reviewers complete; effective on the last);
- `training-controlled-text.ts` (refuse while routed);
- `retireQmsDocumentSigned` (the exit);
- `qmsApproval.ts`, `SopRegister.tsx`;
- the quality designation (§7, D-Q).

**Red tests:**
- a route with no approver, or an approver without the designation, is refused;
- with zero reviewers, one approver makes the document effective;
- with two reviewers, approval is refused until both have signed;
- the review digest equals the approval digest;
- the `precheck` refusal costs no credential;
- the task-close row cites `esig:<id>`;
- one test per QMS exit;
- the `20261001` guard holds.

**Acceptance:** an SOP is sent to one reviewer and one QA approver. Both get tasks. The register shows the round. Return works. Both viewports.

### RR2: Vault multiple approvers and sequential reviewers

**Files:** `review-route.ts`, `VaultLifecycle.tsx` (step due dates).

**Red tests:**
- with sequential reviewers, step 2 is `blocked` until step 1 signs, then gets "It is your turn";
- with two approvers, the first shows "1 of 2", and the second approves and supersedes.

**Acceptance:** both viewports.

### RR5: Authoring request-review writes the route on its own transaction

**Files:** `peer-review.ts`, `authoring.router.ts:3316` (the route), `closeReviewTasksOnVerdict` (into `review-route.ts`; negative verdicts return), `SendForReviewDialog.tsx` (the second write removed).

**Red tests:**
- the request and its route commit together, or neither does;
- `changes_requested` returns the route and unblocks no approver;
- a REVIEWER `/e-sign` closes the reviewer's task.

### RR6: Authoring approvers on the route; `/submit`, `/docs/:docId/sign` and the chain deleted

**Files:** as §2.14, plus `task-signoff.ts:170-180` removed with a dated note.

**Red tests:**
- an APPROVER with a pending reviewer is refused;
- the two proving gates (§2.14);
- a grep gate finds no `authoring_workflow_steps` reader.

**Acceptance:** the commit names each replacement by path.

### RR7: One inbox

The biostats writer is moved first, then Phase-13 task creation is deleted. "Mine" is the route for every subject, and the tray, Home and the board agree.

### RR8: Protocol reviewers on the route

`assignReviewerTx` → `sendReviewRoute`, and the disposition closes the member row.

## 6. Risks

**Part 11**
- Only `review-route.ts` writes route rows. Code enforces it (the guard) and the database enforces it (the trigger).
- Authority comes from the route and verified signatures, never task status.
- Signatures are never deleted. Withdrawing or returning clears only the live `review_signature`, which the trail keeps.
- Every signature is bound to the route and the digest.
- Lock order: the subject row, then member rows, then the audit chain.
- AnA has no path to send, sign, withdraw, return, reassign or hand back.

**Tenant isolation**
- Every statement in `review-route.ts`, `routeStanding`, `validateRouteMember` and the round read carries `organization_id = $n`.
- The signature reads filter `electronic_signatures.organization_id`.
- The unique indexes lead with `organization_id`.
- A new table in `public` with `organization_id INTEGER NOT NULL`, before the final pair.
- One cross-tenant refusal test per endpoint.

**Honest state**
- A failed read throws, and renders as unread.
- A legacy record is labelled as legacy.
- A withdrawn route signs nothing.
- Each disposition comes from its signature or act.

**Scope of RR1a.** It touches every task writer. The per-writer tests and the trigger are what keep that safe. If RR1a is still too large, split it at the guard (RR1a-i: the guard, the trigger and the tests; RR1a-ii: the route).

## 7. Open questions

1. **What a Vault reviewer does to refuse.** Answered: Return for revision (§2.9).
2. **Should Authoring reviewers sign?** Answered: they already can. The REVIEWER e-sign closes their route task (RR5).
3. **P12 and ApprovalOrchestrator.** Answered: frozen by a CI gate (§2.14). Retirement is the founder's catalog decision.
4. **Grandfathering.** Answered: §2.13.
5. **Due-date time zone.** Answered: the sender's notification time zone, stored as an instant (§2.11).
6. **`approvers`.** Answered: the column is kept, and the unreachable branch is removed in RR6.
7. **Per-type minimums.** Answered: deferral confirmed, raise-only, through seeded data (§4).
8. **D-Q, decided 2026-10-29** (coordinator, under the founder's delegation of 2026-10-07). NEW-4 requires a QMS approver who "holds a quality role". There is **no quality role or designation** in `ASSIGNABLE_ORG_ROLES` (`shared/constants/org-roles.ts:33`). Decision:
   - QMS approval is a **per-organization designation**, not a new org role. An admin designates members as QMS approvers. The designation is held as membership data and requires a reason, and each designation or removal is a governed, chained audit row. A designee must already hold signing authority (`checkSigningAuthority`).
   - Until RR4 ships the designation, members with the existing `approver` org role count as designated.
   - RR4 delivers the designation (the store, the admin control, the audit) and switches the QMS route's approver check to it.

## 8. Review findings and dispositions

The findings came from two reviews of `33219c736`: Part 11 and product/architecture.

**B1. Generic writers bypass the route.**
The state machine reopens tasks (`task-state-machine.ts:24-31`), and archive (`:1542`), dependencies (`:1017`) and link (`unifiedTasks.routes.ts:289`) write route rows.
Disposition:
- one guard in `task-state-machine.ts`, called by every writer;
- a database trigger as backstop;
- authority taken from the route and signatures only;
- a red test per writer (§2.3, RR1a).

**B2. No route header.**
Disposition:
- `public.review_routes`, with the unique open-per-subject index;
- named conditional constraints;
- the freeze note in the migration header;
- the route-task assignee CHECK;
- `routeStanding` states, throwing on a failed read;
- `ROUTE_WITHDRAWN` (§2.2, §2.4).

**B3. Signatures not bound to the route.**
Disposition:
- `route_signature_id` stamped on the member row;
- only stamped signatures count;
- withdrawal clears `review_signature`, with a sealed event;
- tests (§2.8, §2.10).

**B4. Exits from `in_review` leave the route open.**
Disposition:
- every exit cancels the route on its transaction, including the newer-version check-in and QMS retirement, both found during this revision;
- QMS return added;
- edits refused while a route is open;
- a test per exit (§2.9).

**B5. No refusal; a negative verdict completes the task and unblocks.**
Disposition:
- Return for revision;
- dispositions read from signatures and acts;
- a returner cannot be reassigned;
- the Authoring REVIEWER e-sign closes the task;
- negative verdicts return the route (§2.8, §2.9).

**B6. §11.50 display shows one reviewer.**
Disposition:
- the round read lists every member from org-filtered signature rows;
- "1 of 2 required";
- a route-aware client;
- every reader of `review_signature` listed by path (§2.12).

**B7. QMS signing order.**
Disposition:
- `precheck` and `afterSign` hooks on `SignedAct`;
- `run` locks the row;
- the task-close row cites `esig:<id>`;
- a digest-equality test (§2.8).

**B8. Two approval paths for routed Vault records.**
Disposition:
- one endpoint (`/sign`);
- the server advances on the last approval;
- `/advance→approved` refused when routed (§2.8).

**B9. Separation of duties per route, not per stage round.**
Disposition:
- the stage round covers all review signatures on the digest;
- the actor is refused;
- contributors are checked at send and at reassignment;
- one validator, including project admission through `readProgramAnchorRow`;
- the withdrawn-route test (§2.5).

**B10. Slice order shipped `REVIEW_ROUTE_REQUIRED` before the way out.**
Disposition:
- RR1a/RR1b include the guards, withdraw and return;
- then RR3, RR4, RR2, RR5–RR8 (§5).

**B11. Reminders and due dates.**
Disposition:
- `assignTaskInTx` resets the markers on every handoff;
- blocked route tasks are not swept or triaged;
- approvers are notified when it is their turn (the contradiction is removed);
- due dates are the end of the day in the sender's time zone, stored as an instant (§2.10, §2.11).

**M1. Grandfathering.**
Disposition:
- a cutover per subject, from stored state;
- the carry-over exemption, labelled "carried from Authoring";
- the check sits in the handler, not the orchestrator (§2.6, §2.13).

**M2. Reasons.**
Disposition: send, withdraw, reassign, return and hand back each use `requireGovernedReason`; a missing reason gives `REASON_REQUIRED` and nothing is written (§2.6, §2.10).

**M3. Naming history.**
Disposition: `review-route.send`, `.reassign`, `.withdraw` and `.return` are written on the subject's target, with printed names at naming; the history panel shows names (§2.6, §2.10, §2.12).

**M4. Notification spoofing and targets.**
Disposition:
- `task_*` categories become server-only;
- a task resolves to its subject;
- a `canonical_document` target is added (§2.11).

**M5. Sender view.**
Disposition:
- the existing "Requested by me" scope covers routes;
- one overdue notice to the sender;
- Remind through `POST /tasks/:id/notify` (§2.11).

**M6. Delegation and adding a reviewer.**
Disposition: hand back plus reassignment; adding a reviewer re-blocks the approvers (§2.10).

**M7. Bulk send.**
Disposition: named as deferred (§2.10).

**M8. Deletions must name replacements.**
Disposition:
- `/docs/:docId/sign` deleted in RR6, naming `/e-sign`, with a D5 evidence note;
- the proving gates named;
- the demo pack replacement named;
- RR7 keeps threads and moves the biostats writer first (§2.14).

**M9. Other create paths could set route columns.**
Disposition: input schemas exclude them, the trigger refuses them, and there is a test per create path (§2.3).

**M10. Open questions Q3, Q6 and Q7.**
Disposition:
- Q3: answered with the freeze gate;
- Q6: answered with the branch removal in RR6;
- Q7: deferral confirmed (§7).

**M11. `approvers` and the unreachable branch.**
Disposition: see M10 (Q6).

**NEW-4.**
Disposition: recorded as decided (§4). The QMS "quality role" does not exist in the role model; it is decided as a per-organization designation (D-Q, §7).
