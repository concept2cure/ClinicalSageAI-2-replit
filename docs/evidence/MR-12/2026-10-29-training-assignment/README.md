# MR-12 Stage 4: assigned, version-bound QMS training (2026-10-29)

| | |
|---|---|
| Launch rows | **D2** (W1, QMS controlled documents); **D5** for the audit rows. |
| Decisions | **P-49** and **P-50** (`docs/LAUNCH_DEFINITION_OF_DONE.md`). P-50 sets `TRAINING_LATE_ASSIGNMENT_GRACE_DAYS = 14`, confirms D3, and narrows per-person training status to the person, administrators and designated QMS approvers. |
| Design | `docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md` (its line numbers were taken at `7746d35abc`; this build starts at `cbcd32f58b`). |
| Work named for what it is | **Complete** training compliance, **complete** the in-force resolver, **reach** the one task store and sweep, **extend** G10, **reach** the Quality notification target. The only new stores are the three tables of slice 1. |

## What already exists

Copied from the design §2 (verified there at `7746d35abc`), re-verified at `cbcd32f58b` for this build. Corrections are marked **[corrected]** in place and listed under "Corrections at cbcd32f58b" below.

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
- AnA's `revise_qms_document` calls the same service (`AnaToolExecutor.ts:14715-14733`; **[corrected]** from `:14712-14730`, shifted by three lines added above it since `7746d35abc`).

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
- **Set positions** (before this slice): `20261029f` `:3627`, saved_precedent_queries `:3637`, `UUID_TENANT_ISOLATION_NONPUBLIC` `:3638`, `CHILD_TABLE_PARENT_SCOPE` `:3655`, `TENANT_ISOLATION_SWEEP` `:3666`. **[corrected for after slice 1]**: `20261029g` `:3645`, `UUID_TENANT_ISOLATION_NONPUBLIC` `:3646`, `CHILD_TABLE_PARENT_SCOPE` `:3663`, `TENANT_ISOLATION_SWEEP` `:3674`.
- **The sweep** polices public tables with an integer `organization_id` (`db/migrations/20260801_tenant_isolation_sweep.sql:111-125`).
- **No Drizzle definition** exists for `qms_document_versions`. Raw SQL on the request client is the pattern here.
- **Purge**: `PURGE_CHILD_TABLES` (`tenant-offboarding.ts:1106`, `:1109` after slice 1), `PURGE_RETAINED_RECORDS` (`:1074`), with the `ci:purge-coverage` ratchet ("residue may shrink but never grow"). **[corrected]** `ci:purge-coverage` is already red at `cbcd32f58b`, on `csr_assembly_runs` and `csr_narrative_runs` (`b265d6fc0f`, CSR); see the slice-1 gates.

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

### Corrections at cbcd32f58b

- `git diff --stat 7746d35abc cbcd32f58b` changes none of the server, shared and client QMS paths above, the tasking and notification services, the task sweep, the migration set, the offboarding service, the membership middleware, `membership-change.ts`, `tenant-users.ts`, `member-labels.ts`, `launch-scope-api.ts` or the UI surface registry. Every line number above for those files holds. The one shift is `AnaToolExecutor.ts` (corrected in place).
- Rule 3 searches re-run at `cbcd32f58b`: `job_role`, `jobrole`, `job-role`, `qms_job`, `training_assignment`, `training-assignment`, `job_function` across `server`, `shared`, `client/src`, `migrations`, `db`, `scripts`: no hit. `curricul`, `learner`, `training_role`: only the `curriculum` doc_type mentions the design names. `CREATE TABLE … job_roles|departments|teams|user_groups|job_functions` in both migration trees: no hit. `git log --all --diff-filter=D` on `*ob-role*`, `*obRole*`, `*job_role*`, `*raining-assign*`, `*rainingAssign*`: nothing deleted.
- `ci:purge-coverage` is red at trunk on two CSR tables (corrected in place above). It is not this work's, and the slice-1 tables do not add to it.
- `TaskBoard.tsx:1521` does send a JSON body on `DELETE` (`apiRequest('DELETE', …, { … })`), as the design says; the job-role DELETE routes take their reason the same way.
- `audit:orphaned-endpoints:strict` stands at 984 orphans against its threshold of 1184, but **it cannot see this work's routes [corrected in review]**: `scripts/audits/detect-orphaned-endpoints.mjs:205-220` attributes a route only through an `app.use` mount and skips a router file with none. `mdx-qms-training.ts` is mounted with `router.use` (`mdx-qms.ts:944`, as `mdx-qms-records.ts` at `:942`), so none of its paths is in the report, and the figure is no evidence about them (deviation 1).
- **Found in review, existing, now reached** (not in design §2):
  - `public.actor_name(user_id)` (`migrations/20260929_actor_names.sql`, on the set at `migration-set.mjs:2742`): name and email of someone this organization's record names (a member, or an actor in its own audit trail), which `users` RLS (`migrations/20260928_users_membership_rls.sql`) hides once their membership ends. `server/services/tenant/actor-names.ts:14-16` makes `LEFT JOIN LATERAL public.actor_name(<id>) u ON TRUE` the per-row convention, and the `Account #<id>`/`user <id>` fallback the rule for anyone it does not answer for. The job-role listing read `users` directly, so a departed holder was labelled by a bare number.
  - `positiveId` (`server/routes/mdx-qms-review-route.ts:103-106` at `cbcd32f58b`): the QMS routers' id parser. Slice 1 had copied it; it is now exported once from `mdx-qms-context.ts`.
  - The lifecycle guard trusts a resolved posture for 60 s per process (`tenant-lifecycle.ts:69`), and `recordAcknowledgement` therefore refuses a posture that is not `allow` again inside its transaction (`training.ts:99`). That is the pattern the job-role writes now follow.
  - The active-member predicate of `training-compliance.ts:17-21` (account and organization active, membership row present): slice 1 restated it three times; it is now one constant in `training-assignment.ts` (deviation 10).
- The eslint warning ratchet (`--since origin/concept2cure-v2`) lints only files that exist at that ref, so a new file is never compared. New files are linted directly here and must carry no warning.
- Environment, not code: this host's PostgreSQL 16 had no `pgvector`, so `deploy-migrate` halted at `db/migrations/20260730_fix_atom_embedding_dimension.sql` (41/442 applied) and `install-fresh`'s verify failed on `ctd_cross_references`. `postgresql-16-pgvector` (0.6.0) was installed, a disposable database `c2c_mr12_trn_dbtest` was built from blank with `install-fresh` + `deploy-migrate` at `cbcd32f58b` (both exit 0), and `deploy-migrate` provisioned `app_service` with the CI dbtest password. The database tests below run against it.

---

## Slice 1: job roles and their membership

Design §3.1, the job-role half of §3.8, and D4 and D8.

### What changed

- **`migrations/20261029g_qms_job_roles_and_training_assignments.sql`** (new; `20261029g` is the next free suffix: `20261029f` is the last on disk and nothing in `db/migrations` carries `20261029`). The three tables of §3.1, as written there: `qms_job_roles`, `qms_job_role_members`, `qms_training_assignments`, with their named CHECKs, the same-org foreign keys onto `qms_documents_id_org_uq` and `qms_job_roles_id_org_uq`, and the live partial uniques. Every statement `IF NOT EXISTS`; no DROP, no ALTER of another file's object, no seed. The header says who writes it, that it freezes once deployed, and how a later change amends it.
- **`scripts/db/migration-set.mjs`**: the file is in `C2C_MIGRATION_FILES` directly above `UUID_TENANT_ISOLATION_NONPUBLIC` (`:3645`), with the comment block of §3.1. On the evidence database `deploy-migrate` applied it, and the tenant isolation sweep attached `tenant_isolation_policy` to all three tables (row security on and forced; `app_service` holds SELECT, INSERT, UPDATE, DELETE).
- **`server/services/tenant/tenant-offboarding.ts`**: `PURGE_RETAINED_RECORDS` names the three tables, each with the design's reason (D8).
- **`shared/qms/training.ts`**: `qmsJobRoleCreateSchema`, `qmsJobRoleUpdateSchema`, `qmsJobRoleMemberSchema`, `qmsGovernedRemovalSchema`, all `.strict()`, the reason bounded by `GOVERNED_REASON_MIN`/`MAX` (`shared/constants/governed-reason.ts`). `qmsTrainingAssignmentSchema` is slice 2's.
- **`server/services/qms/training-assignment.ts`** (new): the one writer of the job-role tables. `readQmsJobRoles`, `createQmsJobRole`, `updateQmsJobRole`, `deleteQmsJobRole` (soft; 409 `QMS_JOB_ROLE_IN_USE` with `docNumbers` while a live assignment on a live document names the role), `addQmsJobRoleMember` (the person's `organization_users` row locked `FOR SHARE`, account and organization active, else 422 `QMS_NOT_A_MEMBER`; 409 `QMS_ALREADY_MEMBER`), `removeQmsJobRoleMember` (soft; 403 `QMS_TRAINING_SELF_UNASSIGN` for oneself). Each runs on the caller's governed transaction and returns its ledger target and payload; a 23505 on a live unique becomes the named 409 `GovernedRefusal`.
- **`server/routes/mdx-qms-training.ts`** (new): the sub-router of §3.8, mounted from `mdx-qms.ts` with `router.use(qmsTrainingRouter)` next to the records router (`:944`). `GET /qms/job-roles` (any member: roles, live members with labels from `memberLabels`, `documentCount`, the active roster as `people`, and `canAdminister`); `POST /qms/job-roles`; `PATCH` and `DELETE /qms/job-roles/:id`; `POST /qms/job-roles/:id/members`; `DELETE /qms/job-roles/:id/members/:userId`. Every write: `requireEditorAccess`, positive-integer ids (422), `governedQmsReason` (400 `REASON_REQUIRED`), `governedQmsActor` (401), the strict body (422 `QMS_TRAINING_INPUT_INVALID` with `fieldErrors`), then `governedQmsWrite` with the administrator check inside the transaction (D4: `ADMINISTRATOR_ROLES` against the persisted role read by `currentStanding(client, actor, true)`, `FOR SHARE`; else 403 `QMS_JOB_ROLE_AUTHORITY`) and the ledger pair (domain `qms`, target `qms-job-role:<id>`) on the same client.
- **`server/routes/mdx-qms.ts`**: the import, the mount and one header line. 1,469 lines (under the 1,500-line ceiling).

**Review fixes (round 1).** Each is listed with its finding under "Review round 1" below.
- **`server/routes/mdx-qms-training.ts`**: one refusal, `jobRoleRefusal` (`:80`), decides who may change job roles from the standing read inside the transaction. It refuses an organization whose standing is not `allow` (pending deletion, past due, cancelled) with the posture's own code (`TENANT_PENDING_DELETION` and so on) and "Nothing was changed.", then anyone who is not an administrator. `requireJobRoleAdministrator` (`:92`) throws it on the `FOR SHARE` read; `canAdministerJobRoles` (`:98`) answers `canAdminister` from it on the plain read, so the screen is never offered a write the server refuses. The local `positiveId` is gone; the module imports it.
- **`server/routes/mdx-qms-context.ts`**: exports `positiveId` (`:23`), the review route's parser moved here unchanged; **`server/routes/mdx-qms-review-route.ts`** imports it (`:45`) and its copy is deleted.
- **`server/services/qms/training-assignment.ts`**: `ACTIVE_MEMBERS_SQL` (`:57`) is the module's one active-member test (a static constant passed by name, `$3` one user or NULL). The listing's roster reads it, each holder's `active` is membership in that roster (`:133`), and the member add locks the `organization_users` row `FOR SHARE` (`:210`) and then reads it (`:211`). Holders are named through `public.actor_name` (`:116`), and a holder with neither name nor address is `Account #<id>`, not the bare id `memberLabels` would give.

### Tests

| Test | Red (pre-change code at `cbcd32f58b`) | Green (slice 1) |
|---|---|---|
| `tests/schema-contract/qms-training-assignments-replay.pglite.test.ts` (new): on the deploy path in the right place; three replays over live rows leave `pg_constraint`, `pg_indexes` and `relfilenode` unchanged; one subject per assignment; name shape and the paired columns; live uniques that re-admit after a soft removal; no foreign role or document | **0/8**: the suite fails to load, the migration file does not exist (`slice1-replay-red.txt`) | **8/8** (`slice1-replay-green.txt`) |
| `tests/db/qms-job-roles.dbtest.ts` (new): real PostgreSQL 16, `RLS_ENFORCE=on`, `app_service`, the real routes behind `authMiddleware` | **0/12** at `cbcd32f58b`: 12 failed, every route 404 and the tables absent (`slice1-dbtest-red.txt`). Review round 1's four cases on the slice-1 code before its fixes: **2 of 16 failed** (`slice1-fix-red.txt`): the pending-deletion write answered 201 and wrote a row, and two departed holders were labelled `"178"` and `"171"`. The race case, red against mutation R1 (`slice1-race-red.txt`) | **16/16** (`slice1-dbtest-green.txt`) |

The dbtest's sixteen cases. The first round's twelve: create (one row and one ledger pair, the audit row and the governed action written by the role's own transaction, shown by equal `xmin`); rename (`{ before, after }`) and soft delete (the name is free again); member add and soft removal, and re-add, with both history rows; the listing, its labels and roster (active members of this organization only) and `canAdminister`; a viewer refused by `requireEditorAccess`, and a member, a manager and an approver refused with `QMS_JOB_ROLE_AUTHORITY` on create, rename, delete and member add, nothing written; a 7-character reason (400), an unknown field and a bad id (422), nothing written; a duplicate name in another case on create and on rename (409); an org-B user, a suspended user and a non-existent id (422 `QMS_NOT_A_MEMBER`) and a live member twice (409); org B neither sees org A's role nor changes it (404 on all four write routes, nothing written); removing oneself (403), which another administrator then may; deleting a role a document is assigned to (409 with `docNumbers`); a ledger write forced to fail (500 `AUDIT_WRITE_FAILED`, no role).

Review round 1's four:
- **The race (D4's lock).** The owner pool holds `BEGIN; UPDATE organization_users SET role = 'member'` on an administrator. The case fires `POST /job-roles` and waits 1.5 s: the request has not settled. It then commits the demotion: 403 `QMS_JOB_ROLE_AUTHORITY`, no role and no ledger row.
- **An organization pending deletion.** The administrator's `GET /job-roles` primes the lifecycle guard's cache as active, and the owner sets `organizations.status = 'pending_deletion'`. `POST /job-roles` answers 403 `TENANT_PENDING_DELETION` ending "Nothing was changed.", with no role and no ledger row. The listing still reads (200), and `canAdminister` is false.
- **Holders who left.** A suspended holder, one whose membership row was removed and who never acted in the organization, one whose membership row was removed after acting (they created a role), and an active one are listed in order. Their labels are the name, `Account #<id>`, the name (through `actor_name`) and the name, and `active` is false, false, false, true. None of the three is in `people`.
- **A deleted document.** A role assigned to a document whose `deleted_at` is then set by SQL lists `documentCount: 0`, and deleting it answers 200.

**Mutations** (`slice1-mutations.txt`), each check removed, its case seen failing, the file restored:
- M1, the in-transaction administrator check removed: the authority case fails (a member's create answers 201).
- M2, the self-removal refusal removed: the self-unassign case fails (200).
- M3, the in-use refusal removed: the in-use case fails (200, the role deleted).
- M4, the organization and active-status predicates on the added person dropped: the not-a-member case fails (the suspended member is added).
- M5, one index left without `IF NOT EXISTS`: the replay suite fails on the second application (`42P07 … already exists`).

Review round 1, on the fixed code (same file, section "Review fixes"; each case run alone, the file restored and its sha256 compared):
- R1, the administrator check's standing read without `FOR SHARE`: the race case fails, because the request settled before the demotion committed (it answered 201). This is the reviewer's mutation, which had left all twelve first-round cases green.
- P1, the posture refusal removed from `jobRoleRefusal`: the pending-deletion case fails (201, a row written).
- R5, every holder `active: true`: the holders case fails.
- R6, `AND d.deleted_at IS NULL` dropped from `documentCount` and the in-use refusal: the deleted-document case fails (`documentCount` 1).
- M4, re-run on the moved predicate: the status tests dropped from `ACTIVE_MEMBERS_SQL`, with `$2` kept bound. The not-a-member case fails, because the suspended person is added (201). A first attempt that also removed the only use of `$2` failed with a 500 (PostgreSQL could not type the parameter). That is not the admission the case exists to catch, so it was re-run; both runs are recorded.
- L1, nameless holders passed to `memberLabels`: the holders case fails (a bare id).

**Existing suites rerun, unchanged and green:** 18 unit files that mount `mdx-qms.ts` or read the purge lists (289 tests, including `qms-subrouters-governed.test.ts`, `qms-personal-training.test.ts`, `qms-legacy-api-retired.test.ts`, `tenant-purge-audit.test.ts`, `tenant-purge-referrers.test.ts`, `tenant-purge-raw-program-keys.pglite.test.ts`); 9 migration-set contract files (140 tests, including `c2c-apply-path`, `tenant-isolation-sweep`, `uuid-tenant-isolation`, `declared-table-surface`, `saved-views-store-replay`); and on the evidence database `tests/db/qms-periodic-review-reminders.dbtest.ts` and `tests/db/tenant-purge-blocking-keys.dbtest.ts` (12 tests).

Rerun after review round 1, all green:
- The replay suite, 8/8.
- 14 unit files that load the QMS routers (13 mount `mdx-qms.ts`, and with it the review route and the training router) or the governed-write ceremony: 223 tests. They include `qms-subrouters-governed.test.ts`, `qms-personal-training.test.ts`, `qms-legacy-api-retired.test.ts`, `qms-effective-only-by-signature.test.ts` and `qms-governed-writes-audited.test.ts`. With the replay suite, the run is 15 files and 231 tests.
- On the evidence database, `tests/db/review-route-qms-rr4.dbtest.ts` (the review route's reassign, which parses `assigneeId` with the moved `positiveId`), `qms-periodic-review-reminders.dbtest.ts` and `tenant-purge-blocking-keys.dbtest.ts`: 30 tests.

### Gates

All green on the slice-1 tree (`slice1-gates-green.txt`): `ci:migration-set-order`, `ci:migration-drop-safety` and its selftest (12/12), `ci:migration-deploy-path`, `ci:migration-guard-order` and its selftest, `ci:install-fresh-overlay-deps` and its selftest, `ci:column-reachability`, `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:fabricated-identity`, `ci:undefined-css-classes`, `ci:unauthenticated-fetch` (no client file changed; run anyway), `ci:purge-coverage:selftest` (53), `audit:repo-health:ceiling`, `audit:orphaned-endpoints:strict` (green, but it cannot see the six routes: deviation 1), and the eslint warning ratchet (no file changed its count; the four new files linted directly, 0 warnings).

Shown failing on the case each exists to catch (`slice1-gates-red.txt`), each temporary edit reverted:
- G1 `ci:migration-set-order`, the file moved after the sweep: "the tenant-isolation sweep is not the last entry", naming the file.
- G2 `ci:migration-deploy-path`, the file left out of the set: "1 new migration(s) no deploy applies", naming it.
- G3 `ci:install-fresh-overlay-deps`, a temporary FK from the file to `public.qms_document_versions` (created only by `db/migrations/20261014_qms_controlled_authoring_content.sql`, the db-tree file that also holds `qms_document_org_id_key`): one finding, naming the file and the table.
- G4 `ci:purge-coverage`, the three tables taken out of `PURGE_RETAINED_RECORDS`: all three named as new residue.

`ci:purge-coverage` itself exits 1 on the slice-1 tree for the two pre-existing CSR tables only; with the slice's entries it lists the three tables as retained, with their reason, and not as residue.

**Red at trunk, not this work's.** Two gates are red at trunk, and both run in CI:
- `ci:purge-coverage` fails on `csr_assembly_runs` and `csr_narrative_runs`.
- `ci:tenant-entry-points` (`ci.yml:746`) exits 1 on `server/routes/mdx-admin.ts` ("baselined entry point CHANGED since justification"). This work does not change that file: `git status` shows it unmodified, and it was last changed by the trunk merge `9764baaa98`.

**Review round 1** (appended to `slice1-gates-green.txt`). All green on the fixed tree: `ci:migration-set-order`, `ci:migration-drop-safety` and its selftest, `ci:migration-deploy-path`, `ci:migration-guard-order`, `ci:install-fresh-overlay-deps`, `ci:column-reachability`, `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:fabricated-identity`, `ci:undefined-css-classes`, `ci:unauthenticated-fetch` and `ci:tenant-resolvers`.
- `ACTIVE_MEMBERS_SQL` is passed to `.query` by name, with nothing interpolated, so `ci:sql-interpolation` counts nothing new.
- The ESLint warning ratchet (`--since origin/concept2cure-v2`) reports that none of its 6 comparable files changed its count. The four new files and the two changed QMS route files, linted directly, give 0 warnings and 0 errors.
- `ci:tenant-entry-points` exits 1 as above.
- The gates rewrote no tracked file: `git status` was the same before and after.

Not run, by the workflow's instruction: the full typecheck (`npm run check` / `tsc -p tsconfig.json`) is run once, in the last slice's fix stage.

### Deviations from the design

1. **Slice 1 here is the server half.** This workflow's slice-1 prompt names the migration, its set entry, purge retention and the job-role routes. The design's §5 slice 1 also lists: moving the four existing training routes into `mdx-qms-training.ts`, `governedQmsWrite`'s `afterCommit` option (and its three `qms-subrouters-governed.test.ts` cases), the `JobRoles` panel and "Job roles" button, and `qmsWrites` DELETE support. None is done here. `afterCommit` has no consumer until slice 4's reconcile; `mdx-qms.ts` is 1,469 lines, so the move is not needed for the ceiling yet.

   **The six routes are unreached from the client.** They stay unreached until three pieces land: the `JobRoles` panel (`TrainingCoverage.tsx`), the "Job roles" button (`SopRegister.tsx:573-576`), and `qmsWrites` DELETE support. **[corrected in review]**: the orphan audit was cited here as evidence ("still passes, 984 of 1184"), but it cannot see these routes at all (see "Corrections at cbcd32f58b"), so the citation is withdrawn. Design §5's slice-1 exit condition ("every new route has a client caller") is therefore **open**, and it is carried to slice 2:
   - design §3.12 already puts `useJobRoles` and the `qmsWrites` DELETE support in slice 2's wiring;
   - slice 2's `TrainingAssignments` panel needs the same DELETE support.

   So the `JobRoles` panel and its button land in the slice-2 commit, and slice 2 is not done without them.
2. **The administrator check is in the route module, not in `training-assignment.ts`.** D4 reads the role with `currentStanding` (`training.ts`), and §3.5 says `training-assignment.ts` has no import cycle; slice 2 makes `training.ts` import `authorizeQmsTrainingRead` from `training-assignment.ts`. So `training-assignment.ts` does not import `training.ts`: `requireJobRoleAdministrator` in `mdx-qms-training.ts` runs inside `governedQmsWrite`'s transaction before the service call, as `governed-qms-write.ts` says ("Who may is the route's job"). The behaviour is D4's exactly: persisted role, `FOR SHARE`, `ADMINISTRATOR_ROLES`, manager not admitted. A `currentStanding` refusal (inactive account, a suspended or closed organization) becomes a `GovernedRefusal` with its own code.

   **[review round 1]** `currentStanding` throws only on `deny`. So slice 1 admitted a write from an organization whose standing is `read_only` (pending deletion, past due, cancelled) whenever the lifecycle guard's 60 s cache still said `allow`. `jobRoleRefusal` now refuses any standing that is not `allow`, with that standing's code, as `recordAcknowledgement` does (`training.ts:99`). D4's text names only the role, and this keeps the design's intent ("nothing is written otherwise").
3. **Member entries carry `active`.** `GET /qms/job-roles` lists each live member as `{ userId, label, addedAt, active }`. A member whose account or membership is no longer active keeps the row (Risk 10), and `active: false` says so, so the panel can never present a departed person as a current holder. The design's shape has no `active`.

   **[review round 1]** This is now pinned by the holders case (mutations R5 and L1). That case found that a departed holder was labelled by a bare number: `users` RLS hides the account, and `memberLabels` falls back to the id, so the module's own `Account #<id>` fallback never fired. Holders are now named through the existing `public.actor_name`, and anyone it does not answer for is `Account #<id>`. The design's shape says `label` and nothing about a departed person.
4. **Deleted documents do not hold a role in use.** `documentCount` and `QMS_JOB_ROLE_IN_USE` count live assignments on documents with `deleted_at IS NULL`. An assignment left on a deleted document would otherwise block deleting the role with nothing anyone could remove. The design does not say.

   **[review round 1]** The reviewer was right that no server code soft-deletes a `qms_documents` row today (confirmed). The filter is still kept, and now pinned (the deleted-document case, mutation R6), because every QMS reader of the table treats `deleted_at` as gone (19 server files filter it). Slice 2's assignment routes will find no deleted document either. Without the filter, a row deleted by any path, including a future one, would hold a role in use with no route able to free it.
5. **404 codes named.** The design says "404". The bodies are `QMS_JOB_ROLE_NOT_FOUND` (no live role of this organization) and `QMS_JOB_ROLE_MEMBER_NOT_FOUND` (no live membership), each with a sentence ending "Nothing was changed." A bad path id is 422 `QMS_TRAINING_INPUT_INVALID`.
6. **Small choices the design leaves open:** an empty description is stored as NULL; a PATCH that changes nothing is admitted and recorded; on member removal the role is looked up first (a foreign role is 404 before the self-removal 403); the in-transaction role lock is `FOR UPDATE` for rename and delete and `FOR SHARE` for member changes, so a member cannot be added to a role being deleted.
7. **"Org B reading org A's role"**: there is no single-role GET, so reading is the list (A's role is absent from B's) and changing is the four write routes (404, nothing written).
8. **P-50's narrowing does not apply to this slice.** It covers per-person *training status* (`GET /qms/training`, G10, the outstanding list), which slice 3 moves onto assignments. Who holds a job role is not training status, and D4 keeps the job-role read open to every member, so it is.
9. **One `positiveId`** (review round 1, zero duplication). The QMS routers' id parser is exported from `mdx-qms-context.ts`, the routers' shared context, and imported by `mdx-qms-review-route.ts` and `mdx-qms-training.ts`. The review route's copy is deleted, and so is slice 1's. The parser kept is the review route's, which also reads a JSON number. A path parameter is always a string, so the job-role routes behave as before; the bad-id cases (`abc`, `0`) still answer 422.
10. **One active-member predicate in this module, and one open convergence** (review round 1). `ACTIVE_MEMBERS_SQL` (`training-assignment.ts:57`) replaces the three inline copies: the roster, the `active` flag and the member-add check. The member add now takes two statements: it locks the membership row `FOR SHARE` and then reads the predicate. The lock is the same row lock as before (`FOR SHARE OF ou`). **Slice-3 convergence item:** the one other copy is `training-compliance.ts:17-21`, and slice 3 deletes that roster (design §3.2). The resolver's `active` CTE states this same predicate in one SQL text, and a constant cannot be interpolated into it (`ci:sql-interpolation`). So slice 3 must make the resolver's CTE the definition and have these reads use it, or delete this constant. Either way, no further copy may be added.

### Review round 1

Verdict "fix-then-ship": six findings. I confirmed each one by reading the code, then fixed it with a test shown red first. None is rejected; for finding 4 I took the second of the reviewer's two fixes.

| # | Finding | Confirmed by | Done |
|---|---|---|---|
| 1 (major) | The in-transaction check ignored a `read_only` posture, so a pending-deletion organization took a write while the guard's cache said `allow`. | `currentStanding` throws only on `deny` (`training.ts:57-59`); the posture is cached for 60 s (`tenant-lifecycle.ts:69`). Reproduced: 201 and one row (`slice1-fix-red.txt`). | `jobRoleRefusal`; `canAdminister` from the same rule; the pending-deletion case; mutation P1 (deviation 2). |
| 2 (major) | D4's `FOR SHARE` had no test. | Mutation R1 left 12/12 green. | The race case; red against R1 (`slice1-race-red.txt`); R1 in `slice1-mutations.txt`. |
| 3 (minor) | Deviations 3 and 4 had no test. | Mutating R5 and R6 together left the suite green. | The holders case and the deleted-document case; mutations R5 and R6. Deviation 4 is kept rather than dropped, for the reason given there. The holders case also found the bare-number label, now fixed through `public.actor_name` (deviation 3, mutation L1). |
| 4 (minor) | The orphan audit was cited as reachability evidence, but it cannot see the routes. Design §5 makes a client caller a slice-1 exit condition. | `detect-orphaned-endpoints.mjs:205-220`; the sub-router's `router.use` mount (`mdx-qms.ts:944`). | The citation is withdrawn. The routes are recorded as unreached, and the exit condition as open, carried to the slice-2 commit (deviation 1). The client pieces are not landed here: a governed panel with six writes, its reason fields and its tests is not a cheap minor, and design §3.12 already puts its hooks and the DELETE support in slice 2. |
| 5 (minor) | `positiveId` duplicated the review route's parser. | `mdx-qms-review-route.ts:103-106`. | One export in `mdx-qms-context.ts`, used by both routers (deviation 9). |
| 6 (minor) | The active-member predicate was restated three times. | `training-assignment.ts` `:92`, `:105` and `:195` as they were. | `ACTIVE_MEMBERS_SQL`; `training-compliance.ts:17-21` is listed as the slice-3 convergence item (deviation 10). |

The reviewer's checks that held are not repeated here: RLS isolating the tenant (R2), the administrator set (R3), purge, Rule 1 replay, the ledger pair's `xmin`, and P-50.

### Not done in this slice

The MR-12 work order's Stage 4 status and `docs/work-orders/MR-findings-2026-10-13.json` (CAT2-21) are not edited; the design closes CAT2-21 with slice 3.
