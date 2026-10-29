# QMS training: job roles, named people, and version-bound compliance (P-49), 2026-10-29

| | |
|---|---|
| Launch rows | **D2** (W1, QMS controlled documents). **D5** covers the audit rows and the signature binding. |
| Work orders | MR-12 Stage 4, "Version-bound, assigned training compliance" (closes CAT2-21). `docs/design/VEEVA_GAP_2026-10-22.md` §5 item 3. Parity doc §5.2, row "Per-document training assignment". |
| Founder decision | **P-49** (`docs/LAUNCH_DEFINITION_OF_DONE.md:884-903`). This design builds it as written and does not reopen it. |
| Code basis | HEAD `7746d35abc`. `git diff 4c696d5c59 HEAD` changes none of the following: `server/services/qms`, `server/routes/mdx-qms*.ts`, `shared/qms`, `client/src/concept2cure/quality`, `server/services/tasking`, `server/jobs/taskDueSweep.ts`. In `scripts/db/migration-set.mjs` the only change is the `saved_precedent_queries` entry (`:3628-3637`). Every line number below is HEAD's. |
| Evidence | `docs/evidence/MR-12/<build-date>-training-assignment/`. Its README carries its own "What already exists" section, copied from §2. |
| Supersedes | The candidate design `p49` and its two reviews. Every must-fix is applied; §9 maps each one. |

The work, named for what it is (Rule 3):
- **Complete** training compliance (`server/services/qms/training-compliance.ts`). Its denominator becomes the people assigned to the document instead of the roster.
- **Complete** the in-force resolver (`server/services/qms/in-force-release.ts`). A version approved for a later date leaves its predecessor in force until that date.
- **Reach** the one task store and the one reminder sweep from approval, assignment, acknowledgement and retirement. The store is `unified_tasks` through `server/services/tasking/source-task.ts`; the sweep is `server/jobs/taskDueSweep.ts`. Periodic review already uses both (`periodic-review-task.ts`).
- **Extend** the per-person expiry view G10 (`TrainingExpiry.tsx`, `GET /qms/training/expiring`) to the assigned people and to their outstanding training.
- **Reach** the Quality notification target (`notification-record-target.ts:96`) from a training task.

The only new stores are three tables: the job-role list, its members, and the per-document assignment. No store for any of them exists (§2).

---

## 1. Decisions

### 1.1 NEW-2, decided by P-49: job roles plus named people on each controlled document

**What is built.**
- **`qms_job_roles`**: each organization's own list of job functions, such as QA, Manufacturing and Clinical Operations.
- **`qms_job_role_members`**: who holds which role. A person can hold many roles.
- **`qms_training_assignments`**: one row per requirement. Each row names a controlled document and exactly one job role or exactly one person.
- **Assignments belong to the document, not to a version.** They carry over to v2.0, v3.0 and later, so retraining needs no new assignment.
- **Who must train is computed in one place**: one SQL resolver (§3.2), used by compliance, expiry, the per-document read, the viewer's own line and the task planner.

**Curricula can be added later without moving data.** A curriculum is a set of documents assigned to a role together. It arrives as additive tables:
- `qms_curricula`;
- `qms_curriculum_documents`;
- `qms_curriculum_assignments`, which names a role or a person with the same `num_nonnulls = 1` rule.

The resolver gains one more `UNION ALL` branch, `curriculum → documents → role members`, reported as `via = 'curriculum:<id>'`. `qms_training_assignments`, its rows and its CHECK stay exactly as they are. Nothing is moved, and no constraint is replaced, so the conditional-replacement corollary of Rule 1 never comes up. Direct assignments stay direct requirements beside curriculum-derived ones. Whether the existing `curriculum` doc_type (TRN-, `sopTemplates.ts`) becomes the grouping is for that later slice to decide.

**Options not taken:**

| Option | Why not |
|---|---|
| `organization_users.role` (`shared/schema.ts:2652`) | These are permission roles. Assigning by them means "everyone with access", which P-49 rules out by name. |
| `organization_users.persona` (`schema.ts:2657`) | A fixed platform vocabulary (REPORT_PERSONAS), one value per person, set by the person themselves with no audit (`PUT /api/users/me/persona`, `server/routes/users.ts:518`). A member could clear their own obligation. |
| `users.title` / `users.department` (`migrations/20261022_auth_schema_and_seeded_organizations.sql:86-87`) | Free text on the global user row: not per organization, no list, no audit. |
| QMS approver designation (`migrations/20261029f…`, `qms-approver-designation.ts`) | One quality designation per member, not a list of job functions. It is reused only as an authority (D4). |
| `research_personnel.role` / `personnel_training` (`migrations/20260611_research_compliance.sql:12-40`) | A fixed research vocabulary (PI, coordinator and so on) with CITI training types, keyed to personnel ids rather than users, and outside the launch catalog. |
| Curriculum-first | P-49 chose roles plus named people; curricula come later. |
| MR-12 Stage 4 step 4's sketch (`role text` on the assignment, matched against `organization_users.role`) | It is the permission-role model P-49 rejected. |

### 1.2 NEW-3, decided by P-49: training opens at approval and counts once the version is in force

**What is built.**
- **"In force" is decided in one place**, `in-force-release.ts`. An effective row is in force when its `effective_date` is null or on or before the current UTC day. A row approved for a later day is **pending**, and its predecessor stays in force until that day.
- **During the training period both versions can be acknowledged**: the version in force (the procedure people follow today) and the pending version (the one their task names). The reader chooses which.
- **The binding is unchanged.** A receipt binds that version's `contentDigest`, its `releaseApprovalSignatureId` and its `documentSnapshot` (`training.ts:115-116`). The digest excludes `effective_date` (`document-approval-signature.ts:39-41`), so a receipt made during the training period still matches on the effective day.
- **Compliance counts only receipts of the version in force.** Receipts of the pending version are reported apart, as `pending.acknowledged` of `pending.of` (readiness for the effective day), and never as compliance.
- **Nothing is stamped and no scheduler runs.** On the effective day, the same read returns the new version as in force.

**Options not taken:**
- **Refuse until the effective day.** That is HEAD's behaviour (`training-content.ts:55`), and P-49 says yes to training before it.
- **Count pending receipts before the effective day.** P-49: "Nothing counts toward a version that is not yet in force."
- **One trainable version during the period** (the candidate's rule, which refused v1.0 acknowledgements with 409 `QMS_TRAINING_STALE`). A new hire, or someone whose v1.0 receipt lapsed, could not become current on the procedure that governs their work until the effective day. G10 would also keep listing lapses nobody could clear. Rejected.

### 1.3 Decisions this design takes within P-49

**D3. Being assigned lets a person read the released version they are assigned to.**
- P-49 says each assigned person "receives a task to read and acknowledge it", so the person must be able to read what the task names.
- Authored SOPs are hidden behind project access (`authoring-program-access.ts:49-54`) and an object grant (`authoring-permissions.ts:242-261`).
- The only grant a new editing copy receives is OWNER and AUTHOR for its creator (`controlled-document-service.ts:77-80`). Every revise creates a new copy (`:223-263`).
- So: an active person covered by a live assignment may read, **through the training reader only**, the immutable signed snapshot of that document's version in force and of its pending version. The reader already serves the immutable snapshot, never the editing copy (`current-release-approval.ts:106-123`).
- This grants nothing on the editing copy, nothing on `/editor` or `/versions`, and no project access. Nothing is written to `doc_permissions`.
- An assigner must be able to read the document themselves (§3.8), so nobody can require someone to read what they cannot read.

Options not taken:
- **Grant VIEWER on each version's editing copy** (the `grantRouteAccess` pattern, `qms-review-route.ts:105-124`):
  - it needs `manage_permissions` on every new copy, and the approver often lacks it, so grants would be silently skipped at approval;
  - a private project still refuses the trainee (PROJECT_PERMISSION_DENIED), and fixing that means project membership, which exposes the whole project.
- **Report `canRead=false` and grant nothing**: tasks nobody can complete.
- **A bulk "share with everyone assigned" act**: it still fails on project access.

If the founder declines D3 (Q2), the fallback is that tasks are written only for assignees who can already read the document, and the approve dialog lists the others before signing. The resolver and every other part of this design are unchanged.

**D4. Authority.** The reviewers disagreed (administrator only, against admin plus manager via `rolesHeldBy`). Decided:
- **Job roles and their members**: administrators only. That means `ADMINISTRATOR_ROLES` (`server/services/tenant/membership-change.ts:113`), the set `authorizeOrgAccess` uses (`server/routes/tenant-users.ts:110`). Reasons:
  - role membership now decides who must read and who may read (D3), which is an access decision;
  - the D-Q precedent places quality designations with an administrator (`qms-approver-designation.ts:24-27`).
  - Manager is not admitted.
- **Adding and removing a document's assignments**: an administrator, or a designated QMS approver (`isQmsDesignatedApprover`, `qms-approver-designation.ts:62`, including its Approver-role stand-in). This is the existing quality authority. Plain editor access is not enough: removing an assignment shrinks the denominator.
- **Self-unassignment is refused**: removing your own role membership, your own named assignment, or a role assignment for a role you hold. This mirrors `refuseSelf` (`:97`). Adding yourself only adds an obligation and is allowed.
- **Reads** are open to every member of the organization, tenant-scoped, as `GET /qms/training` and G10 are today.
- **Implementation of the check**: the role is the persisted membership role, read on the request client inside the write's transaction under `FOR SHARE` (`currentStanding(client, actor, true)`, `training.ts:42-61`), so a concurrent demotion cannot slip in between. `authorizeOrgAccess` itself is not called: it is private to `tenant-users.ts`, reads through the global pool and writes the response. The check uses its exact role set.

**D5. Distribution through the one task store.**
- **One open Quality task per person per document**, for the version that person must train on now: the pending version if there is one, otherwise the version in force.
- **Due date**: the version's effective date. For someone covered only after that version took effect, the day they were covered plus `TRAINING_LATE_ASSIGNMENT_GRACE_DAYS`. That constant is 0 until Q1 is answered.
- **Notice**: each new task sends one "Training" notice to its assignee through the existing `notifyTaskEvent` (category `task_assigned`).
- **No "Overdue" notice for a task created already past due**: its sweep markers are stamped at creation (§3.9).
- **Nobody unassigned gets a task or a notice.**

**D6. A pending version cannot be revised.**
- Revising it would orphan its signed snapshot. That snapshot takes force on the effective day, while the trainable version for the new draft is v1.0.
- So both revise paths refuse with 409 `QMS_REVISION_PENDING_EFFECT` until the effective day.
- Retirement stays available.
- Withdrawing a pending approval is left out (§6).

**D7. The controlled-documents report decides "in force" at generation time**, not at its as-of date. The reviewers disagreed. Decided this way because the report states that "Status is the record as it is at generation time" (`compliance-reports/queries/controlled-documents.ts`, `run()` notes). Reading "in force" as of the past against today's status would be the mixed reading the note forbids. As-of in-force is left out.

**D8. Purge retention.**
- The three new tables go in `PURGE_RETAINED_RECORDS` (`server/services/tenant/tenant-offboarding.ts:1074`), each with a reason: they are the requirement record that gives meaning to the `qms_training_records` receipts the purge also keeps (purge residue, `docs/reports/purge-coverage-baseline.json`).
- Erasing who was required to train while keeping their receipts would break the record.
- They are erased together when QMS retention is decided.

**D9. One day convention.** One helper, `utcDay(now)`, used by:
- the resolver;
- the trainable flag;
- compliance;
- task due dates;
- the backdate refusal.

Approval resolves the effective date in JavaScript instead of `COALESCE(…, $6::date)`, which used the database session's time zone.

### 1.4 Questions for the founder

Filed in the evidence README when slice 3 lands. None of them blocks a slice; each has a stated default.

- **Q1. Grace period for late assignment.** Someone assigned after a version is in force is due on the day they are assigned (the strict reading of "due by its effective date"). Veeva also offers "N days after assignment". The default is 0; it is one constant.
- **Q2. Confirm D3** (being assigned lets a person read the released version). If not confirmed, the fallback in D3 applies.
- **Q3. Who sees each person's training status.** The default is every member, as today (`GET /qms/training`, `mdx-qms.ts:900-910`, and G10). Narrowing it to administrators and QMS approvers is one filter.

---

## 2. What already exists

Verified at HEAD `7746d35abc`.

### Read-and-understood training (server)

**`server/services/qms/training.ts`:**
- `currentStanding` (`:42-61`) reads the persisted membership role, optionally `FOR SHARE`.
- `readQmsTrainingContext` (`:81-94`) serves only the release in force (`:86`). It authorizes with `authorizeQmsContentRead` (`:87`).
- `recordAcknowledgement` (`:96-134`):
  - locks the row (`:100-103`) and resolves the release in force (`:107`);
  - authorizes (`:108`);
  - refuses a stale version or digest with 409 `QMS_TRAINING_STALE` (`:111`);
  - is idempotent through `currentReceipt` (`:63-79`);
  - sets expiry to 365 days after acknowledgement (`:114`);
  - binds digest, release approval signature id and snapshot (`:115-116`);
  - writes the chained audit row in the same transaction through `writeChainedAuditRow` (`:125-132`).
- It does not acknowledge a pending version.

**`server/services/qms/training-content.ts`:**
- `describeQmsTrainingDocument` (`:47-64`) refuses a future effective date at `:55` ("This revision is not effective yet."). That line is what blocks NEW-3.
- `verifiedTrainingReceipt` (`:71-86`) re-checks every receipt through that function, so a pending-version receipt cannot verify today.

**`server/services/qms/current-release-approval.ts`:**
- `readCurrentQmsReleaseApproval` (`:55-87`) verifies the exact approval signature. `exactManifest` (`:30-46`) checks named manifest keys and `manifestSignatureHash`.
- `readQmsTrainingReleaseContext` (`:100-125`) reads authored text from the immutable `qms_document_versions` row (`:106-123`).
- It never compares the effective date.

**`shared/qms/training.ts`:**
- `QMS_TRAINABLE_DOCUMENT_TYPES` (`:10`).
- The acknowledgement input is `.strict()` (`:13-18`).
- The context schema (`:61-81`) requires status `effective` for an eligible context (`:74`). A pending row is `effective`.

`server/services/qms/training-controlled-text.ts` (the legacy draft-text writer) is not affected.

### Compliance and G10 (server)

**`server/services/qms/training-compliance.ts`:**
- `readCurrentReceipts` (`:16-55`):
  - the roster is every active member (`:17-23`);
  - a date filter drops a future-dated release entirely (`:31-36`);
  - receipts match the release on version and digest (`:50-51`).
- `readQmsTrainingCompliance` (`:58-67`) returns `of: members.size` (`:64`): the roster.
- `readQmsTrainingExpiring` (`:89-123`) is G10.

**Routes in `server/routes/mdx-qms.ts`:**
- training-ack `:879-898`;
- `GET /qms/training` `:900-910` (every record, any member);
- `/qms/training/expiring` `:912-924`;
- `/qms/training/compliance` `:926-937`, whose comment says "denominator is the org roster".

**G10 client:** `client/src/concept2cure/quality/TrainingExpiry.tsx` and `hooks.ts` `useTrainingExpiring` (`:114-122`), commit `5c75de2ab0`. It is extended here, not rebuilt.

**The readiness training block** (`mdx-qms.ts:249-260`) counts raw records ("the tables cannot say who should have trained on what"). The route is DEAD and excluded at launch (`server/services/entitlements/launch-scope-api.ts:103`).

### The version in force

**`server/services/qms/in-force-release.ts`:**
- `readInForceReleases` (`:66-94`) treats every `effective` row as in force whatever its date (`:75`).
- Only draft and in_review revisions look up a predecessor (`:78`), and `DISTINCT ON` takes the latest snapshot (`:81-87`).
- `asRelease` (`:55-60`) rejects the row's own version. So once v2.0 is approved with a future date:
  - v1.0 stops being in force;
  - compliance drops the document entirely (`training-compliance.ts:31-36`).
- Readers:
  - `training.ts:86,107`;
  - `training-compliance.ts:32`;
  - `periodic-review.ts:276`, `readQmsReviewSchedule`, which feeds the register (`mdx-qms.ts:362`), review-due (`:488`), readiness (`:210`) and the report (`controlled-documents.ts:174`).

**Approval in `server/services/qms/document-approval-signature.ts`:**
- `QmsApprovalRefusalCode` (`:171`); `effectiveDate` is optional (`:229`).
- `lockApprovableDocument` (`:312-342`).
- `applyApproval` (`:345-395`):
  - `effective_date = COALESCE($4::date, effective_date, $6::date)` (`:356`);
  - the metadata merge keeps `lastRevision` (`:357`).
- Ledger payload `:422-441`; `extraManifest` `:465`.
- `persistQmsSignedVersion` runs only for authored content (`:470-471`).
- The digest excludes `effective_date` (`:39-41`).

**The approve route:**
- `mdx-qms.ts:616-624`: `effectiveDate` is optional and never checked against today (`:623`).
- After COMMIT it runs `schedulePeriodicReviewTask` before `ok(res)` (`:768-769`).
- The client never sends a date: `qmsApproval.ts` `postQmsApproval` (`:41-48`); the dialog says "becomes effective when you sign" (`SopRegister.tsx:604`).

**Revise**, in `controlled-document-service.ts`:
- `revisableState` admits `effective` (`:243`), so a pending row can be revised today.
- It records `lastRevision` (`:255`) and clears the date (`:258`, `:288`).
- AnA's `revise_qms_document` calls the same service (`AnaToolExecutor.ts:14712-14730`).

**Periodic review**, in `periodic-review.ts`:
- `recordQmsPeriodicReview` (`:121-151`) signs the locked row.
- `refuseUnlessEffective` (`:154-163`) admits a pending row.
- `readQmsReviewSchedule.dueOf` (`:270-286`) reads the in-force release.

**The register row** (`scheduledRegisterRow`, `mdx-qms.ts:333-341`) carries `in_force` only for revisions (`inForceSummary`, `in-force-release.ts:102-111`). It has no pending flag and no server overdue flag.

### Task and reminder infrastructure

- **`server/services/tasking/source-task.ts` `replaceSourceTask` (`:46-73`)**: one open task per source record, best effort, never throws, writes through the global `db`, closes with `updateTaskStatus`.
- **`server/services/qms/periodic-review-task.ts`**: the pattern reused here, with `remindDaysBefore` 30. The same pattern is in `qms-record-tasks.ts` (supplier, internal audit).
- **`server/jobs/taskDueSweep.ts`**:
  - `remindWindowMs` (`:46-51`), 1 to 90 days;
  - `classifyDue` (`:54-61`), where `due < now` means overdue;
  - `alreadyNotified` (`:68-74`);
  - stamp-before-notify (`:111-132`);
  - SQL excludes rows that already carry `overdueNotifiedAt` (`:220`).
- **`server/services/unifiedTaskService.ts`**: `MODULE_CONFIG.Quality` (`:69`), `createUnifiedTask` (`:155-197`). Creating a task sends no notice.
- **`server/services/tasking/task-side-effects.ts` `notifyTaskEvent` (`:22-47`)**: the existing per-assignee notice, category `task_assigned` included.
- **`emitDeadlineTask`** (`server/services/research-compliance/tasking-bridge.ts:27-46`): hard-codes `ResearchCompliance` and takes no assignee, so it is not used. Its best-effort rule is the pattern.

### The governed-write ceremony and the request client

- **`governedQmsWrite`** (`server/services/qms/governed-qms-write.ts:92-160`): BEGIN, tenant vars, write, `recordGovernedAction`, COMMIT. It **sends the response itself** (`:158`) before returning true.
- **`requestDbLease.ts:44-71`**: the response's `finish`/`close` releases `req.dbClient`, after which `requestPgClient` throws (`requestDb.ts:79-84`). So any work after the response cannot use the request client.
- **`signGovernedAct.afterCommit`** (`server/routes/governed-signed-act.ts:171`, `runAfterCommit` `:184-190`, called at `:337`): runs after COMMIT and **before** the response, best effort. That is the pattern copied here.
- **Authority pieces**:
  - `requireEditorAccess` (`server/middleware/orgMembership.ts:579`);
  - `GOVERNED_WRITE_ROLES` (`:509`);
  - `ADMINISTRATOR_ROLES` (`membership-change.ts:113`);
  - `isQmsDesignatedApprover` (`qms-approver-designation.ts:62`).

### Who can read authored text

- **`authorizeQmsContentRead`** (`server/services/qms/controlled-document-content.ts:67-81`) requires project access and an object grant.
- **`decideAuthoringPermission`** (`authoring-permissions.ts:213-268`): an org `admin` is a global authoring admin (`:78`, `:231`).
- **`grantRouteAccess`** (`qms-review-route.ts:105-124`): per-person grants, but only when the actor holds `manage_permissions`, and silently skipped otherwise.
- **The existing dbtest grants the trainee VIEWER by hand** (`tests/db/qms-in-force-during-revision.dbtest.ts:176-182`).

### Notifications

- **`qualityTarget`** (`server/services/notifications/notification-record-target.ts:96-106`): for an authored document it requires view on the editing copy. `taskTarget` (`:133-140`) sends a task's notice to the Tasks board.
- **`shared/types/notification-navigation.ts:20-38`**: `quality: ['qmsDocumentId']`.
- **The deep link opens the editor, not the reader**: `useControlledDocumentTarget` (`ControlledDocumentTarget.tsx`) feeds `SopRegister.tsx:226-234`, threaded through `QualityModule.tsx:20-25`, `QualityRoute.tsx` and `App.tsx:108-110`.

### Role-like stores: none is a list of job functions

These are listed in §1.1, plus:
- project members (`schema.ts:5833`);
- `context_groups` (eCTD);
- `citi-logic.ts:89,164`: a required-versus-done matrix for research compliance, outside the catalog;
- `db/migrations/_consolidated/006_roles.sql`: a permission table, refused and on no applier (`server/bootstrap/register-core-routes.ts:57`).

### Client

**`TrainingCoverage.tsx`:**
- `:16-31` with the meta line "active organization roster" (`:21`);
- `CoverageRow` (`:33-47`): `pct` falls back to 0 (`:34`) and renders `current/of` (`:41`).

**`hooks.ts`:** `useTrainingCompliance` (`:83-101`) **maps nulls to 0** (`:94-95`).

**`data.ts`:**
- `TrainingRow` (`:98-108`);
- `todayUtc`/`isReviewOverdue` (`:145-153`), used by `deriveReviewDue` and `reviewRowOf` (`:182-203`). The hard-coded TODAY was already removed in `c1d46c86c5`.

**`SopRegister.tsx`:**
- admin flag `:216`;
- `effectiveCount` `:252`;
- coverage KPI `:256-258` and `:357-371`, whose sub-line reads "No active roster members to assess";
- client overdue `:464`;
- in-force pill `:479-482`; Effective column `:488`;
- `DocumentReadButton` `:491`;
- Revise, Record review and Retire `:520-545`;
- training section `:573-576`;
- approve `EsignModal` `:600-615`.

**`PersonalTrainingReader.tsx`** (150 lines): reads one context; declaration `:142-150`; receipt `:130-140`.

**`PeriodicReview.tsx`:** `canRecordReview` (`:58`) is false when `underRevision`.

**Reusable pieces:**
- `PeoplePicker` (`v2/editor/reviewFields.tsx:105`);
- `ReasonField` and `GOVERNED_REASON_MIN` (as `QmsReviewRoute.tsx:28-29` uses them);
- `DialogPanel` (`ControlledDocumentDialogs.tsx`);
- `memberLabels` (`shared/utils/member-labels.ts:28`);
- `EsignModal` `renderMeaningDetails` and `signedRows` (`_shared/components/EsignModal.tsx:149-155`).

**Reachability:** the `/api/mdx/qms` claim (`shared/constants/ui-surface-registry.ui-v2.ts:689`) covers the new paths.

### Schema and the migration set

- **`qms_training_records`**: `migrations/20260511_qms_and_labeling.sql:51-66`.
- **The `(id, organization_id)` key on `qms_documents` in the root tree**: `qms_documents_id_org_uq` (`migrations/20261013b_qms_inspection_same_org_keys.sql:54-55`, set `:2926`). The db-tree twin `qms_document_org_id_key` (`db/migrations/20261014…:21`) is **not** re-stated.
- **Set positions**: `20261029f` `:3627`, saved_precedent_queries `:3637`, `UUID_TENANT_ISOLATION_NONPUBLIC` `:3638`, `CHILD_TABLE_PARENT_SCOPE` `:3655`, `TENANT_ISOLATION_SWEEP` `:3666`.
- **The sweep** polices public tables with an integer `organization_id` (`db/migrations/20260801_tenant_isolation_sweep.sql:111-125`).
- **No Drizzle definition** exists for `qms_document_versions`. Raw SQL on the request client is the pattern here.
- **Purge**: `PURGE_CHILD_TABLES` (`tenant-offboarding.ts:1106`), `PURGE_RETAINED_RECORDS` (`:1074`), with the `ci:purge-coverage` ratchet ("residue may shrink but never grow").

### MR-12 Stage 4 status at HEAD

- Test (d), "v1.0 receipts stop counting for v2.0", is already **green**: `server/services/qms/__tests__/training-compliance.pglite.test.ts:98-117` and `qms-in-force-during-revision.dbtest.ts:168-192`.
- Tests (e) and (f) are **red**: the denominator is the roster, and an unassigned document reads `0 of 3`.
- MR-12 names `server/routes/__tests__/qms-training-ack.test.ts`, which does not exist. The route tests are `qms-personal-training.test.ts`.

### Deleted, none restored

Found with `git log --all --diff-filter=D`:
- `server/routes/_deprecated/training.js` (`4a87d39a4a`): a training task for every tenant user when an SOP became effective. P-49: "Nobody else is notified."
- `client/src/pages/TrainingTasks.jsx` (`b49e7495f5`): a "Mark Completed" button that was not evidence.
- `client/src/concept2cure/components/quality/SOPManagement.tsx` (`e5a74a4dfa`): a fixture training matrix.
- `client/src/portal-v2/components/admin/TrainingManagement.tsx` (`5d29680f22`): fixture curricula.
- `client/src/concept2cure/pages/AboutTrainingCenter.tsx` (`ea5f8fbdc9`).

### Searches run

- `job_role`, `jobrole`, `job_function`, `learner`, `training_role`, `training_assignment`, `curricul`, `qms_job`, across `server`, `shared`, `client/src`, `migrations`, `db` and `scripts`.
- `CREATE TABLE … roles|departments|teams|user_groups|job_functions`.
- `persona`, `department`, `title`.
- `emitDeadlineTask`, `replaceSourceTask`, `taskDueSweep`, `notifyTaskEvent`, `qualityTarget`, `setTypeParser`.
- `git log --all --diff-filter=D` on `*raining*`, `*urricul*`, `*SOPManagement*`, `*AboutTraining*`.

---

## 3. The design

### 3.1 Schema

The file is **`migrations/20261029g_qms_job_roles_and_training_assignments.sql`**. Rename it to the build day, using the next free suffix.

```sql
-- =============================================================================
-- 20261029g — QMS job roles, their members, and each controlled document's
-- training assignments (P-49, 2026-10-29; MR-12 Stage 4; launch rows D2/D5).
-- Design: docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md
--
-- A job role is a job function the organization manages (QA, Manufacturing,
-- Clinical Operations), NOT a permission role (organization_users.role). An
-- assignment names a controlled document and exactly one job role or one
-- person; it is to the document, so it carries to every later version.
-- Writer: server/services/qms/training-assignment.ts only; every write carries
-- its governed ledger pair on the same transaction (governedQmsWrite).
--
-- Rule 1: every statement re-runs on every deploy. All are IF NOT EXISTS;
-- nothing here drops, alters or re-states an object another file creates; no
-- seed rows (job roles are organization data, not reference data).
-- Every object here FREEZES once deployed: a later change amends THIS file in
-- place with a dated note and a conditional ALTER (pg_constraint /
-- pg_get_constraintdef), never an appended DROP.
-- Depends on: organizations, users (base schema); qms_documents
-- (migrations/20260511_qms_and_labeling.sql) and its (id, organization_id)
-- unique index qms_documents_id_org_uq (migrations/20261013b_…:54), both
-- earlier in C2C_MIGRATION_FILES and in the root tree install-fresh walks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.qms_job_roles (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      INTEGER NOT NULL REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      INTEGER REFERENCES public.users(id),
  updated_at      TIMESTAMPTZ,
  deleted_by      INTEGER REFERENCES public.users(id),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT qms_job_roles_name_shape CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT qms_job_roles_description_len CHECK (description IS NULL OR char_length(description) <= 500),
  CONSTRAINT qms_job_roles_updated_pair CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
  CONSTRAINT qms_job_roles_deleted_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_roles_id_org_uq
  ON public.qms_job_roles (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_roles_live_name_uq
  ON public.qms_job_roles (organization_id, lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.qms_job_role_members (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  job_role_id     INTEGER NOT NULL,
  -- A global actor identity, not a membership FK: membership-change.ts hard-deletes
  -- organization_users rows, and history must survive offboarding (20261013b header).
  user_id         INTEGER NOT NULL REFERENCES public.users(id),
  added_by        INTEGER NOT NULL REFERENCES public.users(id),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_by      INTEGER REFERENCES public.users(id),
  removed_at      TIMESTAMPTZ,
  CONSTRAINT qms_job_role_members_role_same_org_fk FOREIGN KEY (job_role_id, organization_id)
    REFERENCES public.qms_job_roles (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_job_role_members_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_job_role_members_live_uq
  ON public.qms_job_role_members (organization_id, job_role_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_job_role_members_user_idx
  ON public.qms_job_role_members (organization_id, user_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.qms_training_assignments (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id),
  document_id     INTEGER NOT NULL,
  job_role_id     INTEGER,
  user_id         INTEGER REFERENCES public.users(id),
  assigned_by     INTEGER NOT NULL REFERENCES public.users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_by      INTEGER REFERENCES public.users(id),
  removed_at      TIMESTAMPTZ,
  CONSTRAINT qms_training_assignments_document_same_org_fk FOREIGN KEY (document_id, organization_id)
    REFERENCES public.qms_documents (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_training_assignments_role_same_org_fk FOREIGN KEY (job_role_id, organization_id)
    REFERENCES public.qms_job_roles (id, organization_id) ON DELETE NO ACTION,
  CONSTRAINT qms_training_assignments_one_subject CHECK (num_nonnulls(job_role_id, user_id) = 1),
  CONSTRAINT qms_training_assignments_removed_pair CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS qms_training_assignments_live_role_uq
  ON public.qms_training_assignments (organization_id, document_id, job_role_id)
  WHERE removed_at IS NULL AND job_role_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS qms_training_assignments_live_user_uq
  ON public.qms_training_assignments (organization_id, document_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_doc_idx
  ON public.qms_training_assignments (organization_id, document_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_role_idx
  ON public.qms_training_assignments (organization_id, job_role_id)
  WHERE removed_at IS NULL AND job_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qms_training_assignments_user_idx
  ON public.qms_training_assignments (organization_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;
```

**Soft delete.**
- A role is deleted by setting `deleted_at` and `deleted_by`.
- A member is removed, and an assignment withdrawn, by setting `removed_at` and `removed_by`.
- Nothing is hard-deleted.
- The live partial uniques let a name, member or assignment be added again after removal, and full history is kept.

**Place in the set.** In `C2C_MIGRATION_FILES`, immediately before `UUID_TENANT_ISOLATION_NONPUBLIC` (HEAD `:3638`), after the saved_precedent_queries entry (`:3637`). The comment block:

> "QMS job roles and training assignments (D2, P-49): after 20260511 (qms_documents) and 20261013b (qms_documents_id_org_uq); public with organization_id INTEGER NOT NULL, so the sweeps below police all three; every statement guarded; no DROP; no seed."

**Why it is replay-safe:**
- Nothing in either migration tree names these tables (searched).
- The named inline constraints exist from first creation, and `CREATE TABLE IF NOT EXISTS` is a no-op on every later deploy.
- Every index is `IF NOT EXISTS` and on these tables only.
- No object of another file is re-stated, altered or dropped. There is no constraint replacement, so `ci:migration-drop-safety` finds no DROP or NARROWED.
- There is no seed, so no row-count assertion is owed.
- No guard is attached to a table created later (`ci:migration-guard-order`).
- The file is in the root tree, and everything it depends on is created by a root-tree or base file (`ci:install-fresh-overlay-deps`).

**RLS.** `TENANT_ISOLATION_SWEEP`, which runs last, attaches `tenant_isolation_policy` to all three tables.

**Same change, outside the migration:**
- `PURGE_RETAINED_RECORDS` gains the three tables (D8), each with the reason: "Training requirement record (who was required to train on which controlled document, set by whom and when), retained with the qms_training_records receipts it gives meaning to; erased with them when QMS retention is decided."
- **No Drizzle definition**, as for `qms_document_versions`, so the migration stays the only creator.

**Gates**, each shown failing first:
- `ci:migration-set-order`: fails when the file is moved after the sweep;
- `ci:migration-drop-safety` and its selftest;
- `ci:migration-deploy-path`: fails when the file is left out of the set;
- `ci:migration-guard-order` and its selftest;
- `ci:install-fresh-overlay-deps` and its selftest;
- `ci:column-reachability`;
- `ci:purge-coverage`: fails when the tables are not retained;
- `audit:repo-health:ceiling`.

### 3.2 Who is assigned: one resolver

`QMS_TRAINING_ASSIGNEES_SQL` is exported from the new `server/services/qms/training-assignment.ts`. It is the only definition of "assigned".

- `readQmsTrainingAssignees(client, orgId, documentIds, { userIds? })` runs it.
- `isQmsTrainingAssignee(client, orgId, documentId, userId)` runs it with `$4 = [userId]`.

Parameters: `$1` organization, `$2` document ids, `$3` `ACCOUNT_STATUS_ACTIVE`, `$4` user ids or NULL.

```sql
WITH live AS (
  SELECT a.document_id, a.job_role_id, a.user_id, a.assigned_at
    FROM qms_training_assignments a
   WHERE a.organization_id = $1 AND a.document_id = ANY($2::int[]) AND a.removed_at IS NULL
), paths AS (
  SELECT l.document_id, m.user_id, 'role:' || r.id::text AS via,
         GREATEST(l.assigned_at, m.added_at) AS since
    FROM live l
    JOIN qms_job_roles r        ON r.id = l.job_role_id AND r.organization_id = $1 AND r.deleted_at IS NULL
    JOIN qms_job_role_members m ON m.job_role_id = r.id AND m.organization_id = $1 AND m.removed_at IS NULL
  UNION ALL
  SELECT l.document_id, l.user_id, 'person', l.assigned_at FROM live l WHERE l.user_id IS NOT NULL
), active AS (                       -- the predicate of training-compliance.ts:17-21, moved here once
  SELECT ou.user_id FROM organization_users ou
    JOIN users u ON u.id = ou.user_id JOIN organizations o ON o.id = ou.organization_id
   WHERE ou.organization_id = $1 AND u.status = $3 AND o.status = $3
)
SELECT d.document_id,
       (SELECT COUNT(*)::int FROM live WHERE live.document_id = d.document_id) AS assignment_rows,
       p.user_id,
       array_agg(DISTINCT p.via ORDER BY p.via) FILTER (WHERE p.user_id IS NOT NULL) AS via,
       MIN(p.since) AS covered_since
  FROM unnest($2::int[]) AS d(document_id)
  LEFT JOIN paths p ON p.document_id = d.document_id
                   AND p.user_id IN (SELECT user_id FROM active)
                   AND ($4::int[] IS NULL OR p.user_id = ANY($4::int[]))
 GROUP BY d.document_id, p.user_id
 ORDER BY d.document_id, p.user_id
```

The resolver returns, per document:
- `assignmentRows`;
- `assignees`: the distinct active people;
- per person, `via` (role ids and/or `person`) and `coveredSince`.

The roster query at `training-compliance.ts:17-23` is deleted. Its predicate is the `active` CTE above.

### 3.3 In force and trainable (`in-force-release.ts`)

```ts
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);
export const isoDayOf = (v: unknown): string | null => /* Date → toISOString, string → first 10 chars, else null */;
export const takesEffectLater = (row: QmsDocumentRow, now: Date): boolean =>
  row.status === 'effective' && !row.deleted_at && (isoDayOf(row.effective_date) ?? '') > utcDay(now);

export interface InForceRelease {
  release: QmsDocumentRow;          // in force, as approved
  underRevision: boolean;           // release is not the row (a draft/in_review revision, or a pending successor)
  pending: QmsDocumentRow | null;   // the row itself when approved for a later day
}
export async function readInForceReleases(client, orgId, rows, now = new Date()): Promise<Map<number, InForceRelease>>;
export async function readTrainableReleases(client, orgId, rows, now = new Date()):
  Promise<Map<number, { inForce: InForceRelease | null; pending: QmsDocumentRow | null }>>;
```

**Rules for `readInForceReleases`:**

1. An effective row that does not take effect later is in force itself: `{ release: row, underRevision: false, pending: null }`.
2. An effective row that takes effect later (`takesEffectLater`), opened as a revision (`metadata.lastRevision`, which approval keeps through `:357`), is pending, and its predecessor is in force: `{ release: predecessor, underRevision: true, pending: row }`. With no lastRevision it is a first version and nothing is in force, so the document is absent from this map.
3. Draft and in_review revisions keep today's rule.
4. **The predecessor lookup replaces `DISTINCT ON`.** One query returns every `signed`/`legacy-registry` snapshot of those documents, ordered as today: `ORDER BY document_id, approved_at DESC, id DESC`. Each row takes the first snapshot that:
   - has a `version` different from the row's;
   - passes `asRelease`;
   - does not take effect later.

   An authored v2.0 has its own signed snapshot (`:470-471`), and the old `DISTINCT ON` picked it and then dropped the document.

**`readTrainableReleases`** returns `readInForceReleases` beside `pending = takesEffectLater(row) ? row : null`, so a first version that is pending is still trainable.

**`inForceSummary`** gains `pendingVersion` and `pendingEffectiveDate`. Every register row gains `pending_effect: { version, effectiveDate } | null`, decided by the server.

**There is no event on the effective day.** On D the same read returns the row as in force, and the predecessor is superseded by that fact.

### 3.4 Reading and acknowledging

**The trainable flag (`training-content.ts:47-64`).**
- `:55` stops refusing a future date.
- The context gains `inForce: boolean`, meaning the effective date is on or before `utcDay(now)`, and `effectiveDate: string | null`.
- `eligible` keeps its meaning: may be acknowledged now.
- `verifiedTrainingReceipt` therefore verifies a pending receipt. Whether a receipt **counts** is decided only by matching it against the release in force (§3.6). The redundant date filter at `training-compliance.ts:31-36` is deleted.

**The schema (`shared/qms/training.ts:61-81`).**
- A base object gains `inForce: z.boolean().optional()` and `effectiveDate: z.string().date().nullable().optional()`.
- The exported context is `base.extend({ successor: base.nullable().optional() })`, with the existing `superRefine` applied to both.
- The acknowledgement input (`:13-18`) is unchanged.

**`readQmsTrainingContext` (`training.ts:81-94`):**
- The primary release is `inForce?.release ?? pending ?? document`.
- `successor` is the pending version's context, but only when both exist.
- Each context:
  - is authorized by `authorizeQmsTrainingRead` (§3.5);
  - is read through `readQmsTrainingReleaseContext`, so v2.0's own approval signature and its immutable snapshot are used;
  - carries its own `acknowledgement` from `currentReceipt`.
- A successor the reader may not open is returned with `eligible: false`, empty sections and the refusal sentence. The primary context's refusal stays a 403, as today.

**`recordAcknowledgement` (`training.ts:96-134`):**
- The candidates are `[inForce?.release, pending]`.
- The release is the candidate whose `version` equals the version in the request body.
- If neither matches, it answers 409 `QMS_TRAINING_STALE` (`:111`), as today.
- Everything after that is unchanged:
  - lock;
  - approval signature, read with `lock: true`;
  - idempotency;
  - 365-day expiry;
  - binding;
  - the chained audit row.
- The audit details (`:129-131`) and the receipt metadata gain `effectiveDate` and `inForceAtAcknowledgement`. `receiptSnapshot` (`:88-93`) ignores extra keys.

### 3.5 Being assigned lets a person read (D3)

`authorizeQmsTrainingRead(client, orgId, userId, release)` lives in `training-assignment.ts`, which imports `authorizeQmsContentRead`. There is no import cycle.

```ts
if (!release.authoring_document_id) return;                        // legacy inline text: org-visible, as today
if (await isQmsTrainingAssignee(client, orgId, release.id, userId)) {
  // the bound authored document must still exist in this organization (controlled-document-content.ts:69-70)
  return requireBoundAuthoredDocument(client, orgId, release.authoring_document_id);
}
return authorizeQmsContentRead(client, orgId, userId, release);    // unchanged path for everyone else
```

- It is used at `training.ts:87` and `:108` only.
- `/editor` (`mdx-qms.ts:428-442`) and `/versions` (`:444-460`) keep object permissions.

### 3.6 Compliance, expiry and outstanding training

**One compliance read:** `readQmsTrainingCompliance(client, orgId, viewerId, now)`.
- It replaces `readCurrentReceipts` and the roster.
- It covers every trainable document (existing candidate query, `:26-30`, `LIMIT 200`) that has a release in force or pending.

Each row:

```text
{ id, doc_number, title,
  document_version, content_digest, eligible, unavailable_reason,   // the release in force; null when none
  in_force_effective_date,
  assignment: 'assigned' | 'not_assigned' | 'no_active_assignees',
  current: number | null, of: number | null, last_cycle: string | null,
  pending: { version, effective_date, content_digest, eligible, acknowledged: number | null, of: number | null } | null,
  me: { assigned: boolean, countsNow: boolean, task: TrainingTaskState | null } }
```

- **`assignment`** is `not_assigned` when `assignmentRows = 0`, and `no_active_assignees` when there are assignment rows but no active person.
- **Denominator:** `of` is the number of distinct active assigned people. It is a number only when `assignment = 'assigned'` and a release is in force; otherwise null. A document assigned to nobody never reads 0/N.
- **Numerator:** `current` is the number of distinct people in that set who hold a verified receipt that:
  - matches the in-force release's document id, version and content digest (the existing match, `:50-51`);
  - was acknowledged at or before now;
  - expires after now, or never.
- **`pending.acknowledged`** counts verified receipts of the pending version among the same people. It is readiness for the effective day, never compliance.
- **`me`** is the session user's line, so each person sees their own obligation without a new route.

`meta.summary` is computed once, on the server, by the pure function `summarizeQmsTrainingCompliance(rows)`:
- `documents`;
- `assigned`;
- `notAssigned`;
- `noActiveAssignees`;
- `averageCurrentPct`: the mean of `current/of` over assigned, eligible rows; null when there are none.

The register KPI and the readiness block both read it. The client computes no percentage.

**The per-person task state** is one pure function, `trainingTaskOf(target, receiptOfTarget, coveredSince, today)`, used by the per-document read, `me`, G10 and the task planner:
- `target` is the pending version if there is one, otherwise the version in force.
- `lateAssignment` is true when `utcDay(coveredSince)` is after the target's effective day.
- `dueDate` is the target's effective day; when `lateAssignment` is true, it is `utcDay(coveredSince)` plus the grace days (0 until Q1).
- `status`:
  - `acknowledged` when a verified receipt of the target exists;
  - otherwise `overdue` when `today ≥ dueDate`, which is when the target is in force and matches `classifyDue`'s `due < now` for a task due `${dueDate}T00:00:00Z`;
  - otherwise `due`.
- `countsFrom` is the target's effective date when the person has acknowledged a pending target.

**G10, slice 3.** `readQmsTrainingExpiring` reads the assigned people only, with the same path and shape. Each row gains:
- `kind: 'lapsing'`;
- `successorAcknowledged: { version, effectiveDate } | null`, so a v1.0 lapse during the training period says "acknowledged v2.0; counts from D".

**G10, slice 5: the per-person view of outstanding training** (VEEVA_GAP §5 item 3). The same route also returns rows with `kind: 'due' | 'overdue'`:

```text
{ kind, userId, userName, documentId, docNumber, title, documentVersion, dueDate, daysLeft, lateAssignment }
```

- `overdue` rows are always listed; `due` rows are listed within the window.
- Order: overdue first, then due, then lapsing.
- At most 500 rows, with `meta.truncated`.
- One resolver and one receipt read; no second query.

**Readiness** (`mdx-qms.ts:249-260`). The training block converges on the one compliance read: `{ available, ...summarizeQmsTrainingCompliance(rows) }`. Its false comment is deleted. The documents block gains `pendingEffect`, and `under_revision` counts only draft and in_review rows. The route stays DEAD at launch; this keeps it from being a second compliance figure.

### 3.7 Approval: the effective date

- **A backdated date is refused, with one rule in two places:**
  - At the route, for an explicit `effectiveDate`, before the credential is asked: `refuseBackdatedEffectiveDate(date, now)` answers 422 `QMS_EFFECTIVE_DATE_BACKDATED`, "An effective date cannot be earlier than today (UTC). Nothing was signed." No password attempt is spent.
  - In `approveQmsDocumentSigned`, after `lockApprovableDocument` (`:406`) and before any write. The resolved date is `params.effectiveDate ?? isoDayOf(row.effective_date) ?? utcDay(occurredAt)`, and `occurredAt` moves up from `:417`. A resolved date before `utcDay(occurredAt)` throws `QmsApprovalRefusedError('EFFECTIVE_DATE_BACKDATED')`, mapped in `approvalRefusal` (`mdx-qms.ts:694-701`). This also catches a stored past date and a midnight crossing.
- **`applyApproval` sets `effective_date = $4::date` with the resolved date.** The `COALESCE` at `:356` goes (D9).
- **The date is recorded on the signature:**
  - The ledger payload (`:428-438`) and `extraManifest` (`:465`) gain `effectiveDate`. The manifest is covered by `signature_hash` (`manifestSignatureHash`), so the signature row records the date.
  - `exactManifest` (`current-release-approval.ts:30-46`) adds a check: when `manifest.effectiveDate` is present, it must equal `isoDayOf(document.effective_date)`, otherwise the state is `changed`. A date moved by direct SQL then fails training and periodic review closed for every signature made from now on.
  - The bound content digest still excludes the date (MR-12 Stage 3, left out), and the dialog says "recorded with your signature", not "covered by the content digest".

### 3.8 Routes

`server/routes/mdx-qms-training.ts` is a new sub-router, mounted by `mdx-qms.ts` with `router.use(qmsTrainingRouter)` next to `:940`.
- It is needed because `mdx-qms.ts` is 1,465 lines and the repo-health ceiling counts files over 1,500 lines (`scripts/audits/repo-health-scan.mjs:52`, `package.json:366`).
- The four existing training routes (`:879-937`) move there unchanged, as `e00873b6e5` moved the records routes.
- `/qms/documents/:id` matches a single path segment, so `/qms/documents/:id/training-assignments` is not captured by it.

**Common to every write:**
- Parameter ids must be positive integers, else 422.
- `governedQmsReason`, else 400 `REASON_REQUIRED`.
- `governedQmsActor`, else 401 `AUTH_REQUIRED`.
- The body is parsed with zod `.strict()`, else 422 `QMS_TRAINING_INPUT_INVALID` with `fieldErrors`.
- Then `governedQmsWrite`:
  - authority and refusals are decided inside the transaction as `GovernedRefusal`;
  - a 23505 on a live unique becomes a 409 `GovernedRefusal`;
  - the ledger pair is written on the same client with domain `qms`;
  - 500 `AUDIT_WRITE_FAILED` with nothing changed; 500 `OUTCOME_UNKNOWN` when the COMMIT is uncertain.
- A foreign id answers 404 (RLS plus an explicit `organization_id` predicate).

The bodies are in `shared/qms/training.ts`, and the reason uses `GOVERNED_REASON_MIN`/`MAX`:

```ts
const reason = z.string().trim().min(GOVERNED_REASON_MIN).max(GOVERNED_REASON_MAX);
const name = z.string().trim().min(1).max(80);
export const qmsJobRoleCreateSchema = z.object({ name, description: z.string().trim().max(500).optional(), reason }).strict();
export const qmsJobRoleUpdateSchema = z.object({ name: name.optional(), description: z.string().trim().max(500).nullable().optional(), reason })
  .strict().refine(b => b.name !== undefined || b.description !== undefined, { message: 'Change the name or the description.' });
export const qmsJobRoleMemberSchema = z.object({ userId: id, reason }).strict();
export const qmsTrainingAssignmentSchema = z.object({ jobRoleId: id.optional(), userId: id.optional(), reason })
  .strict().refine(b => (b.jobRoleId === undefined) !== (b.userId === undefined), { message: 'Name exactly one job role or one person.' });
export const qmsGovernedRemovalSchema = z.object({ reason }).strict();   // DELETE bodies (as TaskBoard.tsx:1521 sends)
```

**`governedQmsWrite` gains `opts.afterCommit?: () => Promise<void>`.** It runs after COMMIT and before `res.status(out.status).json(out.body)` at `:158`, inside try/catch with a log, as `runAfterCommit` does (`governed-signed-act.ts:184-190`). It never changes the answer. The request client is still leased at that point, because the response has not been sent.

The routes:

| Route | Who | Ledger (target · command · payload) | Refusals beyond the common ones |
|---|---|---|---|
| `GET /api/mdx/qms/job-roles` | any member | none | Returns `{ roles: [{ id, name, description, members: [{ userId, label, addedAt }], documentCount }], people: [{ userId, label }], canAdminister }`. `people` is the active roster labelled with `memberLabels`. |
| `POST /qms/job-roles` | `requireEditorAccess` + administrator | `qms-job-role:<id>` · create · `{ name, description }` | 403 `QMS_JOB_ROLE_AUTHORITY`; 409 `QMS_JOB_ROLE_EXISTS` |
| `PATCH /qms/job-roles/:id` | same | · update · `{ before, after }` | 404; 409 `QMS_JOB_ROLE_EXISTS` |
| `DELETE /qms/job-roles/:id` (soft) | same | · delete · `{ name }` | 404; 409 `QMS_JOB_ROLE_IN_USE` with `docNumbers` while a live assignment names it |
| `POST /qms/job-roles/:id/members` | same | `qms-job-role:<id>` · create · `{ change: 'member-added', userId, memberId }` | 422 `QMS_NOT_A_MEMBER` (`organization_users` row locked `FOR SHARE`, account and organization active); 409 `QMS_ALREADY_MEMBER`. `afterCommit`: reconcile the tasks for this person on each document assigned to the role. |
| `DELETE /qms/job-roles/:id/members/:userId` (soft) | same | · delete · `{ change: 'member-removed', userId, memberId }` | 404; 403 `QMS_TRAINING_SELF_UNASSIGN` when the target is the actor. `afterCommit`: as above. |
| `GET /qms/documents/:id/training-assignments` | any member | none | Returns `{ assignments: [{ id, kind: 'role' \| 'person', jobRoleId, jobRoleName, userId, userLabel, assignedBy, assignedAt }], trainable: { inForce: { version, effectiveDate } \| null, pending: … \| null }, people: [{ userId, label, via, countsNow, acknowledgedAt, expiresAt, task }], canAssign }`; 404 for a foreign document |
| `POST /qms/documents/:id/training-assignments` | `requireEditorAccess` + administrator or designated QMS approver | `qms-document:<id>` · create · `{ change: 'training-assigned', assignmentId, jobRoleId \| userId }` | 403 `QMS_TRAINING_ASSIGN_AUTHORITY`; 403 `QMS_DOCUMENT_VIEW_DENIED` when the actor cannot read the document (its release in force, else its working copy); 409 `QMS_NOT_TRAINABLE_TYPE` (`QMS_TRAINABLE_DOCUMENT_TYPES`); 409 `QMS_DOCUMENT_RETIRED`; 422 `QMS_JOB_ROLE_NOT_FOUND` (not live in this organization); 422 `QMS_NOT_A_MEMBER`; 409 `QMS_ALREADY_ASSIGNED`. The document row is locked `FOR SHARE`. `afterCommit`: reconcile the newly covered people. |
| `DELETE /qms/documents/:id/training-assignments/:assignmentId` (soft) | same | · delete · `{ change: 'training-unassigned', assignmentId, jobRoleId \| userId }` | 404; 403 `QMS_TRAINING_SELF_UNASSIGN` when the actor is covered by it (named, or holding the role). `afterCommit`: reconcile the people it covered. |

Changed routes:

| Route | Change |
|---|---|
| `POST /qms/documents/:id/approve` (`mdx-qms.ts:731-787`) | 422 `QMS_EFFECTIVE_DATE_BACKDATED`, before the credential and inside the service. After COMMIT, on the same held client and before `ok(res)`: the existing periodic-review task, then `reconcileTrainingTasks` for the document. Best effort; it never changes the 200 or the signature. |
| `POST /qms/documents/:id/retire` (`:819-877`) | After COMMIT, before `ok(res)`: reconcile with retirement. Every open training task for the document closes as cancelled. |
| `POST /qms/documents/:id/revise` (`:793-803`) | 409 `QMS_REVISION_PENDING_EFFECT` from the service (D6, §3.11). |
| `POST /qms/documents/:id/periodic-review` (`:510-544`) | 409 `QMS_REVIEW_PENDING_EFFECT` (§3.11). |
| `POST /qms/documents/:id/training-ack` (moved) | Body unchanged. A pending version is admitted. After the acknowledgement commits and before `created(res)`: reconcile this person on this document. A receipt of the target completes their task; acknowledging v1.0 during the period leaves the v2.0 task open. |
| `GET /qms/documents/:id` | `meta.training` gains `inForce`, `effectiveDate` and `successor`. |
| `GET /qms/documents`, `/qms/documents/review-due` | Rows gain `pending_effect`, and `in_force` gains the pending fields. `review_overdue` (the server's UTC day against `schedule.dueOf`) is added in slice 5. |
| `GET /qms/training/compliance` (moved) | Takes the viewer from the session for `me`, and adds `meta.summary`. Its comment and `hooks.ts:80-82` are rewritten. |
| `GET /qms/training/expiring` (moved) | Assigned people only (slice 3); outstanding rows added (slice 5). |

No "my training" route is added. The viewer's own line is `me`, their tasks are on the Tasks board, and the reader is reached from the notice.

### 3.9 Distribution through existing task infrastructure

`server/services/qms/training-task.ts` is a sibling of `periodic-review-task.ts`:

```ts
export const TRAINING_TASK_SOURCE = 'qms_training';
export const TRAINING_REMIND_DAYS = 7;                 // the due-soon notice, read by taskDueSweep's remindWindowMs
export const TRAINING_LATE_ASSIGNMENT_GRACE_DAYS = 0;  // Q1
const sourceId = (documentId: number, userId: number) => `qms-document:${documentId}:user:${userId}`;
const prefixOf = (documentId: number) => `qms-document:${documentId}:user:`;   // ends in ':' so document 1 never matches 10
```

**One open task per person per document.**
- Module `Quality`, `taskType: 'action'`, `category: 'qms-training'`.
- Assigned to the person; `createdById` is the actor.
- Title: "Read and acknowledge `<doc_number>` v`<version>`".
- `dueDate`: `${dueDate}T00:00:00Z`.
- `metadata: { documentId, userId, version, dueDate, lateAssignment, remindDaysBefore: 7, kind: 'acknowledge' }`.
- The description says where to act (Quality, Controlled documents, Read and acknowledge). For a pending version it adds "your acknowledgement counts from `<D>`".

**Plan, then apply.** `planTrainingTasks(client, orgId, documentIds, { userIds?, retire? }, now)` is read-only and runs on the request client or the held approval client. It uses:
- `readTrainableReleases`;
- `readQmsTrainingAssignees`;
- the verified receipts;
- `trainingTaskOf` for each person.

It returns, per document:
- `desired`: a map from source id to the next task, for assigned people whose status is not `acknowledged`;
- `acknowledged`: the source ids of people with a receipt of the target.

`applyTrainingTasks(plan, actorId)` calls **`reconcileSourceTasks`**, which is added to `source-task.ts`:

```ts
reconcileSourceTasks({ organizationId, sourceEntityType, match: { exact: string } | { prefix: string },
  desired: Map<string, { next: SourceTaskNext; same: (meta) => boolean }>,
  closeAs: (sourceEntityId: string) => 'completed' | 'cancelled', actorId }): Promise<{ kept; closed; written; failed }>
```

- It runs one SELECT of the open tasks for that source type, matched with `left(source_entity_id, length($p)) = $p` (no LIKE wildcards). For each open task:
  - kept when `desired` has it and `same(meta)` holds (same version and due date);
  - closed when it is not desired: as completed if the person's id is in `acknowledged`, otherwise as cancelled (unassigned, superseded, retired).
- Missing tasks are written with `createUnifiedTask`.
- **`replaceSourceTask` becomes its single-key case** (`match: { exact }`), so there is one implementation, and its existing tests (`source-task.test.ts`) stay green.
- Best effort, never throws, global `db`, as today.
- **Fail closed:** a plan that could not be read (`null`) applies nothing. Only a successfully read empty set closes tasks.

**Notices and sweep markers for each newly written task.**
- It is written with the markers its assignment notice already covers:
  - due day ≤ today: `dueSoonNotifiedAt = overdueNotifiedAt = now`, so the sweep sends no "Overdue" notice for a task born past due;
  - due within 7 days: `dueSoonNotifiedAt = now`;
  - otherwise no marker.
- Then one `notifyTaskEvent({ category: 'task_assigned', severity: 'info', recipientUserId, taskId, title: 'Training: read and acknowledge <doc> v<version>', body })`. The body is one of:
  - "Due `<D>`, the day it takes effect. Your acknowledgement counts from then.";
  - "Due `<D>`.";
  - "`<doc>` v`<version>` is in force; read and acknowledge it now." for a late assignment.
- After that, the existing sweep sends one due-soon notice 7 days before the due date and one overdue notice on the due date (`taskDueSweep.ts:46-74`, `:111-132`).

**Events:**

| Event | Plan scope | What happens |
|---|---|---|
| Approval of a version | the document, all assignees | v`prev` tasks are cancelled; v`new` tasks written. Approving the same version again changes nothing. |
| Assignment added | the document, the people newly covered | Tasks for people without a receipt of the target. |
| Assignment removed | the document, the people it covered | Cancelled unless the person is still covered by another path. |
| Role member added or removed | that person, each document assigned to the role | Only that person's tasks; no fan-out to the rest of the role. |
| Acknowledgement | that person, that document | Completed when it is a receipt of the target. |
| Retirement | the document | Every open training task is cancelled. |
| Revise | none | Refused while pending (D6). A revision of an in-force version leaves v1.0's tasks standing. |
| The effective date arriving | none | No event and no write. |

**The notice opens the reader.**
- `taskTarget` (`notification-record-target.ts:133`): a task whose `source_entity_type = 'qms_training'` resolves to `qualityTarget` for the document id parsed from its source id.
- `qualityTarget` (`:96`): when the recipient `isQmsTrainingAssignee`, it returns `{ surface: 'quality', params: { qmsDocumentId, qmsIntent: 'read' }, programId: null }` without asking view on the editing copy. Anyone else gets today's check.
- `notification-navigation.ts:23,38`: `quality: ['qmsDocumentId', 'qmsIntent']`, where `qmsIntent` may only be absent or `'read'`.
- `QualityModule.tsx`, `QualityRoute.tsx` and `App.tsx` thread `qmsIntent` through. `SopRegister.tsx:226-234` opens the `PersonalTrainingReader` on the successor instead of the editor when the intent is `read`.

### 3.10 Retraining when v2.0 comes into force

- **Assignments are unchanged**: they belong to the document.
- **The v2.0 tasks were written at approval, due D.**
- **Until D**, compliance counts unexpired v1.0 receipts. v1.0 can still be acknowledged (new hires, renewals), and v2.0 progress shows apart (`pending.acknowledged` of `pending.of`).
- **From D**:
  - v2.0 is in force and v1.0 receipts no longer match (they stay as history in `qms_training_records`);
  - compliance is assigned people with v2.0 receipts over assigned people;
  - people who trained during the period are current at D;
  - the rest are overdue and the sweep says so once;
  - G10 follows the v2.0 receipts.
- **Nothing is stamped and no scheduler runs.**
- **A task completed by hand on the Tasks board** does not change compliance (only receipts count). The next event that plans the document writes the task again.

### 3.11 The rest of the lifecycle during a training period

- **Periodic review:**
  - `readQmsReviewSchedule.dueOf` returns the **pending row's** `next_review_date` for an entry with `pending`. The approval that set it is the review event; refusing to review a revision already says "Approving the revision sets the next review date" (`periodic-review.ts:158`).
  - So the approve route's `schedulePeriodicReviewTask(result.document.next_review_date)` (`mdx-qms.ts:768`) and the register now give one answer.
  - `refuseUnlessEffective` gains 409 `QMS_REVIEW_PENDING_EFFECT`, worded like `QMS_REVIEW_UNDER_REVISION`: "`<doc>` v2.0 is approved and takes effect on `<D>`; its approval set the next review date. A review can be recorded once it is in force. Nothing was signed." The code is added to `QMS_PERIODIC_REVIEW_CODE_STATUS`.
  - The register's Record review is already hidden, because `canRecordReview` is false when `underRevision` (`PeriodicReview.tsx:58`).
- **Revise:** `reviseControlledQmsDocument` refuses a row that `takesEffectLater`:
  - before branching (`:214-217`);
  - again under the lock in both transactions (`:231-246`, `:276-279`).
  - It answers 409 `QMS_REVISION_PENDING_EFFECT`: "v2.0 of `<doc>` is approved and takes effect on `<D>`; v1.0 governs until then. Open a revision once v2.0 is in force, or retire the document. Nothing was revised."
  - AnA's tool inherits this.
- **Retire:** admitted as today. The document leaves force, and its tasks are cancelled.
- **Register and readiness:**
  - `pending_effect` on every row;
  - `in_force` summary for a pending successor;
  - readiness `pendingEffect` (§3.6).
- **Report:** `withVersionInForce` (`controlled-documents.ts:170-200`) works unchanged through `underRevision`. `run()` gains the note: "A document whose next version is approved but not yet effective is listed as that version, with its effective date; the version still in force until then, its effective date and the standing signature that approved it are given beside it." "In force" is decided at generation time (D7).

### 3.12 Client: controls only in existing files

**Slice 1: `TrainingCoverage.tsx`, a `JobRoles` panel** (a `DialogPanel`), opened from a "Job roles" button in the training section header of `SopRegister.tsx:573-576`.
- It lists roles and members.
- When `canAdminister` is true it offers create, rename, delete, add member (`PeoplePicker` fed by `people`) and remove member. Each takes a `ReasonField`.
- A refused write shows the server's sentence followed by "Nothing was changed."
- A failed read is `ErrorState`, never "no roles".

**Slice 2:**
- **`SopRegister.tsx`**: a "Training" chip on each non-retired row of a trainable type, next to `DocumentReadButton` (`:491`). It opens the `TrainingAssignments` panel.
- **`TrainingCoverage.tsx`, the `TrainingAssignments` panel**:
  - roles and named people, with who assigned them and when;
  - when `canAssign`: "Assign a role" (a select of live roles), "Assign a person" (`PeoplePicker`), and Remove, each with a reason;
  - the people list with their `via` and task state.
- **Wiring:**
  - `hooks.ts` gains `useJobRoles` and `useTrainingAssignments(documentId)` on `useFetchJson`, with honest loading and failed states;
  - `qmsWrites.ts` `send`/`qmsWrite` accept `'DELETE'`.

**Slice 3:**
- **`hooks.ts:94-95`**: the `?? 0` mapping is deleted. `useTrainingCompliance` maps `assignment`, `current: number | null`, `of: number | null`, `pending`, `me` and `meta.summary`.
- **`data.ts`**:
  - `TrainingRow` is typed to match;
  - `QmsDoc` gains `pendingEffect`;
  - `qmsDocumentRecord.ts` maps `pending_effect` and the pending fields of `in_force`.
- **`TrainingCoverage.tsx` `CoverageRow` (`:33-47`)** renders one of four states, never a fallback percentage:
  - "x of y assigned" with the bar, only when `assignment = 'assigned'` and `current !== null`;
  - "Not assigned", with no bar and no fraction;
  - "Assigned role has no active members";
  - "Nothing in force until `<D>`".

  It also shows:
  - the pending line "v2.0 takes effect `<D>`: k of N assigned have read it";
  - the personal line from `me`: "You: current", "Due `<D>`", "Overdue since `<D>`", "Due now (assigned after v1.0 took effect)", "Acknowledged v2.0; counts from `<D>`", or nothing when the viewer is not assigned.
  - The header meta becomes "Version in force · assigned people", and the summary sentence drops "role-based training requirements".
- **`SopRegister.tsx`**:
  - **coverage KPI** (`:357-371`): reads `meta.summary.averageCurrentPct`; its sub-line is "No document is assigned yet" when nothing is assigned, otherwise "Average of assigned people, version in force";
  - **`effectiveCount`** (`:252`) excludes a first version that is pending;
  - **status pill**: a pending row shows "Approved · takes effect `<D>`" instead of "Effective";
  - **in-force pill title** (`:479`): "v1.0 stays in force until v2.0 takes effect on `<D>`";
  - **Effective column** (`:488`): adds "v2.0 from `<D>` (pending)";
  - **Revise** is hidden for a pending row.
  - **Approve dialog** (`:600-615`):
    - a required effective-date input through `renderMeaningDetails`, showing UTC days with min and default `utcDay(now)` and the note "The version takes effect at 00:00 UTC on this date";
    - a `signedRows` entry "Effective from `<D>` (recorded with your signature)";
    - `targetMeta` built from `useTrainingAssignments`:
      - "N people are assigned. Effective today leaves them no training period: their tasks are due now.";
      - or "N assigned people get a task to read it, due `<D>`.";
      - or "No one is assigned to train on this document." when there are none;
      - or "Who is assigned could not be read." when the read failed.
  - `qmsApproval.ts` `postQmsApproval` sends `effectiveDate` for kind `document`.
- **`PersonalTrainingReader.tsx`**:
  - It opens on the version in force, the procedure people follow today.
  - When `context.successor` exists, a notice above the content reads "v2.0 is approved and takes effect on `<D>`. [Read v2.0]", with a two-option toggle between "In force: v1.0" and "Takes effect `<D>`: v2.0".
  - The declaration and `usePersonalTrainingAcknowledgement` act on the selected context.
  - For a context with `inForce === false`, the declaration says "Your acknowledgement is recorded now and counts from `<D>`", and the receipt block (`:130-140`) adds "Counts from `<D>`".
  - Opened from a training notice (`qmsIntent: 'read'`), it starts on the successor.

**Slice 4:** the deep-link intent in `QualityModule.tsx`, `QualityRoute.tsx`, `App.tsx` and `SopRegister.tsx:226-234`.

**Slice 5:**
- **`TrainingExpiry.tsx`**:
  - heading "Training due and lapsing", meta "Next 60 days · assigned people";
  - rows for overdue, due and lapsing, with the server's words;
  - empty sentence: "No assigned person has training due or lapsing in the next 60 days.";
  - `hooks.ts` `isExpiryRow` becomes a discriminated check on `kind`.
- **Last client review computation removed:**
  - `data.ts` `todayUtc`/`isReviewOverdue` (`:145-153`) are deleted;
  - `deriveReviewDue`/`reviewRowOf` take the server's `review_overdue`;
  - `SopRegister.tsx:464` reads `d.reviewOverdue`.

  This is MR-12 Stage 1 step 5. The hard-coded TODAY itself was removed in `c1d46c86c5`.
- **Styles** go in `quality/app.css`.

**Across all slices**, every count, date and state comes from the server.

---

## 4. Tests first: each written and run red at HEAD

The red output is kept under `docs/evidence/MR-12/<date>-training-assignment/`.

### Slice 1

**`tests/schema-contract/qms-training-assignments-replay.pglite.test.ts` (new).** On PGlite with the prerequisite files:
- applying the file twice raises nothing and leaves `pg_constraint`/`pg_indexes` unchanged;
- `num_nonnulls` refuses a row with both subjects null and a row with both set;
- the live partial uniques allow re-adding after a soft removal;
- the same-org FKs refuse a role or a document of another organization.

Red at HEAD: the file does not exist.

**`tests/db/qms-job-roles.dbtest.ts` (new).** Real PostgreSQL, `RLS_ENFORCE=on`, `app_service`, through the real routes (pattern: `tests/db/qms-periodic-review-reminders.dbtest.ts`):
- an administrator creates a role: one row and one ledger pair, in one transaction;
- a viewer gets 403 (`requireEditorAccess`);
- a member, a manager and an approver each get 403 `QMS_JOB_ROLE_AUTHORITY`;
- a 7-character reason gets 400 `REASON_REQUIRED`, with nothing written;
- a duplicate name in a different case gets 409 `QMS_JOB_ROLE_EXISTS`;
- adding an org-B user gets 422 `QMS_NOT_A_MEMBER`;
- org B reading or changing org A's role gets 404;
- member removal is soft;
- removing oneself gets 403 `QMS_TRAINING_SELF_UNASSIGN`;
- deleting a role that is in use gets 409 `QMS_JOB_ROLE_IN_USE`;
- a forced ledger failure gives 500 `AUDIT_WRITE_FAILED` and no row.

Red at HEAD: 404 on every route.

**`server/routes/__tests__/qms-subrouters-governed.test.ts` (extended).** `governedQmsWrite`'s `afterCommit`:
- runs after COMMIT and before `res.json`;
- is not run when the write is refused or rolled back;
- a throw is logged and leaves the 2xx response unchanged.

Red at HEAD: the option does not exist.

**Migration gates.** Each is shown failing on the case it exists to catch, then passing:
- `ci:migration-set-order` (the file moved after the sweep);
- `ci:migration-deploy-path` (the file left out of the set);
- `ci:purge-coverage` (the tables not retained);
- `ci:install-fresh-overlay-deps` (a temporary FK to `qms_document_org_id_key`'s db-tree-only parent);
- `ci:migration-guard-order` and `ci:migration-drop-safety` (their selftests).

### Slice 2

**`tests/db/qms-training-assignments.dbtest.ts` (new):**
- assignment by role and by name works for an administrator, a designated QMS approver, and the Approver-role stand-in;
- a member or a manager gets 403 `QMS_TRAINING_ASSIGN_AUTHORITY`;
- an approver who cannot read the authored document gets 403 `QMS_DOCUMENT_VIEW_DENIED`;
- a duplicate gets 409 `QMS_ALREADY_ASSIGNED`;
- a foreign document gets 404;
- a foreign or deleted role gets 422 `QMS_JOB_ROLE_NOT_FOUND`;
- a form or a spec gets 409 `QMS_NOT_TRAINABLE_TYPE`;
- a retired document gets 409 `QMS_DOCUMENT_RETIRED`;
- a body naming both `jobRoleId` and `userId` gets 422;
- the GET resolves the people correctly:
  - distinct named people plus role members, active only;
  - a person reached by a role and by name appears once, with both paths in `via`;
  - removed members, removed assignments, deleted roles, suspended users and users of another organization are excluded;
- removal is soft and audited;
- removing an assignment that covers the actor (named, or by a role they hold) gets 403 `QMS_TRAINING_SELF_UNASSIGN`.

Red at HEAD: 404.

**Being assigned lets a person read (same file).**
- An assigned viewer with **no** `doc_permissions` grant and no project access reads v1.0 through `GET /qms/documents/:id` (200, with sections) and acknowledges it (201).
- An unassigned viewer without a grant still gets 403 `QMS_DOCUMENT_VIEW_DENIED`.
- The assigned viewer still gets 403 on `/editor` and `/versions`.

Red at HEAD: 403 for the assigned viewer.

### Slice 3

**`server/services/qms/__tests__/training-compliance.pglite.test.ts`** (the production query on real PostgreSQL; its prerequisites include the new file):

- **(d′), the red form of MR-12 (d)**, which is already green at `:98-117`:
  - v1.0 is in force and A acknowledged it;
  - v2.0 is approved with effective date NOW+10d;
  - the row reads v1.0 with `current=1`. Red at HEAD: the document disappears from compliance;
  - B's v2.0 receipt gives `pending.acknowledged=1` and does not count;
  - C acknowledges v1.0 during the period and counts;
  - at NOW+10d the row is v2.0 with `current=1` (B), and the v1.0 receipts of A and C no longer count.
- **(e)** A document is assigned to role QA {10, 11} plus named people 11 and 12, with 13 suspended, 15 departed and 16 in another organization. It gives `of=3`. Red at HEAD: `of` is the roster.
- **(f)** An unassigned document gives `assignment:'not_assigned'` with `current` and `of` null. A role with no active members gives `no_active_assignees` with nulls. Red at HEAD: `0/3`.
- **`me` and `meta.summary`**: `averageCurrentPct` is null when nothing is assigned.
- **G10**: assigned people only, and `successorAcknowledged` on a v1.0 lapse during the period.
- **Intended contract change**: the existing roster assertions (`:109-177`) are rewritten to assignments, and the commit says so.

**`tests/db/qms-in-force-during-revision.dbtest.ts` (extended).** Its `beforeAll` names the trainees by assignment, which replaces part of the hand grant at `:176-182`.
- Approving v2.0 for a future date keeps v1.0 in force for:
  - the register (`in_force` and `pending_effect`);
  - readiness;
  - review-due, where `dueOf` is v2.0's signed date;
  - the report, with the new note.
- Acknowledging v2.0 answers 201, with the receipt bound to v2.0's digest and its approval signature id.
- Acknowledging v1.0 during the period answers 201. Red at HEAD: 409 `QMS_TRAINING_UNAVAILABLE`/`STALE`.
- A periodic review of the pending row gets 409 `QMS_REVIEW_PENDING_EFFECT`.
- Revising the pending row gets 409 `QMS_REVISION_PENDING_EFFECT`, through both the route and AnA's tool.
- An approval with a past `effectiveDate` gets 422 **before the credential**: no signature, no ledger row, no failed-attempt count.
- An in_review row with a stored past `effective_date` and no `effectiveDate` gets 422.
- The approval's manifest and ledger payload carry `effectiveDate`.
- Changing `effective_date` by SQL afterwards makes the training context `changed`.

Red at HEAD: 200 for each approval; no manifest key.

**Existing tests updated for the intended contract change:**
- `tests/db/qms-current-signing-and-training-admission.dbtest.ts:224-226` (`current: 0` becomes `assignment:'not_assigned', current:null`);
- `qms-in-force-during-revision.dbtest.ts:127,134,192`.

**Client tests:**
- `SopRegisterPersonalTraining.test.tsx`:
  - "Not assigned" renders with no "0/" text;
  - "2 of 3 assigned";
  - the KPI shows "—" with "No document is assigned yet";
  - the pending line and the `me` line.
- `PersonalTrainingReader.test.tsx`: opens on v1.0; offers v2.0; "counts from `<D>`".
- `SopRegisterApproval.test.tsx`:
  - the date is required, with a UTC-day minimum;
  - `effectiveDate` is sent;
  - "N people are assigned … no training period".
- `SopRegisterInForce.test.tsx`: a pending pill; Revise and Record review hidden.

Red at HEAD: none of these exist.

**Unit (`in-force-release`):**
- `takesEffectLater` and `utcDay` at the UTC day boundary;
- the predecessor pick skips the row's own signed v2.0 snapshot.

### Slice 4

**`tests/db/qms-training-tasks.dbtest.ts` (new):**
- Approving a version with three assignees (one reached both by role and by name) writes exactly three Quality tasks:
  - source `qms_training`, due `${D}T00:00:00Z`, one assignee each, `remindDaysBefore: 7`;
  - one `task_assigned` notice each;
  - no task or notice for an unassigned member.
- Re-running the reconcile writes nothing.
- An acknowledgement of v2.0 completes only that person's task; an acknowledgement of v1.0 leaves the v2.0 task open.
- Adding an assignment during the period writes tasks only for the newly covered people.
- Removing a role keeps the task of a person who is still named.
- Approving v3.0 cancels the open v2.0 tasks and writes v3.0 tasks.
- Retirement cancels all of them.
- A late assignment on an in-force SOP:
  - writes a task due today with both markers stamped;
  - the notice says "read and acknowledge it now";
  - `runTaskDueSweep` sends it no "Overdue" notice.
- A task due in 20 days gets one due-soon notice at D−7 and one overdue notice at D (sweep run with a fixed clock).
- With task writes forced to throw, the approval still answers 200 and the signature stands.
- With the plan's read forced to fail, nothing is closed.
- An assignment add finds its tasks present when its response arrives. This fails if the reconcile runs after `res.json` on a released client (the reviewers' fatal flaw).

Red at HEAD: no tasks are written.

**`server/services/tasking/__tests__/source-task.test.ts` (extended):**
- `reconcileSourceTasks` keeps, closes and writes correctly;
- the prefix `qms-document:1:user:` never matches `qms-document:10:user:5`;
- `replaceSourceTask` behaves exactly as before.

**`server/services/notifications/__tests__/`, a notification-target case:**
- a training task's notice resolves to `{ surface:'quality', params:{ qmsDocumentId, qmsIntent:'read' } }` for an assignee without object permissions;
- a non-assignee without permissions gets 404.

Red at HEAD: the notice resolves to the Tasks board.

### Slice 5

- `TrainingExpiry.test.tsx`: overdue, due and lapsing rows; labels; a failed read shows `ErrorState`.
- `reviewOverdueToday.test.ts` moves to the server flag: the register flags overdue from `review_overdue` only.
- `SopRegisterIdentity.test.tsx` updates its read count.
- `TrainingAssignments` and `JobRoles` panel tests, written in slices 1 and 2, in the existing `SopRegisterPersonalTraining.test.tsx`:
  - an editor with `canAssign` sees and uses the controls, posting `{ jobRoleId, reason }` and `{ userId, reason }`;
  - a member without it sees the list and no controls.

### Mutations

Each mutation is shown failing its test, then reverted:
- removing the version match makes (d′) fail;
- reading `organization_users` instead of the resolver makes (e) fail;
- returning `of: 0` makes (f) fail;
- dropping the self-covered check makes the self-unassign case fail;
- moving `afterCommit` after `res.json` makes the response-ordering task case fail;
- dropping the trailing `':'` makes the prefix case fail;
- dropping the creation markers makes the late-assignment sweep case fail.

---

## 5. Build order: each slice lands green on `concept2cure-v2`

1. **Job roles: the store, the routes and the panel.**
   - The migration and its set entry.
   - Purge retention.
   - `training-assignment.ts` (job-role functions).
   - `mdx-qms-training.ts`, with the four training routes moved unchanged.
   - `governedQmsWrite.afterCommit`.
   - The `JobRoles` panel and the "Job roles" button.
   - `qmsWrites` DELETE support.

   Every new route has a client caller (`audit:orphaned-endpoints:strict` holds).
2. **Assignment by role and by name, and read admission.**
   - The assignment routes and the resolver.
   - `authorizeQmsTrainingRead`.
   - The `TrainingAssignments` panel and the Training chip.
3. **NEW-3 and compliance over the assigned people.**
   - Server:
     - resolver `pending`; both versions acknowledgeable; the context schema;
     - compliance with `me` and `summary`; G10 population;
     - the backdate bound and the date on the signature;
     - the periodic-review and revise refusals;
     - `dueOf` for a pending successor; `pending_effect`;
     - readiness convergence; the report note.
   - Client, in the same slice so no screen ever shows 0/0:
     - the `hooks.ts` and `data.ts` honest states; `CoverageRow`; the KPI;
     - pending pills; the approve-dialog date and N assigned;
     - the reader's successor.
   - Q1 to Q3 are filed with this slice's evidence.
4. **Distribution.**
   - `training-task.ts`; `reconcileSourceTasks`.
   - Planning in the approve, retire, acknowledgement and governed-write paths.
   - Notices and creation markers.
   - The notification target and the reader deep link.
5. **G10 outstanding training, and the last client review computation.**
   - The due and overdue rows in `GET /qms/training/expiring` and in `TrainingExpiry.tsx`.
   - `review_overdue` from the server; delete `todayUtc` and `isReviewOverdue`.

**Each slice also:**
- runs and records `npm run check`, `ci:*` migration gates, `audit:repo-health:ceiling`, `audit:orphaned-endpoints:strict`, and the named tests (red, then green);
- updates the MR-12 Stage 4 status;
- closes CAT2-21 in `docs/work-orders/MR-findings-2026-10-13.json` with the slice-3 commit;
- re-checks the migration suffix and set position immediately before committing, because another session's merge was open in the shared working tree.

---

## 6. What is left out

- **Curricula tables.** The path is designed (§1.1); no tables are added now.
- **Refresh tasks before a receipt lapses.** They would use the same source id, written at acknowledgement and due at `expires_at`. G10 lists lapses today.
- **An e-signed acknowledgement.** It stays an attestation; the signed act is MR-12 Stage 1.
- **Quizzes, competency, classroom and eLearning.** Parity §6: partner or integrate.
- **A training-matrix report in Reporting & analytics.**
- **NEW-4.**
- **MR-12 Stage 3**: digest v2 that signs the effective date, a required `effectiveDate` (400 when missing), and artifact binding.
- **Withdrawing a pending approval before its effective date** (a new governed act). Until then, D6 refuses revision of a pending version.
- **An upper bound on the effective date.**
- **Clean-up when a member leaves the organization**: their role memberships, named assignments and open tasks stay as they are (Risk 10).
- **"In force" as of the report date** (D7).
- **A grace period beyond the constant** (Q1).
- **MR-11 Stage 6 step 8** as a consumer of this compliance read.
- **The `mdx-health.service.ts` required-table list.**

---

## 7. Risks

1. **The resolver change touches every reader of "in force"**: the register, review-due, readiness, the report, training and periodic review. A document already approved with a future date through the API now shows its predecessor in force, or nothing in force, until that date. That is the correct reading and it is pinned by tests. The UI has never sent a date (`qmsApproval.ts:41-48`), so few documents are affected.
2. **Coverage figures change on purpose.** A tenant with no assignments goes from roster percentages to "Not assigned", and the KPI shows "—". This is P-49's honest state, but users may read it as figures disappearing. The commit and the evidence say so.
3. **D3 widens who can read authored SOP text**: to the assigned people, through the reader only. It is bounded by:
   - the assignment authority;
   - the rule that an assigner must be able to read the document;
   - the released snapshot only.

   The founder is asked to confirm it (Q2), and the fallback is defined.
4. **Tasks are best effort.** A missed task is logged and healed by the next event that plans that document. Compliance never reads tasks. A task completed by hand is rewritten later.
5. **Response time on approval.** Approving a document with a large role writes N tasks and N notices before the response. The SELECT is batched and the inserts are N. It is bounded by the roster; a 500-person role adds noticeable time to the approve response.
6. **A late assignment is due the day it is made** (Q1). The person gets one assignment notice, no overdue notice, and an overdue status in the reads.
7. **Training early shortens coverage after the effective date**, because a receipt expires 365 days after acknowledgement (`training.ts:114`).
8. **Every member sees every person's training status** (Q3), as `GET /qms/training` already allows.
9. **Time zone.** `pg` returns `DATE` as a local-midnight `Date` (no `setTypeParser` in `server/`), and snapshots store it as JSON. Every date read here, as already at `training-content.ts:55` and `training-compliance.ts:31`, is correct only when the process runs in UTC. The unit tests run under `TZ=UTC`; pinning `TZ=UTC` in deployment is recommended.
10. **Departed members.** A member who leaves and rejoins keeps the job roles and named assignments they held; the panel shows them. A departed member's open task stays open until the next event plans that document.
11. **The backdate refusal** (422) breaks any caller that relied on a stored past `effective_date` through `COALESCE`. Tests and fixtures that approve such rows are updated.
12. **The effective date is still outside the content digest.** The manifest and ledger now record it, and a moved date fails training and review closed, but only for signatures made from now on.
13. **No revision while pending.** An error found in v2.0 before its effective date cannot be fixed by revision until that day. The remedies are to retire and replace, or to wait. Withdrawal is left out.
14. **File sizes.** `TrainingCoverage.tsx` grows to roughly 300 lines, so the two panels stay out of `SopRegister.tsx` (635 lines). `mdx-qms.ts` shrinks by about 60 lines.
15. **Retention.** If QMS erasure is decided later, the three retained tables go with `qms_training_records` (D8).

---

## 8. Files

**New:**
- `migrations/20261029g_qms_job_roles_and_training_assignments.sql`
- `server/services/qms/training-assignment.ts`
- `server/services/qms/training-task.ts`
- `server/routes/mdx-qms-training.ts`
- Tests: `tests/schema-contract/qms-training-assignments-replay.pglite.test.ts`, `tests/db/qms-job-roles.dbtest.ts`, `tests/db/qms-training-assignments.dbtest.ts`, `tests/db/qms-training-tasks.dbtest.ts`
- `docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md` (this document)
- `docs/evidence/MR-12/<date>-training-assignment/README.md`

**Changed, server and shared:**
- `scripts/db/migration-set.mjs`
- `server/services/tenant/tenant-offboarding.ts`
- `server/services/qms/in-force-release.ts`, `training-content.ts`, `training.ts`, `training-compliance.ts`, `current-release-approval.ts`, `document-approval-signature.ts`, `periodic-review.ts`, `controlled-document-service.ts`, `governed-qms-write.ts`
- `server/services/tasking/source-task.ts`
- `server/services/notifications/notification-record-target.ts`
- `server/routes/mdx-qms.ts`
- `server/services/audit/compliance-reports/queries/controlled-documents.ts`
- `shared/qms/training.ts`, `shared/types/notification-navigation.ts`

**Changed, client:**
- `client/src/concept2cure/quality/`: `SopRegister.tsx`, `TrainingCoverage.tsx`, `TrainingExpiry.tsx`, `PersonalTrainingReader.tsx`, `usePersonalTraining.ts`, `hooks.ts`, `data.ts`, `qmsDocumentRecord.ts`, `qmsWrites.ts`, `qmsApproval.ts`, `App.tsx`, `QualityRoute.tsx`, `app.css`
- `client/src/concept2cure/v2/surfaces/QualityModule.tsx`

**Changed, tests:** the existing tests named in §4.

**Changed, docs:**
- `docs/work-orders/MR-12-qms-controlled-document-control.md`
- `docs/work-orders/MR-findings-2026-10-13.json`

---

## 9. How the reviewers' must-fixes are applied

Where the reviewers disagreed, the decision and the reason are in the D-row named.

| Must-fix | Applied |
|---|---|
| Assigned people cannot read authored SOPs | D3 (read through the reader, released snapshot only), with the fallback stated. Grants on each editing copy were rejected, with the reason (§1.3). |
| Background reconcile ran on a released request client | `governedQmsWrite.afterCommit` runs before the response. Approve and retire plan on the held client before `ok(res)`. A plan that could not be read applies nothing. A test fails if the order regresses (§3.8, §4). |
| One trainable version contradicts G10 and leaves new hires unable to comply | Both versions can be acknowledged during the period. G10 shows `successorAcknowledged`. The reader opens on the version in force (§1.2, §3.4, §3.12). |
| Tasks born overdue, and the day-one flood | Creation markers, one assignment notice, the approve dialog shows N and the no-period warning, Q1. A role-member change plans only that person (§3.9). |
| Self-removal hole, and who may remove an assignment | Assignment add and remove need an administrator or QMS approver. Removing an assignment that covers the actor is refused (D4). |
| Reuse the administrator gate; manager admitted? | `ADMINISTRATOR_ROLES`, read in-transaction. Manager is not admitted. `rolesHeldBy` was rejected (D4). |
| Revising a pending version | Refused, through both paths and AnA (D6, §3.11). |
| Periodic review during the pending period | `dueOf` reads the pending row's date, consistent with the approve-route task. The refusal is worded like `UNDER_REVISION`. The report gets its note (§3.11). |
| Client turns null into 0 | `hooks.ts:94-95` is deleted; four explicit states; the KPI reads the server summary (§3.12). |
| Readiness training block | Converged on `summarizeQmsTrainingCompliance` (§3.6). |
| Migration re-stated `qms_document_org_id_key`; gates missing | Re-statement dropped; FK on `qms_documents_id_org_uq` (`20261013b:54`); guard-order and overlay-deps gates added (§3.1). |
| One date convention | `utcDay` everywhere; approval resolves the date in JavaScript (D9). |
| Part 11 retention of the new tables | `PURGE_RETAINED_RECORDS`, with a reason (D8). |
| Prefix boundary; response timing; "registered before" claim | Trailing `':'` and a `left()` match; `afterCommit`; single-segment `:id`, with the claim dropped (§3.8, §3.9). |
| Keep the version in force readable at point of use | The reader opens on v1.0 and offers v2.0 (§3.12). |
| Effective date outside the digest | The manifest and ledger record it; `exactManifest` compares it; the dialog says "recorded with your signature" (§3.7). |
| `rolesHeldBy` and the client admin flag | Administrator only, so the session role matches. The server returns `canAdminister` and `canAssign` (D4, §3.8). |
| Rule 3 additions | `qualityTarget` and `taskTarget` reached; `research_personnel` and `personnel_training` listed; `signGovernedAct.afterCommit` reused (§2, §3.9). |
| Report `now` | Generation time, for the report's own stated reason (D7). |
| One per-person view of what is outstanding | G10 lists due and overdue rows from the same resolver (§3.6, slice 5). |