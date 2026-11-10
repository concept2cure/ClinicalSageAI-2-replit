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

### Corrections at 54b2929c54 (slice 2)

Trunk moved from `cbcd32f58b` to `54b2929c54` between the slices. Re-read for slice 2; what changed for this design:

- **The three training reads moved** (`bbe901816f`, unchanged): `GET /qms/training`, `/qms/training/expiring` and `/qms/training/compliance` are in `server/routes/mdx-qms-training.ts` (`:227`, `:239`, `:257`), the sub-router `mdx-qms.ts` mounts at `:933`, before the records (`:935`), deviations (`:937`) and controlled-copy (`:939`) routers. `mdx-qms.ts` is 1,471 lines (other sessions' changes since `bbe901816f`); slice 2 does not touch it.
- **`authorizeQmsContentRead`** is at `controlled-document-content.ts:86` (design `:67-81`). `isQmsDesignatedApprover` (`qms-approver-designation.ts:62`) and `ADMINISTRATOR_ROLES` (`membership-change.ts:113`, `['admin', 'owner']`) hold.
- **Another session has already built two pieces of design §3.3 and §3.7** (CAT2-19, MR-12 Stage 3), which slices 3 and later must complete rather than rebuild (Rule 3):
  - `in-force-release.ts` `isPendingEffective` (`:61`): an effective row with a later effective date is pending, and `readInForceReleases` (`:81`) keeps its signed predecessor in force (`pendingEffective: true`); `qmsVersionStandings` names a `pending-effective` version (`4ba9c2b045`). The own-snapshot half of §3.3 rule 4 is built too: `e0498e0b3f` excludes the row's own version in SQL (`in-force-release.ts:96-100`, `version IS DISTINCT FROM (SELECT d.version …)`), so a pending v2.0's own signed snapshot is never chosen. What remains of rule 4 is that a snapshot which itself takes effect later is not in force; slice 3 completes that. *(Corrected in review round 1: this line first said rule 4 was wholly open.)*
  - `e0498e0b3f`: approval's `signedEffectiveDate` (`document-approval-signature.ts:484`) refuses a date earlier than the database's `CURRENT_DATE` with 422 `QMS_EFFECTIVE_DATE_BACKDATED` (mapped at `mdx-qms.ts:722`); the UPDATE writes the resolved date; the manifest and ledger carry it, and `current-release-approval.ts:41` (`effectiveDateHolds`) fails a signature whose manifest date differs from the row's. Design §3.7 is therefore largely built; what differs from it is the reference day (the database's `CURRENT_DATE`, not `utcDay(now)` in JavaScript, D9) and that the refusal is decided in the service, not also at the route before the credential.
- **Approval and retirement fixtures**: the signature guard (`migrations/20261001_qms_document_signature_required.sql`, `qms_documents_signed_status_guard`) refuses any `qms_documents` row inserted as `effective` or `retired` without its signature in the same transaction, so a test reaches those states only through the signed routes; retirement is signed with the meaning `retirement` (P-51).
- **Red at trunk, not this work's** (seen while rerunning neighbours; none fixed here): `tests/schema-contract/qms-training-assignments-replay.pglite.test.ts` ("immediately before the tenant tail") fails since `08619d5cc7` (P-70) put `migrations/20261029j_no_session_rls_bypass.sql` between `20261029g` and `UUID_TENANT_ISOLATION_NONPUBLIC`; the slice-1 file is still before the tail, so the assertion, not the set, is stale. `server/routes/__tests__/qms-document-content-access.test.ts` (one case) fails since `4ba9c2b045` made `/versions` read its parent row first. `tests/db/qms-periodic-review-reminders.dbtest.ts` ("retirement cancels the open task") retires with the meaning `APPROVED`, refused since P-51.
- **Rule 3 searches for slice 2**: `training-assignments`, `trainingAssignment`, `training_assignments`, `TrainingAssignee`, `qms_training_assign`, `assignTraining`, `training_assignee` across `server`, `shared`, `client/src`, `migrations`, `db`, `scripts`: only slice 1's migration, its set entry, its purge entry and its two modules. No client caller of any training-assignment path exists. `git log --all --diff-filter=D` on `*raining*ssign*`, `*ssignee*`, `*rainingAssign*`: nothing deleted. `isQmsDesignatedApprover` has one other caller, the review route's approver check (`qms-review-route.ts:257`), so the assigner rule asks the same question the approval route does.

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

---

## Slice 2: assignment per document, by role and by name

Design §3.2 (the one resolver), the assignment half of §3.8, and D4. Built on `54b2929c54`.

### What changed

- **`shared/qms/training.ts`**: `qmsTrainingAssignmentSchema` (`.strict()`, exactly one of `jobRoleId` and `userId`, the reason bounded by `GOVERNED_REASON_MIN`/`MAX`) and its type.
- **`server/services/qms/training-assignment.ts`** (the one writer of the store, now also of `qms_training_assignments`):
  - `QMS_TRAINING_ASSIGNEES_SQL` (`:310`), the only definition of "assigned": live assignments; a person by name, or by a live job role they hold through a live membership; per document and person one row with every path in `via` (`'person'`, `'role:<id>'`) and `covered_since`; `assignment_rows` so that "assigned to nobody" (0) and "assigned, but nobody active" are two states.
  - `readQmsTrainingAssignees(client, orgId, documentIds, { userIds? })` (`:358`) runs it; `isQmsTrainingAssignee` (`:376`) asks it about one person.
  - `readTrainingDocument` (`:389`), and `trainingAssignmentRefusal` (`:439`): a form or specification is 409 `QMS_NOT_TRAINABLE_TYPE`, a retired document 409 `QMS_DOCUMENT_RETIRED`, and an actor who cannot read the version people train on (the release in force, else the working copy, through `authorizeQmsContentRead`) is 403 `QMS_DOCUMENT_VIEW_DENIED`.
  - `addQmsTrainingAssignment` (`:473`): the document locked `FOR SHARE`, the refusals above, then the role locked `FOR SHARE` (422 `QMS_JOB_ROLE_NOT_FOUND` unless live in this organization) or the person's membership locked `FOR SHARE` and checked active (422 `QMS_NOT_A_MEMBER`), then the insert (a 23505 on either live unique is 409 `QMS_ALREADY_ASSIGNED`). Ledger: `qms-document:<id>`, `create`, `{ change: 'training-assigned', assignmentId, jobRoleId | userId }`.
  - `removeQmsTrainingAssignment` (`:525`): soft; 404 `QMS_TRAINING_ASSIGNMENT_NOT_FOUND` unless live on this document; 403 `QMS_TRAINING_SELF_UNASSIGN` when the assignment names the actor or a job role they hold. Ledger: `delete`, `{ change: 'training-unassigned', assignmentId, jobRoleId | userId }`.
  - `readQmsTrainingAssignments` (`:574`): the live assignments with labels, the versions people train on (`trainable`), and the resolved people.
  - Refactors inside the module, no behaviour change for slice 1: `JobRoleChange` is `TrainingStoreChange`; one labeller, `personLabeller`, for both listings (slice 1's inline copy is gone); `requireActiveMember` is the member add's check, now shared with a person's assignment.
- **`server/routes/mdx-qms-training.ts`**: `GET`, `POST /qms/documents/:id/training-assignments` and `DELETE …/:assignmentId`. Slice 1's write helper is now `storeWrite`, taking the subject and the in-transaction authority (`JOB_ROLE_AUTHORITY`, `ASSIGNMENT_AUTHORITY`), so both stores run one ceremony. D4 for assignments is `assignerRefusal`: the organization's standing (`postureRefusal`, shared with the job-role rule), then an administrator (`ADMINISTRATOR_ROLES`) or `isQmsDesignatedApprover` (with its Approver-role stand-in), read inside the transaction with the standing `FOR SHARE`; else 403 `QMS_TRAINING_ASSIGN_AUTHORITY`. A manager is not admitted. `canAssign` answers from the same two rules on a plain read. 331 lines.
- **`server/services/qms/in-force-release.ts`**: `dayOrNull` is exported (one line), so `trainable` states effective dates with the resolver's own day helper rather than a copy.
- `mdx-qms.ts` is not changed.

### Tests

| Test | Red (pre-change code) | Green (slice 2) |
|---|---|---|
| `tests/db/qms-training-assignments.dbtest.ts` (new): real PostgreSQL 16, `RLS_ENFORCE=on`, `app_service`, the real routes behind `authMiddleware`; effective and retired documents reached through the signed approve and retire routes, an authored document through `POST /qms/documents` | **0/17**: 17 failed; every assignment route 404, the resolver functions absent; the fixtures all succeed (`slice2-red.txt`, the final file run with this slice's four source files at `HEAD`) | **17/17** (`slice2-green.txt`) |

The seventeen cases:
- **Who may (D4).** An administrator assigns a role and a person: one row and one ledger pair each, written by the assignment's own transaction (equal `xmin`). The Approver role stands in while nobody is designated (organization A); in organization D, which designated a member, the designee assigns, and an Approver-role member who is not designated gets 403 `QMS_TRAINING_ASSIGN_AUTHORITY` with nothing written, and `canAssign` false. A member and a manager get 403 `QMS_TRAINING_ASSIGN_AUTHORITY` on assigning and on removing; a viewer is refused by `requireEditorAccess`; nothing written; a first draft reads `trainable: { inForce: null, pending: null }`. An Approver-role member without a grant on an authored document gets 403 `QMS_DOCUMENT_VIEW_DENIED` and `canAssign` false; an administrator (an authoring administrator) may assign; once the author shares the document to the approver as VIEWER, the approver may.
- **On the write's own transaction.** A demotion held open on the actor's membership row makes the assignment wait; once committed, 403 and nothing written. An organization the lifecycle guard still caches as active, but pending deletion, takes no assignment (403 `TENANT_PENDING_DELETION`, "Nothing was changed."), stays readable, and reads `canAssign: false`.
- **Refusals, nothing written.** The same role or person twice (409 `QMS_ALREADY_ASSIGNED`). Another organization's document: 404 on the read, the assignment and the removal. Another organization's role, a deleted role and an unknown id (422 `QMS_JOB_ROLE_NOT_FOUND`); another organization's user, a suspended user and an unknown id (422 `QMS_NOT_A_MEMBER`). A form and a specification (409 `QMS_NOT_TRAINABLE_TYPE`, `canAssign` false) and a retired document (409 `QMS_DOCUMENT_RETIRED`). Both subjects, neither, an unknown field (422 `QMS_TRAINING_INPUT_INVALID`), a seven-character reason (400 `REASON_REQUIRED`), bad ids (422). A ledger write forced to fail (500 `AUDIT_WRITE_FAILED`, no row).
- **Removal.** Soft and audited (the ledger pair's `xmin` equals the row's), 404 once removed, and the same role can be assigned again with both rows kept. An assignment of another document is 404 on this one. The actor's own named assignment and an assignment of a role the actor holds are 403 `QMS_TRAINING_SELF_UNASSIGN`; another administrator removes both.
- **The resolver.** Through the read: two live role and person assignments listed, a removed one not; the people are exactly the two role members, the named person, and the person reached both ways once with `['person', 'role:<id>']`; not a suspended member, a departed member, a member removed from the role, the member of a role deleted while assigned, the removed assignment's person, or another organization's user written into the role past the route. Labels, `assignedBy` and `assignedByLabel` as recorded; the read is open to a member and a viewer. Directly, as `app_service` under RLS: `{ assignmentRows: 0, assignees: [] }` for a document assigned to nobody, `{ assignmentRows: 1, assignees: [] }` for one whose role has only a suspended member, the `userIds` narrowing, and `isQmsTrainingAssignee` true by role and by name, false for an unassigned member, a suspended one and another organization's user.

**Mutations** (`slice2-mutations.txt`), each check removed, its case run alone and seen failing, the file restored (sha256 compared):
- M1, administrators only (the QMS approver half of D4 removed): the stand-in case fails (403).
- M2, the in-transaction authority call removed: the member case fails (201).
- M3, the assigner-must-read rule removed: the authored-document case fails (201).
- M4, the self-covered refusal removed: the self-unassign case fails (200).
- M5, the resolver admits a deleted role; M6, a removed role member; M7, people outside the active set: the resolution case fails each time (5, 5 and 7 people instead of 4).
- M8, the assigner's standing read without `FOR SHARE`: the race case fails (the write settled before the demotion committed).
- M9, the retired refusal removed; M11, the trainable-type refusal removed: the type case fails (201).
- M10, `assignment_rows` always 0: the resolver case fails.
- M12, the organization-standing refusal removed from the assigner rule: the pending-deletion case fails (201, a role assigned). Its first run assigned a person and was caught only by the member check (422), so the case now assigns a role; both runs are recorded.

**Existing suites rerun** (`slice2-existing-suites.txt`):
- Unit: the 21 files that mount `mdx-qms.ts` or load the training and in-force services or the shared schema, 307 tests: 305 pass. The two failures are red at trunk without this slice (see "Corrections at 54b2929c54").
- Database: slice 1's `qms-job-roles.dbtest.ts` (its route and service were refactored here: 16/16), `qms-in-force-during-revision`, `review-route-qms-rr4` and `qms-periodic-review-reminders`: 46 of 47 pass; the one failure is red at trunk (P-51's retirement meaning).

### Gates

All on the slice-2 tree (`slice2-gates-green.txt`): `ci:migration-set-order`, `ci:migration-drop-safety`, `ci:migration-deploy-path`, `ci:migration-guard-order`, `ci:install-fresh-overlay-deps` (no migration changed; run anyway), `ci:column-reachability`, `ci:sql-interpolation` (no SQL text interpolates anything: the resolver is a static constant passed by name, every value bound), `ci:server-error-leaks` (no 5xx body reads an error's text: the read check's 503 answers a fixed sentence), `ci:fabricated-identity`, `ci:undefined-css-classes` and `ci:unauthenticated-fetch` (no client file changed), `ci:tenant-resolvers`, `ci:discarded-audit-write`, `ci:session-scoped-rls-bypass` and `audit:repo-health:ceiling`: exit 0. The ESLint warning ratchet (`--since origin/concept2cure-v2`): no file changed its count. The five slice-2 files linted directly: 0 errors, 0 warnings (one warning on the first run, the test file's first `describe` at 118 lines; split in two, not baselined).

`ci:tenant-entry-points` exits 1 at trunk on `server/routes/mdx-admin.ts`, which this slice does not change; not fixed or baselined, by instruction.

Not run, by the workflow's instruction: the full typecheck (it runs once, in the last slice's fix stage) and a whole-repo vitest.

### Deviations from the design

1. **This slice is the server half.** The workflow's slice-2 prompt names §3.2, the assignment half of §3.8 and D4. The design's §5 slice 2 also lists `authorizeQmsTrainingRead` (D3, §3.5, confirmed by P-50) with its three "being assigned lets a person read" cases, the `TrainingAssignments` panel and the "Training" chip. None is done here, and neither are the pieces slice 1 carried to this slice (the `JobRoles` panel and its button, `useJobRoles`/`useTrainingAssignments`, `qmsWrites` DELETE support). So **nine routes are now unreached from the client** (six job-role, three assignment), and slice 1's exit condition ("every new route has a client caller") **stays open**; `isQmsTrainingAssignee` has no production caller until D3 and the notification target (slice 4) use it. The orphan audit cannot see these routes (slice 1, "Corrections at cbcd32f58b").
2. **The resolver's "active" is ACTIVE_MEMBERS_SQL, not a second copy.** The design's SQL states the active predicate as its own CTE (`$3` = `ACCOUNT_STATUS_ACTIVE`, `$4` = user ids or NULL). Slice 1 (deviation 10) made `ACTIVE_MEMBERS_SQL` the module's one active-member test and allowed no further copy, and a SQL fragment cannot be shared by interpolation (`ci:sql-interpolation`). So `readQmsTrainingAssignees` reads `ACTIVE_MEMBERS_SQL` first and passes those ids as `$3` (narrowed to `userIds` when given): two statements, the same answer. Mutation M7 pins it. When slice 3 deletes the roster at `training-compliance.ts:17-23` and counts through `readQmsTrainingAssignees`, `ACTIVE_MEMBERS_SQL` becomes the only copy anywhere.
3. **The GET's `people` carry no training status yet.** The design's row is `{ userId, label, via, countsNow, acknowledgedAt, expiresAt, task }`; slice 2 returns `{ userId, label, via, coveredSince }`. `countsNow`, `acknowledgedAt` and `expiresAt` are compliance against the version in force (slice 3, §3.6 `trainingTaskOf`), and `task` is slice 4's. **P-50 binds slice 3 here:** when those fields arrive on this read, they are shown only for the viewer themselves, administrators and designated QMS approvers; everyone else sees counts. *(Superseded in review round 1, below: the people assigned, person by person, are now listed only to administrators and designated QMS approvers; everyone else sees their own line and the count. The assignments themselves, by role and by name, stay open to every member.)*
4. **The GET adds fields the design does not name:** `assignedByLabel` beside `assignedBy` (an id is no name), `active` on a person's assignment (as slice 1's holders, deviation 3: a named person who left keeps the row), and `coveredSince` per person. `trainable` is read through the existing pending resolver (`isPendingEffective`, `readInForceReleases`, "Corrections at 54b2929c54"), not §3.3's `readTrainableReleases`, which slice 3 builds. A role assigned and then deleted past the in-use refusal (only possible by SQL) is still listed among the assignments, by its name, and covers nobody.
5. **Codes where the design says "404", and the read check's mapping.** A document that is not this organization's: 404 `QMS_DOCUMENT_NOT_FOUND`; an assignment not live on this document: 404 `QMS_TRAINING_ASSIGNMENT_NOT_FOUND`; each ends "Nothing was changed.". `authorizeQmsContentRead`'s 403 and 404 (no object grant, no project access, project not found) become 403 `QMS_DOCUMENT_VIEW_DENIED`; its 409 (the bound authored document unavailable, the project anchor unresolved) keeps its own code and sentence; its 503 keeps its code with a fixed sentence, so no 5xx body carries an error's text.
6. **Order of refusals.** POST: authority, then the document (404), its type, retired, whether the actor can read it, the role or person, then the duplicate. Authority comes first so someone who may not assign learns nothing about a document id. DELETE: authority, the document (404), the assignment (404), then the self-covered refusal. A removal does not ask the remover to read the document or refuse a retired one; the design names neither.
7. **Only `retired` is refused.** The status `superseded` is set by nothing (`mdx-qms.ts:156`).
8. **Self-unassignment as written.** Removing an assignment that covers the actor is refused even when another path still covers them (the design's rule; it never clears an obligation the actor holds).
9. **`canAssign` is the server's rule on a plain read**: the standing without `FOR SHARE`, then the document's own refusals, including whether the viewer can read it. *(Changed in review round 1: a check that could not run (5xx) answers `canAssign: null`, "could not be checked", not `false`.)*
10. **A role named in the body that is not live is 422**, as the design says, with the job-role module's own sentence (`lockLiveRole`'s 404 re-answered as 422: the role is a body field, not the path).

### Not done in this slice

The MR-12 work order's Stage 4 status and `docs/work-orders/MR-findings-2026-10-13.json` (CAT2-21) are not edited; the design closes CAT2-21 with slice 3. Two of the three red-at-trunk tests named in "Corrections at 54b2929c54" are other changes' and are not fixed here (`qms-document-content-access.test.ts`, `qms-periodic-review-reminders.dbtest.ts`). The replay suite's was this lane's own assertion and is corrected in review round 1.

### Review round 1 (2026-10-30)

An adversarial review of the uncommitted slice found one major and six minor defects (`fix-then-ship`). Its fix stage could not run (the session's subagents were refused for billing), so the lead session verified and fixed each one itself.

| # | Finding | Outcome |
|---|---|---|
| 1 (major) | A designated QMS approver demoted to viewer while the write waits keeps the power to assign: the in-transaction check read the persisted role only for administrators, and nothing clears a designation when the role changes. The reviewer's probe wrote the row (201). | **Fixed.** `assignerRefusal` requires `GOVERNED_WRITE_ROLES` on the role read `FOR SHARE` inside the transaction, before the administrator-or-designee rule. Red: 201 (`slice2-fix-red.txt`); green: 403 `QMS_TRAINING_ASSIGN_AUTHORITY`, nothing written. Mutant M13 kills both cases. |
| 2 | `canAssign` said yes to a designee whose role is viewer, whom the POST refuses. | **Fixed** by the same rule: `canAssign` answers from it. |
| 3 | The pending branch, `coveredSince`'s `GREATEST`, `coversActor`'s `removed_at`, and a departed named person's `active: false` were unpinned. | **Pinned**, four cases; M16, M17 and M18 (the reviewer's MG, MD and MI) are each killed by its case. |
| 4 | The assigner's read check covered only the release in force, not a version approved for a later day, which is a different authored copy. | **Fixed:** `documentReadRefusal` checks every version people train on, the in-force release and, when the row is pending, the row itself. **Not yet pinned by a test**: it needs an authored document revised and approved for a later day, the fixture slice 3 builds; owed there. |
| 5 | `canAssign` turned "could not be checked" (503) into "may not". | **Fixed:** `canAssign: null` for a 5xx. A new case makes the content read check unavailable (`failRead`): null, then true when it recovers. M14 survived its first run, before that case existed; it is killed now. |
| 6 | P-50 Q3: the GET listed every assigned person's name and `coveredSince` to every member. | **Fixed, as a product decision under the founder's delegation of 2026-10-29.** `people` is in full only for administrators and designated QMS approvers (with the Approver-role stand-in); anyone else gets their own line, with `peopleCount` and `peopleScope: 'own'`. A person's line is the input to their due date and, from slice 3, carries their status, so it is the status P-50 Q3 narrows; the assignments (which roles and which people the document requires) stay open to every member, as the document's requirement. M15 kills the case. |
| 7 | This README said §3.3 rule 4 was wholly open. | **Corrected** above ("Corrections at 54b2929c54"). |

Also in this round:
- **The replay suite's stale assertion** (red at trunk since `08619d5cc7`): the slice-1 file is asserted to be before the tenant tail, not immediately before it. 8/8.
- **The suite was split** when the review's cases took it past the 500-line limit: the fixture is `tests/db/qms-training-assignments-fixture.ts` (moved unchanged, as `two-tenant-fixture.ts` was), the slice's cases stay in `qms-training-assignments.dbtest.ts` (17), and the review's are in `qms-training-assignments-review.dbtest.ts` (8). The resolver case now reads the full list as an administrator and pins the member's narrowed view.

**Tests:** 41/41 across the two training-assignment suites and slice 1's job-role suite (`slice2-fix-green.txt`); red first, 4 of the 7 new cases (`slice2-fix-red.txt`); seven mutants, all killed (`slice2-fix-mutations.txt`). **Gates:** `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:fabricated-identity`, `ci:tenant-resolvers`, `ci:discarded-audit-write`, `ci:session-scoped-rls-bypass` pass; ESLint gives the six slice files and the three test files no warning.

## Slices 1 and 2, client: job roles and who must train, reached from the register (2026-10-30)

The nine routes of slices 1 and 2 had no client caller (slice 2, deviation 1). Design §3.12's slice 1 and slice 2 controls, in existing Quality files only:

- **`TrainingCoverage.tsx`**: a "Job roles" button in the training section's header opens `JobRolesPanel` (in the shared `DialogPanel`): each role, its description, how many documents it is assigned to, and who holds it ("no longer an active member" for a holder who left). An administrator (`canAdminister`) creates, renames and deletes a role and adds and removes a holder, each with its reason. A role still assigned to a document cannot be deleted, and the button says why.
- **`SopRegister.tsx`**: a "Training" chip on each row of a trainable type that is not retired (`QMS_TRAINABLE_DOCUMENT_TYPES`), beside "Read and acknowledge", opens `TrainingAssignmentsPanel`: the version in force and any version approved for a later day; the job roles and people assigned, who assigned each and when; and the people assigned, in full for an administrator or designated QMS approver, otherwise the count and the reader's own line (P-50 Q3, as the server decides). With `canAssign`, "Assign a job role", "Assign a person" and Withdraw, each with its reason and only offering what is not already assigned; with `canAssign: null`, "could not be checked" and no controls.
- **`hooks.ts`**: `useJobRoles` and `useTrainingAssignments(documentId)` on the shared `useFetchJson`, each body checked by a guard, so a body of the wrong shape is a failed read. The panels call them, so the register reads nothing until one is opened.
- **`qmsWrites.ts`**: `qmsWrite` accepts `DELETE`, whose reason travels in the JSON body the governed removals require.
- **`app.css`**: four rules for the panels' rows and lists.

Every refusal is the server's sentence (each already ends "Nothing was changed."), kept until the next try; a failed read is `ErrorState`, never "No job roles yet." or "Nobody is assigned".

**Tests:** `client/src/concept2cure/quality/__tests__/TrainingAssignments.test.tsx`, 15 cases: red 15/15 at `95e6800740` (the panels did not exist, `client-1-2-red.txt`); green 15/15, and all 27 Quality client test files, 283 tests (`client-1-2-green.txt`). Three mutants, all killed (`client-1-2-mutations.txt`). **Gates:** `ci:undefined-css-classes`, `ci:unauthenticated-fetch`, `ci:fabricated-identity` pass. The Quality folder is outside ESLint's scope (the config's ignore list), so the warning ratchet does not apply to it.

**Slice 1's exit condition ("every new route has a client caller") is now met** for the nine job-role and assignment routes. Still open for slice 3: compliance over the assigned people, both versions acknowledgeable, the coverage rows' honest states and the approve dialog's "N people are assigned".

## Slice 3a: compliance counts the people assigned; training person by person is QA's (2026-10-30)

Design §3.6 and P-50 Q3. The rest of slice 3 (both versions acknowledgeable during a training period, the reader's successor, the approve dialog's "N people are assigned", D6's refusal to revise a pending version) is **3b, not done here**.

**What already existed** (re-read at `8659f31539`): `readQmsTrainingCompliance` counted every active member of the organization (`training-compliance.ts`, the roster query) and the client turned an absent count into `0` (`hooks.ts`, `?? 0`); the register computed its own percentage (`SopRegister.tsx`). `GET /qms/training` returned every member's training records to every member, and `GET /qms/training/expiring` every member's lapses. The resolver of who is assigned exists since slice 2 (`readQmsTrainingAssignees`); compliance did not use it.

**What changed:**
- `server/services/qms/training-compliance.ts`: the denominator is the distinct active people assigned to each document, through the one resolver; the numerator, those of them with a current receipt of the exact release in force. Each row gains `assignment` (`assigned`, `not_assigned`, `no_active_assignees`); `current` and `of` are null unless assigned, so a document assigned to nobody never reads 0 of N. `me` is the viewer's own line (`assigned`, `countsNow`). `summarizeQmsTrainingCompliance` is the register's one figure; its `averageCurrentPct` is null when nothing is assessed. G10's expiry counts the people assigned only. The roster query is deleted, so `ACTIVE_MEMBERS_SQL` is the only definition of an active member in the training code.
- `server/routes/mdx-qms-training.ts`: compliance passes the viewer and returns `meta.summary`. `GET /qms/training` and `GET /qms/training/expiring` give every person's rows only to administrators and designated QMS approvers (the Approver role stands in while nobody is designated), and anyone else their own, with `meta.scope` saying which (P-50 Q3). Compliance stays open to every member: it carries counts, and each reader's own line.
- Client: `hooks.ts` maps `assignment`, nullable counts, `me` and the guarded `meta.summary`; `data.ts` `coverageKpiOf` is the KPI's one decision; `TrainingCoverage.tsx` draws one of four states (a figure, "Not assigned", "No active assignees", "Unavailable"), the reader's line ("You are current…", "You are assigned and have not acknowledged…") and new header words ("Version in force · people assigned"); `SopRegister.tsx`'s KPI reads the server's average and says why when there is none ("No document is assigned yet", "No one assigned is an active member", "The coverage summary could not be read"). The client computes no percentage.

**Intended contract changes, in the tests that pinned the roster:**
- `training-compliance.pglite.test.ts`: the roster-era cases keep their meaning by assigning each document a job role every member holds (`assignToEveryone`, in the shared `_release-approval-fixture.ts`); "0 of 0 when nobody active remains" becomes `no_active_assignees` with no figure. `training.pglite.integration.test.ts` uses the same helper.
- `tests/db/qms-in-force-during-revision.dbtest.ts` names its two trainees by assignment; `qms-current-signing-and-training-admission.dbtest.ts` assigns its viewer, so the withdrawn release reads "assigned, 0 of 1" rather than "not assigned".
- `SopRegisterPersonalTraining.test.tsx`: "No active roster members to assess" becomes "No one assigned is an active member".

**Tests:** red first (`slice3a-red.txt`: 7 of 15 PGlite cases; `slice3a-routes-red.txt`: 3 of 3 route cases against trunk's route and service; `slice3a-client-red.txt`: 5 of 9 client cases). Green (`slice3a-green.txt`): 56/56 PGlite; 59/60 across the six training and QMS database suites; 287/287 Quality client tests. Six mutants, all killed (`slice3a-mutations.txt`).

**The one database failure is not this change's:** `qms-current-signing-and-training-admission.dbtest.ts` "refuses retire after actual target wait and signer demotion" fails identically on trunk's code ("The actual QMS request did not wait on its authoritative target lock", a 20 s timeout). Two other failures seen first (send-for-review answered 500) were the throwaway database being older than trunk (`unified_tasks.route_authoring_signature_id` absent); `scripts/db/deploy-migrate.mjs` brought it to trunk's schema and both pass.

**Gates:** `ci:sql-interpolation`, `ci:server-error-leaks`, `ci:fabricated-identity`, `ci:tenant-resolvers`, `ci:undefined-css-classes`, `ci:unauthenticated-fetch` pass; ESLint gives the changed server and test files no warning (`training.pglite.integration.test.ts` was brought back under 500 lines by moving the helper into the shared fixture).

## Slice 3b, server: training opens at approval; a pending version cannot be revised (2026-10-30)

Design §1.2, §3.4, §3.5, D6; P-49, P-50 Q2. The client half (the reader's successor toggle, the approve dialog's "N people are assigned") follows.

**What already existed** (re-read at `42aa4a849b`): another session had built the pending version's standing (`in-force-release.ts` `isPendingEffective`; a version approved for a later day keeps its signed predecessor in force) and the backdate refusal with the date on the signature (`e0498e0b3f`), and controlled copies of the version in force only (`31877bd792`). What was missing: training read only the version in force, refused to open one approved for a later day, and refused its acknowledgement as stale; assignment granted no reading (D3); and **revising a version approved for a later day was accepted**, replacing it with the next draft so the approved version would never take effect (`slice3b-red.txt`: 200, a v3.0 draft).

**What changed:**
- `training-content.ts` `describeQmsTrainingDocument` and `current-release-approval.ts` `readQmsTrainingReleaseContext` take `ahead`: only the training paths open a version approved for a later day. Every other reader keeps today's refusal, so the controlled copy (which also refuses anything `resolveInForceRelease` does not put in force) can never issue one of a version not yet in force. Each context gains `inForce` and `effectiveDate`. A receipt of a version acknowledged ahead of its day verifies; whether it counts is still the in-force match in compliance, so it counts from that day.
- `training.ts`: the training read opens on the version in force and, while a successor waits, offers it as `successor` with its own signed text, digest and the reader's receipt; refused, with its reason and none of its text, to someone who may not read it. A first version approved for a later day is the read itself. The acknowledgement takes the version the body names, in force or pending, and anything else is `QMS_TRAINING_STALE`; the receipt and its audit row record `effectiveDate` and `inForceAtAcknowledgement`.
- `training-assignment.ts` `authorizeQmsTrainingRead` (D3, P-50 Q2): the people assigned to a document read its authored released version in the training reader without a share onto its authored copy; anyone else needs one, as before. It grants only that read, not the editor or the version history.
- `controlled-document-service.ts` (D6): revision refuses a version approved for a later day, `409 QMS_REVISION_PENDING_EFFECT`, before any work and again under the row lock; the route and AnA's `revise_qms_document` share the service.
- `shared/qms/training.ts`: the context schema gains `inForce`, `effectiveDate` and `successor`, with the same rules on each version.

**Tests:** `tests/db/qms-training-pending-version.dbtest.ts` (new), v2.0 approved for ten days out through the real routes, trainees named by assignment, one not shared onto v2.0's authored copy: red 5 of 6 at trunk (`slice3b-red.txt`), green 6/6. Regression (`slice3b-green.txt`): 70/72 across eight QMS database suites, 481/482 across the server QMS suites, the QMS route tests and every Quality client test; the three failures are red at trunk with or without this change, each confirmed on trunk's code (`slice3b-mutations.txt`), and the periodic-review one is fixed here (retire signs `retirement`, P-51). Five mutants, all killed.

**Not done:** the training read's successor in the client (`PersonalTrainingReader.tsx`), the approve dialog's count of people assigned, and a periodic-review refusal on a pending version (design `QMS_REVIEW_PENDING_EFFECT`).


## Slice 3b, client: the reader reads both versions; the approve dialog says who it reaches (2026-10-30)

Design §3.12 (`PersonalTrainingReader.tsx`, the approve dialog's `targetMeta`); P-49.

**What already existed** (re-read at `12ab1bdd01`): the reader (`PersonalTrainingReader.tsx`, `usePersonalTraining.ts`, `qmsPersonalTraining.ts`) read one context and acknowledged it. The approve dialog already took the signed effective date (`SopRegister.tsx`, `renderMeaningDetails`; CAT2-19), and `useTrainingAssignments` already returned `peopleCount` for any reader. **A defect found while reading:** `readPersonalTrainingRecord` refused any read where the document row's version was not the version read. Since `1efe41ea43` (2026-10-22), training reads the version in force while the next one is drafted, so **every document under revision opened as "The released revision could not be verified"**, and so would every document with a version approved for a later day. The server had been right for eight days; the client refused it (`slice3b-client-red.txt`, the "being drafted" case).

**What changed:**
- `qmsPersonalTraining.ts` `readsRow`: the row is the version read; or the version read is in force (`inForce: true`, effective) and the row is its successor, either a draft or review row, or exactly the `successor` the read offers (same document, version and status). Anything else is still unverifiable. The successor's receipt is checked against this person and its own version, as the primary's is.
- `usePersonalTraining.ts`: the record holds which version is read (`reading`, opening on the version in force) and derives `selected` and its `receipt`. There is one source for the receipt: the separate receipt state is gone. Choosing the other version withdraws an unsent declaration. The acknowledgement posts the selected version. The confirmed receipt goes onto that version only, and the reread finds it wherever it now stands. If v2.0 took effect meanwhile, it is the version in force and the reader follows it.
- `PersonalTrainingReader.tsx`: while a successor waits, "v2.0 is approved and takes effect on D." and a two-option choice, "In force: v1.0" / "Takes effect D: v2.0". The header names the version read ("Approved · takes effect D" for the successor). For a version not yet in force, the declaration says "Your acknowledgement is recorded now and counts from D", and the receipt adds "Counts from D". A successor the reader may not read shows the server's reason, with none of its text and no declaration.
- `TrainingCoverage.tsx` `ApprovalTrainingReach`, under the approve dialog's date: "N people are assigned to train on this document." It then says either "Effective today leaves them no training period: it is in force when you sign" or "They can read and acknowledge it from approval until it takes effect on D". Otherwise it shows one of three sentences: "No one is assigned…", "No one assigned … is an active member", or "… could not be read". None of them shows a count it does not have. It does not promise a task: tasks are slice 4.

**Tests:** red first (`slice3b-client-red.txt`):
- 5 of 8 new reader cases (all five positive cases; the three refusal guards pass at trunk and stay);
- 3 of 8 new transport cases;
- 5 of 5 approve-dialog cases.

Green (`slice3b-client-green.txt`): 309/309 Quality client tests.

Fifteen mutants, all killed (`slice3b-client-mutations.txt`). Two guards were added before the run because a mutant would otherwise have survived:
- a v2.0 receipt kept, and only on v2.0, when the reread fails;
- no "has changed" notice after a confirmed v2.0 acknowledgement.

**Not done:**
- Opening the reader on the successor from a training notice (`qmsIntent: 'read'`) is slice 4.
- The periodic-review refusal on a pending version.
- Editing the controlled text of a revision draft from this reader: the editor still binds to the context read, which is now the version in force. So "Edit controlled text" is offered only for a first version. That was already true before this change; it was hidden behind the refusal above.

## Slice 4: training reaches the people assigned as tasks (2026-10-30)

Design §3.6 (`trainingTaskOf`), §3.9; P-49 (distribution), P-50 Q1 (14 days for a late assignment). The notice opening the reader (`qmsIntent: 'read'`, the notification target) is **4b, not done here**.

**What already exists** (re-read at `065b8ef70d`):
- `replaceSourceTask` (`server/services/tasking/source-task.ts`) keeps one open task per source record, best effort.
- `periodic-review-task.ts` is the pattern: module Quality, `remindDaysBefore`, closed then rewritten.
- The due-date sweep (`server/jobs/taskDueSweep.ts`) sends one due-soon notice and one overdue notice per task. It honours `dueSoonNotifiedAt` and `overdueNotifiedAt` already in `metadata`.
- `notifyTaskEvent` (`task-side-effects.ts`) is the per-assignee notice.
- The approve and retire routes already plan the periodic-review task after COMMIT, before answering.

Nothing wrote a training task. The resolver of who is assigned (`readQmsTrainingAssignees`) and the verified receipt (`verifiedTrainingReceipt`) had no caller in tasking. `governedQmsWrite` answered inside itself, so no assignment write could do work after its COMMIT and before its answer.

**What changed:**
- **`source-task.ts` `reconcileSourceTasks`.** It makes the open tasks under one key, or under every key that starts with a prefix, exactly the desired set:
  - an open task that records the same thing is kept;
  - any other is closed as the act says (done, or withdrawn);
  - a missing one is written.
  The prefix is matched literally (`left(...) = $p`, no LIKE), and checked again on the rows read, so `qms-document:1:user:` never reaches document 10. `replaceSourceTask` is now its one-key case, so there is one implementation; its four tests are unchanged and green.
- **`server/services/qms/training-task.ts` (new).** One Quality task per person per document, keyed `qms-document:<id>:user:<userId>`, for the version they train on next: the version approved for a later day while it waits, otherwise the version in force.
  - It is due on the day that version takes effect.
  - Someone covered after it was in force is due 14 days after they were covered (P-50 Q1).
  - Someone holding a verified, unexpired receipt of that version has no task.
  - A new task carries the sweep markers its assignment notice already covers, so a task born due is never also told "overdue". Each new task gets one `task_assigned` notice: "Due D, the day it takes effect…", "…is in force; read and acknowledge it now", or "…by D".
  - A release nobody can read and acknowledge (its text no longer matches its signature) gets no task.
  - The plan runs in its own read-only transaction with the tenant set. A plan that could not be read applies nothing, so a failed read is never an empty set that closes tasks. Writing is best effort and never undoes the act.
- **Wiring:**
  - approval of a version and retirement plan the document (`mdx-qms.ts`), after COMMIT and before the answer;
  - an acknowledgement plans that person on that document;
  - `governedQmsWrite` takes an optional `afterCommit` from the write, run after COMMIT and before the answer on the still-held request client. Through it, an assignment added or removed plans the document, and a job-role member added or removed plans that person on each document the role is assigned (`mdx-qms-training.ts`).
  - The effective date arriving changes nothing and needs no scheduler: the task was already due on it.

**Deviations from the design:**
- **Lateness compares moments, not days.** The design's `utcDay(coveredSince) > effective day` was written with a grace of 0. With P-50's 14 days, a person assigned an hour after a same-day approval would have been due at once, while one assigned the next day got two weeks. The moment a version took effect is 00:00 UTC on its effective day, or its approval when it was approved later that day.
- **The late-assignment notice says "by D".** The design said "now"; that was written for a grace of 0.
- **An assignment change plans the whole document.** The design planned only the people newly covered. The plan is idempotent (`same` keeps every unchanged task), so the only difference is that a task missed earlier, for example while writes were failing, is written by the next change on its document.

**Intended contract change:**
- `server/routes/__tests__/qms-personal-training.test.ts`, `mdx-qms-retire.test.ts` and `qms-document-approval-signature.test.ts` pinned COMMIT as the act's last statement, and the routes now plan in a read-only transaction after it. Each suite mocks the planner, keeps that assertion, and asserts the call (approval and retirement: the document; a rolled-back retirement: none). The acknowledgement suite adds two:
  - the planner is asked for exactly this person on this document;
  - a refused acknowledgement asks nothing.
- `tests/db/qms-document-signature-required.dbtest.ts` signed retirement as `APPROVED`. That had been red at trunk since P-51 made the meaning `retirement`; corrected, as the periodic-review suite was in slice 3b.

**Not done:**
- **4b:** the notice opens the training reader on the successor (`qmsIntent: 'read'`), for an assignee without a share onto the authored copy.
- **Slice 5:** the per-person due and overdue rows in G10 and `TrainingExpiry.tsx`.
- **A receipt that lapses** (expires) is not a task on the day it lapses: nothing is scheduled. It shows as lapsing in G10. The next act that plans its document writes the task, due at once.
- **A member who leaves the organization** keeps any open task until the next act that plans their documents.

## Slice 4b: a training task's notice opens the reader that completes it (2026-10-30)

Design §3.9 ("The notice opens the reader"). It is also QP1 of `docs/design/QMS_IN_PROJECTS_2026-10-30.md`, the founder's request of 2026-10-30 that Quality be "connected to talking and messaging".

**What already exists** (re-read at `98cc17c8c5`):
- Every notice opens through `GET /api/mdx/notifications/:id/target` (`notification-record-target.ts`).
- A task's notice opened the Tasks board (`taskTarget`).
- A controlled document's notice opened Quality on its editor, and for an authored document that requires view of the editing copy (`qualityTarget`).
- The deep link reached the register through `QualityModule`, `QualityRoute`, `App` and `SopRegister` (`useControlledDocumentTarget`), always towards the editor.

**A defect found on the way:**
- The notice door read a task reference only as `TASK-…` or `ROUTE-…` (`noticeTaskId`, `shared/types/notification-navigation.ts`).
- `createUnifiedTask` writes a UUID, and so do every source-task: periodic review, CAPA, and the training tasks of slice 4.
- So the reminders the due-date sweep sends for those tasks opened nothing: the server answered 422 "This notification does not name a record…", and the client offered no "Open task".
- `noticeTaskId` now reads both forms the task store holds (`task_id` is text). Red in `slice4b-red.txt`, client and server.

**What changed:**
- **`taskTarget`.** A `qms_training` task's notice resolves to Quality on its document with `qmsIntent: 'read'` and the label "Read and acknowledge" for the person assigned (`isQmsTrainingAssignee`). It asks nothing of the authored editing copy (P-50 Q2).
- **Anyone no longer assigned** is asked what any notice on the document asks: view of the authored copy, or the inline document without the intent.
- **A key that is not a training key** (`qms-document:<id>:user:<userId>`, anchored) opens nothing (422).
- **The shared contract** admits `qmsIntent` on Quality only as absent or `read`.
- **The client.** `QualityModule` carries only `read`. The register then opens `PersonalTrainingReader` instead of the editor, starting on the version approved for a later day when one waits (`startOnSuccessor`), and on the version in force otherwise. While an editor is open, the target waits, as every notice target does.
- **`QMS_TRAINING_TASK_SOURCE`** moved to `shared/qms/training.ts`, so the notice target does not import the task writer. `training-task.ts` reads it from there.

**Tests:** red first (`slice4b-red.txt`: 10 of 74 across five suites, three of them extended). Green (`slice4b-green.txt`):
- 74/74;
- 384/384 across every notification and Quality client suite;
- 14/14 in `qms-training-tasks.dbtest.ts`, whose new case resolves a real training notice through the real door, for its recipient (200, the reader) and for someone else (404).

Eight mutants, all killed (`slice4b-mutations.txt`).
