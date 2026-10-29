# Labeling approval controls: the four follow-ups, on the QMS lifecycle

Launch row D5 (governed path, 21 CFR Part 11). Date 2026-10-29. This takes up the "Not done" list in `../README.md`, which covers the translation approval made a signed act in `96537cfe`. The work was done on a working tree over `be1181958`, then over `1a6701ea6`. The route and the screen were as `96537cfe` left them.

There were two rounds:

- The first closed the four gaps.
- In the second, the lead pointed out that four questions I had handed on as product decisions are already answered by the catalog. The QMS controlled document has the rule, and CLAUDE.md Rule 3 says follow it. So the second round applies the QMS rule to each of them, and has AnA record the creator.

**Status: done.** The limits are at the end.

## What was open

1. **Labeling documents.** A document could be created as `approved` or `effective`, or PATCHed to either, with no signature. The table had no approver column.
2. **Separation of duties for translations.** `labeling_translations` recorded no author. `translator` is free text and the create stored no user, so a person could sign their own translation.
3. **A stamp that outlives its approval.** An approved translation could be edited and stayed approved with its stamp. Moving it out of approved left `approved_by` and `approved_at` set.
4. **Viewers** saw Approve, Advance and Add translation. The server refused them (`requireEditorAccess`, `43fb57cc`) after the click.

## What already exists

Read in the working tree before any change.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| The labeling lifecycle | `server/routes/mdx-labeling.ts` `DOC_STATUS`, `TRANS_STATUS` | Document statuses are draft, review, approved, effective and superseded. Translation statuses are pending, in_progress, review, approved and rejected. | There was no transition table. The PATCH set any status from any status. |
| The labeling tables | `migrations/20260511_qms_and_labeling.sql` | `labeling_translations` has `approved_by` and `approved_at`. | `labeling_documents` has no approver. Neither table records who added a row. |
| Who calls the labeling writes | `Labeling.tsx`; AnA `create_labeling_document` and `add_labeling_translation` (`AnaToolExecutor.ts`) | The screen adds translations, advances them and approves them. AnA inserts a draft document or a pending translation. | Nothing sets a document's status: no client and no AnA tool. AnA recorded no creator. |
| The route ceremony | `server/routes/governed-signed-act.ts` `signGovernedAct` | Authority, then the password. Then one transaction holds the lock, the domain write, the `sign` ledger pair and the signature row. | No separation of duties. Its header says why. |
| Separation of duties | `server/services/governance/separation-of-duties.ts` (`resolveTargetAuthors`, `SINGLE_AUTHOR`, `assertSignerIsNotAuthor`, `separationOfDutiesRefusal`) | `SINGLE_AUTHOR` holds creator-only targets (`ectd-sequence`, `submission-package`, `program`, `report-run`). An author is refused with 403. `separationOfDutiesRefusal` is the one mapping to HTTP. | It had no labeling target. On its own it refuses a record with no recorded author (409). |
| Separation of duties at route level | `server/api/cmc/module3OperatingSystemRoutes.ts` ~797 | `assertSignerIsNotAuthor(..., { client })` on its own transaction, before anything is written, answered through `separationOfDutiesRefusal`. | — |
| QMS approval | `mdx-qms.ts` `POST /qms/documents/:id/approve`; `services/qms/document-approval-signature.ts` `approveQmsDocumentSigned` | Admitted only from `in_review` (`APPROVABLE_STATES`), otherwise 409 in words. It refuses the author (`QMS_SELF_APPROVAL`). With no author recorded it signs. Its two-person-rule record is the `twoPersonRule` field (`'enforced'` or `'not_applicable_no_author_recorded'`), with `originalAuthorId`, on the signature manifest and `metadata.approval`. In one act it stamps `approver_id`, `approved_at` and `effective_date = COALESCE(given, stored, today)`. | — |
| QMS edit and revision | `services/qms/controlled-document-service.ts`: `updateControlledQmsDocument`, `reviseControlledQmsDocument` | Only a draft is edited (409 `QMS_DOCUMENT_CONTROLLED`). A revision needs a reason of at least 8 characters, sets the document back to draft with `approver_id`, `approved_at` and `effective_date` NULL, and writes a `transition` ledger row (`recordGovernedAction`) on the same transaction. A revision is not a signature. | — |
| QMS retirement | `mdx-qms.ts` `POST /qms/documents/:id/retire`; `retireQmsDocumentSigned` | Signed. The meaning is `QMS_DOCUMENT_APPROVAL_MEANING` (`'APPROVED'`). Admitted from any status but retired. No two-person rule ("a retirement is not an approval of the author's own work"). The approval stays. | — |
| Authoring document | `authoring.router.ts` `POST /docs/:docId/e-sign`; `authoring-permissions.ts` `decideAuthoringPermission` | The e-sign refuses the author. An approved or frozen document refuses edits (`document-immutable`). | — |
| The client's role read | `shared/constants/permissions.ts` `canGovernedWrite`, over `GOVERNED_WRITE_PERMISSION`, derived from the roles `requireEditorAccess` admits | TaskBoard, PlanAssign, GatewayTransmittals, Insights, ControlledTextEditor and PersonalTrainingReader use it. The Vault panels use it through `useVaultCanWrite` and `VaultViewOnly`. With no permissions array, the controls are offered. | — |
| The sign gate | `scripts/ci/check-sign-ceremony.mjs` | It counts a stamp (`approved_by = $n`, `= NOW()`, `= COALESCE(`) inside a handler that calls `signGovernedAct`. A clear (`= NULL`) is not a stamp. | It does not see `= CASE …`. |

Searches run:

- `labeling_documents` and `labeling_translations` across `server`, `shared`, `scripts`, `migrations` and `db/migrations`.
- `resolveTargetAuthors`, `assertSignerIsNotAuthor` and `separationOfDutiesRefusal` across `server`.
- `twoPersonRule`, `APPROVABLE_STATES`, `QMS_DOCUMENT_APPROVAL_MEANING`, `reviseControlledQmsDocument` and `retireQmsDocumentSigned` in `server`.
- `document-immutable` in `server/services/authoring`.
- `canGovernedWrite`, `useVaultCanWrite`, `canWrite` and `useOrgRole` across `client/src`.
- `api/mdx/labeling` across `client/src`.
- `git log --all --diff-filter=D --name-only`, filtered for `labeling`, `viewonly` and `translationapproval`: no deleted file. This clone is shallow, so the search covers its 1,170 commits.

## The patterns copied: the QMS controlled document's lifecycle

| Rule | QMS | Labeling now |
|---|---|---|
| Moves that sign | Approval (to effective) and retirement are signed. | A document's approval, its move to effective and its supersession, and a translation's approval, go through `signGovernedAct`. Creating a document as approved, effective or superseded answers 428 (`LABELING_DOCUMENT_APPROVAL_REQUIRES_SIGNATURE`), as the translation create does. |
| Order | Approval only from `in_review`; 409 in words. | A document is approved only from review (409 `LABELING_DOCUMENT_NOT_IN_REVIEW`; a draft is told to send it for review first). It is made effective only from approved (409 `LABELING_DOCUMENT_NOT_APPROVED`). A translation is approved only from review (409 `TRANSLATION_NOT_IN_REVIEW`; already approved stays `TRANSLATION_ALREADY_APPROVED`). Every refusal ends "Nothing was signed." |
| Separation of duties | The author is refused. With no author recorded the approval is signed, and `twoPersonRule: 'not_applicable_no_author_recorded'` says so. | A recorded creator is refused (403 `SEPARATION_OF_DUTIES`, through `resolveTargetAuthors` and `separationOfDutiesRefusal`). With no creator recorded (a row from before 20261029b) the approval is signed. The ledger and signature payloads carry `twoPersonRule` (`'enforced'` or `'not_applicable_no_author_recorded'`) and `originalAuthorId`, the QMS field and words. Nothing is refused (409) only for predating the column. |
| Effective | The approval stamps `effective_date` (given, stored, or today). | The move to effective stamps it the same way, and keeps the approval the document carries. |
| Edit after approval | Only a draft is edited. | A record that carries an approval is not edited (409 `LABELING_DOCUMENT_CONTROLLED`, `TRANSLATION_APPROVED_LOCKED`). For a document that means approved, effective or superseded; for a translation, approved. |
| Withdrawing an approval | A revision needs a reason, clears the stamp and the effective date, and writes a `transition` ledger row. Not signed. | Moving a document out of approved, effective or superseded, or a translation out of approved, needs a reason. The check is `requireGovernedReason`, at least 8 characters, the revision's floor; without a reason the answer is 400 `APPROVAL_WITHDRAWAL_REASON_REQUIRED`. The stamp is cleared, and the effective date too when the document had been effective or superseded. A `transition` ledger row (`recordGovernedAction`, payload `kind: 'withdraw-approval'`, `from`, `to`, `withdrawnApprovalBy`) is written on one transaction with the update. Not signed. |
| Retirement | Signed `'APPROVED'`, from any status but retired, no two-person rule, approval kept. | Supersession is signed with `'APPROVED'` only (`MEANING_NOT_ALLOWED` for any other), from any status but superseded, with no two-person rule, and the approval kept. |
| Viewer | — | `canGovernedWrite(useAuthUser())`, as the task board uses it. |

Kept as the lead decided:

- **The creator is the author.** It is one `SINGLE_AUTHOR` column, as `ectd-sequence` and `submission-package` are. Someone who later edits a translation or a document is not recorded, so is not refused.
- **Separation of duties applies to the document approval too** (and to its move to effective), as the QMS approval refuses its author. The brief named translations only.

Where labeling differs from QMS, and why:

- **QMS has one act, labeling two.** QMS approves and makes effective in one act. Labeling has the two as separate states, so each is its own signed step in that order.
- **A document approved before its approver was recorded** has `approved_by` NULL. The move to effective then records its signer as approver (`COALESCE`). The signature row of that move is the approval on record.
- **Supersession writes nothing to the row but the status.** The signature row and ledger pair record who and why. QMS also writes `metadata.retired`; labeling does not.
- **`VaultViewOnly` was not reused.** Its sentence ends "A member or administrator can." That is false for Approve: a member cannot sign. Signing authority is admin, approver or reviewer (P-18).

## The migration

`migrations/20261029b_labeling_approval_stamps_and_creators.sql`, unchanged in the second round. It sits in `C2C_MIGRATION_FILES` after `20261029_hf_engineering_files_program_key.sql` and above the `20261029c` and IVD entries that other slices added after it. That puts it before the final sweeps. In the working tree it is a seven-line insertion.

- `labeling_documents.approved_by INTEGER REFERENCES users(id)` and `approved_at TIMESTAMPTZ`: the approval stamp.
- `labeling_documents.created_by` and `labeling_translations.created_by INTEGER REFERENCES users(id)`: who added the row.
- No "effective" stamp column. The QMS effective stamp is `effective_date`, which the table already has.

Rule 1 notes:

- Each column is added only when `pg_attribute` shows it absent, so a replay runs no DDL and takes no lock.
- Additive only: no DROP, no constraint replaced, no backfill, no COMMENT.
- Both tables are in `public` with `organization_id INTEGER NOT NULL`, so the final sweep polices them. It creates no table.
- Existing rows keep NULL. Nothing guesses a creator; such a row is now signed as QMS signs one with no author.
- The PGlite test applies it twice. The migration gates pass, and the tenant-isolation sweep contract is 20/20.
- `shared/schema.ts` (Drizzle) does not list the columns. Nothing reads them through Drizzle.

## What changed

- **`server/routes/mdx-labeling-approvals.ts`** (new in the first round, rewritten in the second). It is its own file because the same code inline put `mdx-labeling.ts` over `max-lines`.
  - `signDocumentStatus`: the signed move to approved, effective or superseded. Its `run`:
    1. reads the document `FOR UPDATE`;
    2. refuses it if it is out of order (`documentStateRefusal`);
    3. asks the two-person rule, except for a supersession;
    4. stamps.
  - Meanings: `DECISION_ACT_MEANINGS` for approval and effective; `['APPROVED']` for supersession.
  - `approveTranslationSigned`: approval only from review, then the two-person rule, then the stamp.
  - `twoPersonRule`: returns `'not_applicable_no_author_recorded'` when no creator is recorded. Otherwise it runs `assertSignerIsNotAuthor` and returns `'enforced'`, refusing in `separationOfDutiesRefusal`'s words.
  - `withdrawApproval`: BEGIN, tenant context, row `FOR UPDATE`, the reason, the cleared update, the `transition` ledger row, COMMIT. `DOCUMENT_WITHDRAWAL` and `TRANSLATION_WITHDRAWAL` hold each table's SQL.
  - `moveDocumentStatus` and `moveTranslationStatus`:
    - a move that withdraws no approval is one guarded statement, as before;
    - when that statement changes nothing, the move goes to `withdrawApproval`;
    - a translation's plain move still clears any stamp left on a row that is not approved.
  - `refuseControlledDocumentEdit` and `refuseApprovedTranslationEdit`; `signingLimit`, `editsBesides`, `DOC_SIGNED_STATUS` (now including superseded).
- **`server/routes/mdx-labeling.ts`**
  - Both creates record `created_by`, and answer 401 when there is no user.
  - The document create answers 428 for approved, effective or superseded.
  - `PATCH /labeling/:id` mounts `signingLimit` and sends a signed status to `signDocumentStatus`, a status-only move to `moveDocumentStatus`, and an edit through the guarded statement.
  - `PATCH /labeling/translations/:transId` does the same for its own statuses.
  - The three interpolated `.query` templates stay here, so `ci:sql-interpolation` keeps this file at 7.
- **`server/services/governance/separation-of-duties.ts`**: `SINGLE_AUTHOR` entries `labeling-document` and `labeling-translation` (creator, numeric id, organization-scoped).
- **`server/services/ana/AnaToolExecutor.ts`** (second round, two narrow hunks).
  - `labelingCreatorOf(ctx)` returns the acting user, or null.
  - `create_labeling_document` and `add_labeling_translation` insert `created_by` = the acting user. With no acting user they add nothing.
  - ESLint: 96 warnings, the same rules and counts as HEAD.
- **`client/src/concept2cure/v2/surfaces/Labeling.tsx`**: `canWrite = canGovernedWrite(useAuthUser())`. A viewer is offered no Add translation, Advance or Approve, and sees a "View only" line. AnA's action list matches.
- **`client/src/concept2cure/v2/surfaces/LabelingTranslationApproval.tsx`**: `TranslationStepControl` (Approve in review, Advance before it, nothing once approved or for a viewer) and `translationStepActions`. `refusedSigning` says "Nothing was signed." once.
- **Tests**
  - New: `server/__tests__/routes/mdx-labeling-approval-controls.pglite.test.ts` (54), `server/services/ana/__tests__/labeling-tools-record-creator.test.ts` (4) and `client/src/concept2cure/v2/__tests__/labelingViewerHidesWrites.test.tsx` (4).
  - Changed: `mdx-labeling-translation-approval-signature.test.ts`.
    - The creator read is mocked, and a case pins the creator's refusal.
    - The payload now carries `twoPersonRule` and `originalAuthorId`.
    - A clear is no longer counted as a stamp.
  - Changed: `labelingTranslationApprovalSigned.test.tsx` (the "said once" case).

## Proof

Each test file was run alone, under `timeout 240`.

- **Red, first round.**
  - `red-route.txt`: 27 of 34 against the route as `96537cfe` left it. The 7 that passed are kept behaviour.
  - `red-client.txt`: the viewer suite 2 of 4; the "said once" case 1 of 11.
- **Red, second round.**
  - `red-route-qms-rules.txt`: the rewritten PGlite test, **31 of 54 red** against the first round's code. That covers each order refusal; a record with no creator refused (409) where it should be signed and recorded; withdrawal with no reason and no ledger row; supersession unsigned; and the two-person rule not recorded.
  - `red-ana.txt`: **2 of 4**. Both tools inserted no `created_by`. The two "no acting user" cases already pass, because the tool wrapper refuses first.
- **`green.txt`.** 21 files, all green:

  | Suite | Result |
  |---|---|
  | PGlite route test | 54/54 |
  | mocked approval | 24/24 |
  | editor gate | 24/24 |
  | AnA creator | 4/4 |
  | AnA device tools | 16/16 |
  | tenant-isolation sweep contract | 20/20 |
  | separation of duties | 32 and 94 |
  | the labeling client suites | 43 tests |
  | device project writes and reads | 39 and 20 |
  | QMS/labeling routes | 28 |
  | module shells smoke | 10 |

- **`gates.txt`.**
  - `ci:sign-ceremony` passes, with 18 baselined sites as before. Its selftest is 29/29.
  - `ci:sql-interpolation` passes, with `mdx-labeling.ts` at 7.
  - `ci:migration-set-order`, `ci:migration-drop-safety` and its selftest (12/12), `ci:migration-deploy-path`, `ci:migration-guard-order` and `ci:column-reachability` pass.
  - `ci:runtime-ddl`, `ci:server-error-leaks` and the CSS gate pass.
- **`mutations.txt`.** 28 mutations, each applied, run, and restored from the bytes read before. The sha256 matched every time, and the file ends with each file's sha256 now against before.

  | | Mutation | Red |
  |---|---|---|
  | N1 | No creator recorded is refused again | 3 |
  | N2 | The two-person rule not recorded | 2, and 1 in the mocked suite |
  | N3 / N4 | AnA document / translation create store no creator | 1 each |
  | N5 | A translation approved from any status | 3 |
  | N6 / N7 | A document approved / made effective from any status | 4 / 3 |
  | N8 | Withdrawal needs no reason | 4 |
  | N9 | Withdrawal writes no ledger row | 6 |
  | N10 | A move out of a signed status is a plain update | 8 |
  | N11 | Supersession not signed | 9 |
  | N12 | Supersession takes the approval meanings | 4 |
  | N13 | Supersession applies the two-person rule | 1 |
  | M1 | A signed document status takes the plain path | 23 |
  | M2 | Create as a signed status allowed | 3 |
  | M3 / M4 | No approver stamped / effective overwrites the approval | 2 / 1 |
  | M5 | The stamps written without `signGovernedAct` | 19. **Gate red**: `mdx-labeling-approvals.ts:172` and `:181`, stamps with no signature-row write |
  | M6 | The HTTP translation create stores no creator | 1 |
  | M7 | A recorded creator not checked | 3, and 2 mocked |
  | M8 | No `labeling-translation` author entry | 2 |
  | M10 / M12 | An approved translation / signed document editable | 3 / 3 |
  | M11 / M13 | Withdrawal leaves the translation's / document's stamp | 1 / 5 |
  | M14 / M15 | Write controls offered to every role / the row ignores the role | 2 / 1 |
  | M16 | "Nothing was signed." said twice | 1 |

  M1 is the one the gate cannot see: the plain path writes no stamp. The tests catch it.
- **`eslint.txt`.** Every file is at or below head.
  - `mdx-labeling.ts`, `mdx-labeling-approvals.ts`, `separation-of-duties.ts`, `LabelingTranslationApproval.tsx` and the tests: 0.
  - `Labeling.tsx`: head's 2 rules.
  - `AnaToolExecutor.ts`: 96 = 96, the same rules.
- **`typecheck.txt`.** Scoped `tsc`, server (now including `AnaToolExecutor.ts` and the AnA test) and client: exit 0 for both.

## Not done

- `shared/schema.ts` does not list the four columns.
- No content digest binder for either labeling target (parent README). The signature binds the ledger chain hash, with that basis named.
- The QMS approval also writes `twoPersonRule` into the row's `metadata.approval`, and its retirement writes `metadata.retired`. Labeling records both on the ledger and the signature row only.
- The screen still offers Approve to a translation's own creator. The server refuses them, and the dialog shows the sentence. `signerIndependenceOf` exists for a warning in advance.
- Nothing in the client approves a document, moves it to effective or supersedes it, and nothing withdraws an approval. Those are reached through the API and its tests only.
