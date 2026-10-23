# MR-12 — QMS: versioned controlled documents, training and periodic review

| | |
|---|---|
| Phase | Phase 0 (Stage 1) · Phase 1 (Stages 2–5) · Phase 3 (Stages 6–8) |
| Highest open severity at head | P0 (CAT2-18; F-11's recommended positioning keeps it P0) |
| Human testing | Blocks: the QMS read-and-understood training journey. "Record training" hands off to AnA, AnA refuses, and no native control exists (CAT2-21). Degrades: revising an approved SOP takes it out of force and leaves no history (CAT2-18, P11-03); the revised row keeps the old effective date (CAT2-19); the register shows no approver, signing time or meaning, and the Retire dialog offers only "approval" (P11-03); overdue flags are computed against a hard-coded 2026-06-04 (CAT2-22); create, revise and change transitions work only through AnA prompts (CAT2-26). Not observable in testing: CAT2-20, CAT2-23, CAT2-24, CAT2-25. |
| Owner | engineering (founder decisions gate Stages 2, 4, 5 and 7) |
| Effort | XL in total: M + L + M + M + M + M + L + M. The pilot path (Stages 1–5) is M + L + M + M + M. |
| Depends on | MR-06 (P11-01 signing authority, satisfied at head; MR-06 hands the QMS half of P11-04 to this order); MR-02 (OQ runner and CI gates); F-11, F-12, F-13; four NEW decisions below |
| Findings | 10 total — open 7 · partially fixed 3 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **CAT2-21**: partially fixed (f6e9ff399, a80d2fa65, fa39bd5d8, e1f3fd425); for testers it now degrades the journey but does not stop it. Evidence at head: [findings register](MR-findings-2026-10-13.json), `CAT2-21.recheck`.

> **Re-checked 2026-10-22 at `9e77eca23`** (`…session_01KnUGoX3g4R4FWKWGc2sTbN`). Stage 2 at head differs from the plan below. Approved versions are already retained, immutable, in `qms_document_versions` (`db/migrations/20261014_qms_controlled_authoring_content.sql`). SOP bodies live in Authoring editing copies, which settles NEW-1 as the recommendation. **CAT2-18's in-force half is fixed**: one resolver, `server/services/qms/in-force-release.ts`, keeps v1.0 in force for training, coverage, readiness, review-due and the register while v2.0 is drafted. Evidence: [`docs/evidence/MR-12/2026-10-22-in-force-during-revision/`](../evidence/MR-12/2026-10-22-in-force-during-revision/). Still open from Stage 2: the compliance-report register, and a version-history drawer in Quality.

## Goal

Every QMS controlled document has an immutable history of approved versions. Each version's approval signature binds its exact content, its linked artifact bytes and its effective date, and the register shows who signed, when (UTC) and with what meaning. The approved version stays in force while its successor is drafted and is superseded only when the successor takes effect. Training records are e-signed by the trainee, tied to the version in force and counted against the people assigned to the document. Periodic review, approver routing, controlled copies and change-control links meet what an inspector expects under 21 CFR 820.40, ISO 13485 §4.2.4 and Part 11 §§11.10(c), 11.10(e), 11.50 and 11.70. Every write is available from a native form, not only through the assistant.

## Why it matters

- **The first revision of a pilot SOP destroys the record of what was approved.** Revise is an in-place UPDATE, implemented twice (`server/routes/mdx-qms.ts:669-683` and `server/services/ana/AnaToolExecutor.ts:14322-14332`). The approved v1.0, its approver and its approval time cannot be retrieved afterwards, and the SOP drops out of Training compliance and readiness while v2.0 is drafted. An inspector finds this on the first revised SOP.
- **A tester cannot finish the training journey.** "Record training" (`client/src/concept2cure/quality/SopRegister.tsx:543-555`) opens AnA, AnA refuses `ack_training`, and no native control exists. Today a read-and-understood record can only be made from devtools.
- **Training numbers are not defensible.** v1.0 acknowledgments count toward v2.0, a draft or retired SOP can be acknowledged, the client chooses the method and quiz score, and the denominator is the whole organization.
- **The signature does not cover what is in force.** It hashes the register row and an artifact pointer, not SOP text. The effective date is outside the digest and can be backdated or carried over from the prior version, and the linked artifact can be rewritten after approval without a new signature (§11.70).
- **The signature record itself is wrong or invisible.** Retirement is signed with the meaning "APPROVED" (§11.50), and the register never shows the signer, time or meaning — only a toast at signing.
- **The business stake.** F-11 positions QMS for the pilot as a "controlled SOP register with signed approval and training". Each defect above contradicts one of those claims, and the pilot customer's QA lead will test exactly these three things first.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| CAT2-18 | STILL_OPEN | P0 | Degrades | Revise UPDATEs the same row at `mdx-qms.ts:669-683` and `AnaToolExecutor.ts:14322-14332`; no `qms_document_versions` anywhere; `superseded_by_id` never written |
| CAT2-19 | STILL_OPEN | P1 | Degrades | `document-approval-signature.ts:272` `COALESCE($4::date, effective_date, $6::date)`; date excluded from digest at `:128-146`; `approveBody` accepts optional past dates at `mdx-qms.ts:526` |
| CAT2-20 | STILL_OPEN | P1 | Not observable | Digest at `document-approval-signature.ts:128-146` covers `artifactId` only; artifact content rewritten in place at `artifactVersionStore.ts:350-355` |
| CAT2-21 | PARTIALLY_FIXED | P1 | Blocks | acks CTE at `mdx-qms.ts:838-845` has no version filter; training-ack `:757-792` accepts non-effective docs and client `method`/`quizScore`; no client caller |
| CAT2-22 | STILL_OPEN | P2 | Degrades | `quality/data.ts:103` `TODAY='2026-06-04'`; `SopRegister.tsx:378` flags overdue client-side; no review-complete action |
| CAT2-23 | PARTIALLY_FIXED | P2 | Not observable | `document-approval-signature.ts:120` `APPROVABLE_STATES={'in_review'}`; still one signer, no routing |
| CAT2-24 | STILL_OPEN | P2 | Not observable | No "controlled copy", "uncontrolled" or watermark in `server/services/qms`, `mdx-qms.ts` or `client/src/concept2cure/quality` |
| CAT2-25 | STILL_OPEN | P2 | Not observable | `changeControl.service.ts:330` inserts `linked_ref/linked_id` with no FK or validation; hard `DELETE FROM qms_change_links` at `:343` |
| CAT2-26 | STILL_OPEN | P2 | Degrades | 17 `onAsk(...)` write call sites, e.g. `SopRegister.tsx:216,227,450`, `ChangeControl.tsx:162,173,433` |
| P11-03 | PARTIALLY_FIXED | P1 | Degrades | Retire signs `approveBody`'s `'APPROVED'` (`mdx-qms.ts:528`; `SopRegister.tsx:617`); register row `SopRegister.tsx:377-470` shows no signer/time/meaning; PATCH audit after commit, field names only (`mdx-qms.ts:496-506`) |

## Already done at head — do not redo

- **The any-user `/api/qms` training write is gone.** `c6f2028b2` deleted `server/routes/qms.ts` and `server/services/qms/qms.service.ts` and removed the mount in `server/bootstrap/register-document-routes.ts`; `server/routes/__tests__/qms-legacy-api-retired.test.ts` pins it. The canonical QMS writes refuse a viewer (CAT2-21, P11-03 in part).
- **AnA cannot write training records.** `ack_training` is classed `refuse` in `server/services/ana/tool-authorization.register.json:4-13`, and `preHandlerRefusal` returns `NOT_AN_ANA_ACTION` before the handler runs (`AnaToolExecutor.ts:513-516`). It was already refused at `92ccdba1`. The handler at `:14369-14404` is dead code; Stage 1 deletes it (CAT2-21, part).
- **Drafts can no longer be approved.** `cf950eeb9` set `APPROVABLE_STATES` to `{'in_review'}` (`document-approval-signature.ts:120`, refusal at `:238-242`), and the register offers "Send for review" first (`SopRegister.tsx:415-429`). This closes P11-03's draft-to-effective point and the draft half of CAT2-23. Keep the 409 `QMS_INVALID_STATE` test as a regression.
- **No unsigned document can be effective or retired.** `5726976d0` added a deferred DB guard (`migrations/20261001_qms_document_signature_required.sql`, in `C2C_MIGRATION_FILES` at `scripts/db/migration-set.mjs:2975`). It does not preserve the prior version; Stage 2 does.
- **Change-control writes need an editor, and approve/retire check signing authority before the credential.** `f1d2589ff` added `requireEditorAccess` (`mdx-qms.ts:1360,1401,1424,1526,1563,1588`); authority is checked at `mdx-qms.ts:563-600`.
- **AnA `create_qms_document` already has a role check.** The audit's bullet was wrong at `92ccdba1`: it is a `confirm` tool and the central `writeRoleRefusal` gate (`AnaToolExecutor.ts:547-561`) applies the editor role. No work needed.

## Work, in order

Stages 2 and 3 change the same signing function and the same snapshot row. Land them in the same release so the binding basis changes once and no snapshot is written without its artifact and date fields. Stage 2 needs the founder's SOP-body decision (NEW-1) before its migration is written.

### Stage 1 — Native, signed read-and-understood acknowledgment; correct overdue flags (Phase 0 · M · engineering) — closes CAT2-21 in part (acknowledgment integrity, UI, dead AnA path) and CAT2-22 in part (overdue display)

1. Re-confirm CAT2-21 and CAT2-22 at the current head (statuses here are from 94b4f9238).
2. Work on `concept2cure-v2` only: `git pull --ff-only`, merge and never rebase.
3. Write the failing tests first, in a new `server/routes/__tests__/qms-training-ack.test.ts` (pattern: `qms-governed-writes-audited.test.ts`):
   - (a) an acknowledgment on a `draft`, `in_review` or `retired` document returns 409 `QMS_NOT_TRAINABLE` with nothing written;
   - (b) an acknowledgment without `password` returns 400 `ESIGNATURE_COMPONENT_MISSING`;
   - (c) a body carrying `quizScore` or `method` is refused with 422 under zod `.strict()`.
   Add a client test for the register that fixes the clock to a date between June and October 2026 and asserts that a document whose server `overdue` is false is not flagged, and one whose server `overdue` is true is. Run all at the current head and keep the red output.
4. Rewrite `POST /qms/documents/:id/training-ack` (`server/routes/mdx-qms.ts:757-792`):
   - Read `version`, `status` and `doc_type`. Refuse with 409 `QMS_NOT_TRAINABLE` unless the document is `effective` and `doc_type` is in the trainable list (`:854`). Stage 2 switches this check to the in-force snapshot.
   - Make it a signed act by the trainee. Parse `{password, mfaToken?, meaning:'RESPONSIBILITY', reason?}` with `.strict()` and run `reverifySigner`. Do not run `checkSigningAuthority`: any member signs their own training.
   - In one transaction: insert the `qms_training_records` row with `acknowledgment_method` fixed to `'electronic_signature'` and `quiz_score` NULL; call `recordGovernedAction` (command `'sign'`, target `'qms-document:<id>'`); call `persistGovernedActionSignature` (signatureType `'qms-training-acknowledgment'`, binding the document's current content digest from `computeQmsDocumentContentDigest`; Stage 2 changes this to the in-force snapshot's `content_digest`).
   - Add a manifest statement that the signer has read and understood v`<version>`.
5. Client, in `client/src/concept2cure/quality/`:
   - Replace the `onAsk` "Record training" button (`SopRegister.tsx:543-555`) with a native "Acknowledge read and understood" action on each in-force row for the current user. It opens `EsignModal` with meaning responsibility. Add `postQmsTrainingAck` beside `postQmsApproval` in `qmsApproval.ts`.
   - In `SopRegister.tsx:378`, flag overdue from the server's `d.overdue`. Keep `overdue` in `adaptDoc` in `hooks.ts`. Delete `TODAY` from `data.ts:103`; no client code computes review status.
6. Delete the dead AnA path. In the commit message, name the replacement by path — `POST /api/mdx/qms/documents/:id/training-ack` and the `SopRegister.tsx` Acknowledge action — and the gates that prove it reachable: `qms-training-ack.test.ts` and `server/routes/__tests__/routes-reach-the-bundle.test.ts`. Remove:
   - the `ack_training` handler at `AnaToolExecutor.ts:14369-14404`;
   - `ACK_TRAINING` in `server/services/ana/qms-labeling-analytics-tool-defs.ts:50-63` and its export or registration;
   - the register entry in `tool-authorization.register.json:4-13`;
   - the `inScope` entry in `server/services/ana/ana-launch-scope.inventory.json:401`;
   - the `docs/ana-capability-manifest.json` entry (regenerate it).
   Run the registry-parity and ana-launch-scope tests.
7. Go green. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- Tests (a)–(c) and the overdue client test are red at the current head and green after the change.
- An acknowledgment writes one `qms_training_records` row, a chained ledger pair and one `electronic_signatures` row in one transaction; a forced failure in the signature write leaves none of them.
- Draft, in_review and retired documents are refused with nothing written.
- A tester records their own acknowledgment from the Quality register without AnA.
- `grep -rn "ack_training\|ACK_TRAINING" server shared client docs` finds nothing.
- Mutation: removing the status check from training-ack makes test (a) fail; revert.

### Stage 2 — Immutable version store and one transactional revise (Phase 1 · L · engineering, after NEW-1) — closes CAT2-18; closes the version-history and revise-audit points of P11-03

1. Re-confirm CAT2-18 and P11-03 (version history, revise audit) at the current head (statuses here are from 94b4f9238).
2. Record the founder's SOP-body decision (NEW-1) in the commit that adds the migration. The recommendation is the linked Authoring artifact as the system of record for the body, because Authoring is already the launch editor and a second body editor in QMS would break zero duplication. If the founder chooses a body stored on the QMS version instead, add `body` (jsonb or text) and `body_sha256 text NOT NULL` to the table in step 4 and bind `body_sha256` in Stage 3 in place of the artifact fields.
3. Write the failing DB-tier test first: `tests/db/qms-document-versions.dbtest.ts`, following `tests/db/qms-document-signature-required.dbtest.ts`. Create a document as author A, PATCH it to `in_review`, approve as B through `approveQmsDocumentSigned`, then `POST /api/mdx/qms/documents/:id/revise`. Assert:
   - (a) the document still has an in-force version `'1.0'`;
   - (b) that version's `content_digest` equals the `bound_payload_digest` of the v1.0 `electronic_signatures` row;
   - (c) `GET /api/mdx/qms/documents/:id/versions` lists v1.0 as in force, with its approval signature id, and v2.0 as draft;
   - (d) after v2.0 is approved, v1.0 has `superseded_at` and `superseded_by_version_id` set;
   - (e) with the revise audit write forced to fail, the document's version, approver and approval date are unchanged.
   Run it at the current head and keep the red output.
4. Add an additive, replayable migration named for the day it is written (the register proposed `migrations/20261014_qms_document_versions.sql`), with a dated header note (CLAUDE.md Rule 1):
   - `CREATE TABLE IF NOT EXISTS public.qms_document_versions`: `id serial PK`; `organization_id INTEGER NOT NULL REFERENCES organizations(id)`; `document_id integer NOT NULL REFERENCES qms_documents(id)`; `version text NOT NULL`; `doc_number`, `title`, `doc_type`, `category` text; `metadata jsonb NOT NULL`; `next_review_date date`; `artifact_id integer`; `artifact_version integer`; `artifact_content_sha256 text`; `content_digest text NOT NULL`; `binding_basis text NOT NULL`; `approval_signature_id integer NOT NULL REFERENCES electronic_signatures(id)`; `approved_by integer REFERENCES users(id)`; `approved_at timestamptz NOT NULL`; `effective_date date NOT NULL`; `superseded_at timestamptz`; `superseded_by_version_id integer REFERENCES qms_document_versions(id)`; `retired_at timestamptz`; `retirement_signature_id integer`; `created_at timestamptz NOT NULL DEFAULT now()`.
   - `UNIQUE (organization_id, document_id, version)` and an index on `(organization_id, document_id)`.
   - An append-only trigger: `CREATE OR REPLACE FUNCTION`, and create the trigger only when `pg_trigger` lacks it (idiom in `migrations/20260923b_artifact_approval_follows_status.sql`). It refuses DELETE, and refuses any UPDATE that changes a column other than `superseded_at`, `superseded_by_version_id`, `retired_at`, `retirement_signature_id`, or that changes one of those after it is non-null.
   - `ALTER TABLE qms_documents ADD COLUMN IF NOT EXISTS effective_version_id integer REFERENCES qms_document_versions(id)`.
   - Backfill with `INSERT … SELECT … ON CONFLICT DO NOTHING`: one row per `status='effective'` document that has a standing `qms-document-approval` signature whose `signature_manifest->>'version'` equals `d.version`; then set `effective_version_id`. For effective rows with no such signature, `RAISE NOTICE` with a count. Never fabricate a snapshot.
   - No DROP of anything another file creates.
5. Register the file in `C2C_MIGRATION_FILES` in `scripts/db/migration-set.mjs` after the last dated entry (at 94b4f9238, `'migrations/20261012b_regulatory_programs_eu_device_classes.sql'`, ~line 3258) and before `UUID_TENANT_ISOLATION_NONPUBLIC`. The table is public with an INTEGER org key, so `TENANT_ISOLATION_SWEEP` policies it. Run `npm run ci:migration-set-order` and `npm run ci:migration-drop-safety`. Add the new trigger to the expected list in `server/services/audit/audit-immutability-triggers.ts` so the boot gate checks it. Add the drizzle definition beside `qmsDocuments` in `shared/schema.ts` (~line 19668).
6. In `approveQmsDocumentSigned` (`server/services/qms/document-approval-signature.ts:316-391`), on the caller's transaction and after `persistGovernedActionSignature`:
   - insert the snapshot from the `FOR UPDATE` row, with `content_digest`, `binding_basis`, `approval_signature_id = signed.id` and `effective_date`;
   - if `effective_date <= CURRENT_DATE`, update the previous in-force snapshot (`superseded_at IS NULL AND retired_at IS NULL AND id <> new id`) to `superseded_at = now()`, `superseded_by_version_id = new id`, and set `qms_documents.effective_version_id` to the new id;
   - if `effective_date` is in the future, leave the prior snapshot in force until that date (Stage 3, step 8). Resolve the hand-over when read: the in-force version is the latest non-retired snapshot with `effective_date <= CURRENT_DATE`; stamp `superseded_*` on the earlier one at the first read or approval on or after that date, inside a transaction.
7. In `retireQmsDocumentSigned` (`:478-552`), stamp `retired_at` and `retirement_signature_id` on the in-force snapshot.
8. Put revise in one service function, `openQmsRevision(client, {orgId, userId, documentId, reason})`, in `server/services/qms/`. It runs in one transaction (`pool.connect`, `BEGIN`, `setTenantContextTx`), asserts the outgoing version has a snapshot row, updates only the working copy, leaves `effective_version_id` and the snapshot untouched, sets `effective_date = NULL` (CAT2-19), and writes the chained audit row with `recordGovernedAction(client, …)` in that transaction — replacing the after-commit `recordAuditRow` at `mdx-qms.ts:691`. Call it from `mdx-qms.ts:650-698` and `AnaToolExecutor.ts:14298-14351`, and delete the duplicate SQL from both callers.
9. Readers:
   - `GET /qms/documents` (`mdx-qms.ts:340-359`) and `GET /qms/documents/:id` (`:433-446`) return an `effective_version` object joined on `effective_version_id`.
   - Add `GET /qms/documents/:id/versions`, tenant-scoped, registered before `'/qms/documents/:id'`, returning each snapshot with its approval signature.
   - Compliance (`:830-860`), the readiness documents block (`:250-258`), review-due (`:414-431`) and `server/services/audit/compliance-reports/queries/controlled-documents.ts` (Reporting & analytics, in the launch catalog) decide "in force" from the snapshot: `effective_version_id IS NOT NULL`, not retired, `effective_date <= CURRENT_DATE`. None reads `qms_documents.status` for this.
   - Switch the Stage 1 training-ack trainable check and its signature binding to the in-force snapshot.
   - Correct the false comment at `mdx-qms.ts:133-137` ("'superseded' only by the revise route").
10. Client:
    - map `effective_version` in `client/src/concept2cure/quality/hooks.ts`;
    - in `SopRegister.tsx`, a row in revision reads "Effective v1.0 · Draft v2.0 in revision";
    - add a native version-history drawer that reads `/versions`, not an `onAsk` prompt, showing each version's approver printed name, UTC signing time and meaning.
11. Go green. Extend `tests/validation/oq/qms/run.mjs` with a version-history step. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- `tests/db/qms-document-versions.dbtest.ts` cases (a)–(e) are red at the current head and green after the change.
- After revise, `GET /api/mdx/qms/documents/:id` shows the working copy as draft 2.0 and `effective_version.version='1.0'`.
- `GET …/versions` returns the v1.0 snapshot, whose `content_digest` equals the `bound_payload_digest` of the v1.0 approval signature.
- Training compliance, readiness and the controlled-documents report still count the document as in force while v2.0 is drafted.
- Approving v2.0 with today's date sets `superseded_at` and `superseded_by_version_id` on v1.0.
- As `app_service`, an UPDATE of a content column or a DELETE on a snapshot is refused by the trigger, and the boot immutability check lists the trigger.
- `grep` finds one revise implementation, and it writes its audit row inside its transaction.
- Mutation: removing the supersede UPDATE makes case (d) fail; revert.

### Stage 3 — Sign the effective date and the bound content: digest v2 (Phase 1 · M · engineering) — closes CAT2-19, CAT2-20; closes the content-binding point of P11-03

1. Re-confirm CAT2-19, CAT2-20 and the content-binding point of P11-03 at the current head (statuses here are from 94b4f9238).
2. Failing tests first; run all at the current head and keep the red output:
   - (a) In `server/services/qms/__tests__/document-approval-signature.test.ts`, replace the case at `:40-52` (which pins the date's exclusion) with one asserting that the v2 digest changes when the effective date changes.
   - (b) Same file: two rows identical except for the bound artifact content sha256 give different v2 digests.
   - (c) In `server/routes/__tests__/qms-document-approval-signature.test.ts`: approve with no `effectiveDate` → 400 `ESIGNATURE_COMPONENT_MISSING`, nothing written.
   - (d) Same file: an `effectiveDate` before the DB's `CURRENT_DATE` → 422 `QMS_EFFECTIVE_DATE_BACKDATED`, nothing written.
   - (e) Revise sets `effective_date` to NULL.
   - (f) POST or PATCH carrying `effectiveDate` → 422.
   - (g) Approving with an `artifact_id` from another organization, or a missing one → 409 `QMS_ARTIFACT_NOT_FOUND`, nothing signed.
   - (h) A DB-tier test in `tests/db/`: approve with `artifact_id` set, write a new artifact version through `artifactVersionStore`, then assert `GET /api/mdx/qms/documents/:id` reports `artifact_drift=true`, the signature verdict for that document reads "does not cover" the head, and the bound version's content is still served.
3. Effective date at approval:
   - `mdx-qms.ts:526`: make `effectiveDate` required (drop `.optional()`).
   - In the approve route (`:602-644`), before `verifyApprovalSigner` writes anything, run `SELECT $1::date < CURRENT_DATE AS backdated` on `pool`. If backdated, return `clientError` 422 `QMS_EFFECTIVE_DATE_BACKDATED` with the message "An effective date cannot be earlier than today. Nothing was signed." Pass `body.effectiveDate` (now non-null) at `:627`.
   - `document-approval-signature.ts:272`: `effective_date = $4::date`, no COALESCE. Make `ApproveQmsDocumentSignedParams.effectiveDate` a `string` (`:181-182`) and fix its docstring.
4. Content binding, in `approveQmsDocumentSigned` (`:316-327`) and `retireQmsDocumentSigned` (`:478-488`), when `row.artifact_id != null` (or, under the NEW-1 body option, on the stored body):
   - `SELECT id, version, content FROM concept2cure_artifacts WHERE id=$1 AND organization_id=$2 FOR SHARE`. No row: throw `QmsApprovalRefusedError` with new code `'ARTIFACT_NOT_FOUND'`, mapped to 409 in `approvalRefusal` (`mdx-qms.ts:596-600`).
   - Compute sha256 of the content in the server; do not trust the `content_hash` column.
   - Read the `concept2cure_artifact_versions` row for `(artifact_id, version)` and refuse if its content hash differs.
5. One digest change for both findings:
   - Add a v2 recipe to `computeQmsDocumentContentDigest` including `effectiveDate` (the signed parameter), `artifactVersion` and `artifactContentSha256`. Set `QMS_DOCUMENT_BINDING_BASIS` to `'qms-document-version-content-sha256/v2'`.
   - Keep the v1 function exported so stored signatures, selected by `electronic_signatures.binding_basis`, still verify.
   - Record `artifactVersion` and `artifactContentSha256` in `metadata.approval`, in `extraManifest` (`:371`) and in the Stage 2 snapshot.
   - Update the binding note at `:368-370` and `tests/validation/lib/qms-digest.mjs` to recompute both recipes. Have `computeQmsDocumentRetirementDigest` use the stored `effective_date` under v2.
   - Add a verdict helper that recomputes the digest from the snapshot and the bound bytes and returns "does not cover" when the linked head differs.
6. Remove the date and an unchecked artifact pointer from editable input:
   - delete `effectiveDate` from `docCreate` (`mdx-qms.ts:164`), so `docPatch` loses it, and from the PATCH COL map (`:458`); stop writing `effective_date` in the create INSERT (`:368-380`); make both schemas `.strict()`;
   - validate `artifactId` on POST (`:361-399`) and PATCH (`:448-510`) with `SELECT 1 FROM concept2cure_artifacts WHERE id=$1 AND organization_id=$2`; otherwise 422.
7. Revise clears the date in `openQmsRevision` (Stage 2). If Stage 2 has not landed, set `effective_date = NULL` in both `mdx-qms.ts:669-683` and `AnaToolExecutor.ts:14322-14330`.
8. Pending effective, without a scheduler (so `migrations/20261001_qms_document_signature_required.sql` needs no change): a document approved with `effective_date > CURRENT_DATE` is "approved, pending effective". All in-force readers include `effective_date <= CURRENT_DATE` — compliance `mdx-qms.ts:853`, readiness `:252`, review-due `:423` — and the Stage 2 rule keeps the prior version in force until that date.
9. Serve the controlled text of an effective version only from `concept2cure_artifact_versions` at the bound version. `GET /qms/documents/:id` and `/versions` return `artifact_drift` when the head's sha256 differs from the bound sha256. Serving the bound version is the control; do not add a second lock mechanism in QMS. If the founder also wants post-approval edits refused, extend the existing FROZEN/APPROVED write-lock check in the authoring router (`authoring.router.ts` ~423-470) rather than writing a new one.
10. Put the `concept2cure_artifact_versions` append-only trigger on an applier. Its only definition is `db/migrations/20260318_ga_immutability_hardening.sql`, which no applier references. Write a new additive file (`CREATE OR REPLACE FUNCTION`; create the trigger only if `pg_trigger` lacks it), insert it into `C2C_MIGRATION_FILES` before `UUID_TENANT_ISOLATION_NONPUBLIC`, and prove it with a dbtest where an UPDATE of a version row is refused.
11. Client: in `SopRegister.tsx`'s approve `EsignModal` (`:593-609`) add a required date input (default today, min today); `postQmsApproval` (`qmsApproval.ts:29-38`) takes `effectiveDate` and sends it for kind `'document'`; the Effective column (`:411`) shows "—" for draft and in_review rows and "from <date> (pending)" for future dates.
12. Go green. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- Tests (a)–(h) are red at the current head and green after the change.
- No date → 400; a past date → 422; a foreign or missing artifact → 422 on create or PATCH, 409 on approve. In each case no `electronic_signatures` row and no ledger row is written.
- Approving v2.0 with date D stores D. With D in the future, the register shows pending and compliance does not count the new version until D, while v1.0 stays in force.
- The stored `bound_payload_digest` recomputes from the snapshot plus the bound artifact version's bytes. Changing `effective_date` in the database, or one byte of the bound version's content, makes the recompute differ.
- A later AnA edit of the artifact leaves the effective version's served text unchanged and sets `artifact_drift=true`.
- As `app_service`, an UPDATE of a `concept2cure_artifact_versions` row is refused.
- Signatures stored under v1 still verify.
- Mutation: restoring the COALESCE at `:272` makes test (d) or (e) fail; dropping `artifactContentSha256` from the recipe makes test (b) fail; revert each.

### Stage 4 — Version-bound, assigned training compliance (Phase 1 · M · engineering, after NEW-2 and NEW-3) — closes CAT2-21

1. Re-confirm CAT2-21 at the current head (statuses here are from 94b4f9238).
2. Failing tests first, added to `server/routes/__tests__/qms-training-ack.test.ts`:
   - (d) v1.0 acknowledgments exist; revise and approve v2.0 → current = 0 for that document;
   - (e) the denominator equals the assigned users, not `organization_users`;
   - (f) an unassigned document reads "not assigned", never 0/N.
   Red at the current head.
3. Compliance (`mdx-qms.ts:826-860`): count `COUNT(DISTINCT t.user_id) FILTER (WHERE t.document_version = <in-force version> AND (t.expires_at IS NULL OR t.expires_at > NOW()))`, joining acknowledgments on `(document_id, document_version)` against the Stage 2 in-force snapshot (or `d.version` if Stage 2 has not landed). Fix the comments at `:826-829` and in `client/src/concept2cure/quality/hooks.ts:124-126`.
4. Assignment, once the founder has chosen role or curriculum (NEW-2). For the role-or-user model:
   - Add an additive migration with a dated header (proposed `migrations/20261015_qms_training_assignments.sql`): `public.qms_training_assignments` with `id serial`; `organization_id INTEGER NOT NULL REFERENCES organizations(id)`; `document_id integer NOT NULL REFERENCES qms_documents(id)`; `role text`; `user_id integer REFERENCES users(id)`; `CHECK (role IS NOT NULL OR user_id IS NOT NULL)`; `created_by`; `created_at`; `deleted_at`. Register it in `scripts/db/migration-set.mjs` before `UUID_TENANT_ISOLATION_NONPUBLIC`; run `ci:migration-set-order` and `ci:migration-drop-safety`.
   - Add editor-gated `POST` and `DELETE /qms/documents/:id/training-assignments` that write the audit row in the same transaction (soft delete via `deleted_at`).
   - The denominator becomes the distinct users matched by assignment (`organization_users.role` or `user_id`).
5. UI: an assignments control for editors on each document in `SopRegister.tsx`; compliance bars show "x of y assigned" or "not assigned".
6. Apply the founder's rule on training before the effective date (NEW-3) to the Stage 1 trainable check: accept acknowledgments of an approved-pending version, or refuse until D.
7. Go green. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- Tests (d)–(f) are red at the current head and green after the change.
- After v2.0 goes effective, compliance for that document falls to 0 of N assigned.
- Assignment changes are tenant-scoped and audited; a foreign document id is refused.
- MR-11 Stage 6 step 8 can read version-bound compliance from this endpoint.
- Mutation: removing the `document_version` filter makes test (d) fail; revert.

### Stage 5 — Retirement meaning, visible signature block, audited PATCH (Phase 1 · M · engineering, after NEW-4) — closes P11-03

P11-03's draft-to-effective and unsigned-effective points are fixed at head, its version-history and revise-audit points close in Stage 2, and its content-binding point in Stage 3. This stage closes the rest. MR-06 hands the QMS half of P11-04 (after-commit audit on QMS create, PATCH and revise) to this order; do not convert it twice.

1. Re-confirm P11-03 (retirement meaning, signature manifestation, PATCH audit) at the current head (statuses here are from 94b4f9238).
2. Failing tests first; red at the current head:
   - (a) `POST /qms/documents/:id/retire` with meaning `'APPROVED'` returns 400, and the stored `electronic_signatures` row for a retirement carries the retirement meaning;
   - (b) a component test: the register row and detail panel show printed name, UTC signed time and meaning for an effective document;
   - (c) a forced failure of the PATCH audit write leaves the row unchanged, and the audit row carries before and after values, not field names only.
3. Retirement meaning (word chosen under NEW-4):
   - add it to `TASK_SIGNATURE_MEANINGS` (`server/services/part11/signature-meanings.ts:10-15`, which flows into `GOVERNED_SIGN_MEANINGS`) and to `client/src/concept2cure/_shared/esignMeanings.ts`;
   - export `QMS_DOCUMENT_RETIREMENT_MEANING` from `document-approval-signature.ts`; `retireQmsDocumentSigned` stores it (`:498,545`);
   - make `retireBody` (`mdx-qms.ts:528`, today `approveBody.omit(...)` with `z.literal('APPROVED')`) accept only that literal;
   - change `meanings={['approval']}` at `SopRegister.tsx:617` to the retirement meaning.
   Stored retirements keep the meaning they were signed with; do not rewrite them.
4. Signature manifestation (§11.50):
   - extend `GET /qms/documents` (`mdx-qms.ts:340`) and `GET /qms/documents/:id` (`:433`) with a `LEFT JOIN LATERAL` to the standing approval and retirement signature, reusing the STANDING predicate from `server/services/audit/compliance-reports/queries/controlled-documents.ts:24-26` (`signer_name`, `signed_at`, `signature_meaning`, `bound_payload_digest`); once Stage 2 has landed, join through the snapshot's `approval_signature_id`;
   - add "Approved by", "Signed (UTC)" and "Meaning" to the row grid in `SopRegister.tsx:377-470` and a detail panel. The toast in `quality/qmsApproval.ts:40-54` stays as confirmation, not as the record.
   - A printable record of a version with its signature block is delivered by Stage 8's controlled copy; do not build a second renderer here.
5. PATCH audit: move the audit write of `PATCH /qms/documents/:id` (`mdx-qms.ts:448-510`, after-commit at `:496-506`) into the same transaction as the UPDATE through `recordGovernedAction(client, …)`, with before and after values. Apply the same change to the create route (`:361-399`).
6. Go green. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- Tests (a)–(c) are red at the current head and green after the change.
- An inspector viewing the register sees who approved each in-force version, when (UTC) and with what meaning, without opening a report.
- New retirement signatures carry the retirement meaning; `'APPROVED'` is refused on retire.
- A failed QMS create or PATCH audit write rolls the write back.
- Mutation: restoring `approveBody.omit(...)` as `retireBody` makes test (a) fail; revert.

### Stage 6 — Native governed forms for QMS writes (Phase 3 · M · engineering) — closes CAT2-26

1. Re-confirm CAT2-26 at the current head (statuses here are from 94b4f9238).
2. Failing tests first: component tests that create an SOP, open a revision and transition a change control from the Quality UI without calling `onAsk`, each asserting a REST call to `/api/mdx/qms/...` with a non-empty reason. Red at the current head (the actions call `onAsk` at `SopRegister.tsx:216,227,450` and `ChangeControl.tsx:162,173,433`, 17 call sites in all).
3. Add native forms in `client/src/concept2cure/quality/` for create SOP, open revision (calls the route backed by `openQmsRevision`) and change-control transitions. Each captures a reason for change and calls the `mdx-qms` REST endpoints directly. Keep `onAsk` as an optional "ask AnA" helper beside each form, not as the write path.
4. The AnA tools for these writes call the same server services as the routes; no parallel SQL remains.
5. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- The component tests are red at the current head and green after the change.
- A tester can create, revise and transition with AI disabled for the tenant.
- Each write records a reason in the audit trail.

### Stage 7 — Periodic review, signed review step and approver routing (Phase 3 · L · engineering, after NEW-4) — closes CAT2-22, CAT2-23

1. Re-confirm CAT2-22 and CAT2-23 at the current head (statuses here are from 94b4f9238).
2. Failing tests first; red at the current head:
   - a signed "review complete, no change" on an effective document sets `next_review_date` from the document's interval, leaves the version and in-force snapshot unchanged, and writes a signature and ledger pair (today PATCH is refused on effective documents, so the only route is a major revision);
   - with a two-signature route configured, one approval signature does not make the document effective; the second does;
   - the same user cannot sign twice on one route, and the author cannot approve (F-12);
   - if the founder makes review a signed act: approval is refused unless a standing review signature exists for the same version digest.
3. Periodic review:
   - Add `review_interval_months` to `qms_documents` with `ADD COLUMN IF NOT EXISTS` in a new additive migration with a dated header, registered before `UUID_TENANT_ISOLATION_NONPUBLIC`.
   - Add `POST /qms/documents/:id/review-complete` in `mdx-qms.ts`, a signed act on the in-force snapshot. It sets `next_review_date` and records the review in a separate append-only review row, not an UPDATE of a snapshot content column.
   - Review-due (`:414-431`) returns `overdue` computed by the database clock. Reminders reuse the existing notification path; no new scheduler.
4. Signed review step (if NEW-4 makes it one): turn the draft-to-in_review PATCH into `POST /qms/documents/:id/review`, using `verifyApprovalSigner` with meaning `'REVIEWED'` and an `electronic_signatures` row of type `'qms-document-review'` bound to the v2 digest.
5. Approver routing in `server/services/qms/document-approval-signature.ts`:
   - Configurable per document type: required reviewer and approver signatures (N-of-M quorum). Each signature binds the same v2 digest.
   - The move to effective, the snapshot insert and the supersede happen only when the quorum completes, in the transaction of the final signature. The deferred guard in `migrations/20261001_qms_document_signature_required.sql` must accept the final quorum signature; if its condition changes, amend that file in place with a dated header note (Rule 1), and keep any constraint replacement conditional on `pg_get_constraintdef`.
6. UI: a "Review complete" action and a routing panel showing who has signed and who is outstanding.
7. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- The tests are red at the current head and green after the change.
- A reviewed-no-change SOP keeps its version and gets a new `next_review_date`; the register's overdue flag clears from the server value.
- With quorum 2, one signature leaves the document `in_review`; the second makes it effective and supersedes the prior version.
- Mutation: bypassing the quorum check makes the routing test fail; revert.

### Stage 8 — Controlled copies and change-control link integrity (Phase 3 · M · engineering) — closes CAT2-24, CAT2-25

1. Re-confirm CAT2-24 and CAT2-25 at the current head (statuses here are from 94b4f9238).
2. Failing tests first; red at the current head:
   - a gate test that renders an effective document's PDF and fails when the PDF lacks the "CONTROLLED COPY" watermark, the version and the signature block;
   - a print or download writes an audit row naming the user, version and time;
   - removing a change-control link leaves a row with `removed_at`/`removed_by` and an audit row, not a deleted row;
   - linking a `linked_id` that does not exist in the same organization's CAPA or deviation table is refused.
3. Controlled copies: a render service in `server/services/qms/` that produces the PDF of the in-force snapshot (and its bound artifact version from Stage 3) with a CONTROLLED COPY watermark, the printed signature block (name, UTC time, meaning) and an "uncontrolled when printed" footer. Expose it as a tenant-scoped download route that writes the audit row in the same transaction as it serves the file. Reuse the repository's existing PDF renderer; do not add a second one.
4. Change-control links in `server/services/qms/changeControl.service.ts`:
   - At insert (`:330`), validate `linked_id` against the CAPA or deviation table named by `linked_ref`, in the same organization; refuse otherwise. The link is polymorphic, so validation lives in the service, not in a foreign key.
   - Replace the hard `DELETE FROM qms_change_links` (`:343`) with an unlink that sets `removed_at` and `removed_by` and writes an audit row. Add the columns by amending the creating migration in place with `ADD COLUMN IF NOT EXISTS` and a dated header note (Rule 1). Readers filter `removed_at IS NULL`.
5. File red and green output under `docs/evidence/MR-12/<date>/`.

**Acceptance**
- The tests are red at the current head and green after the change.
- Every downloaded copy of an effective SOP carries the watermark, version and signature block, and appears in the audit trail.
- No code path hard-deletes a change-control link.

## Definition of done

- An approved SOP's v1.0 content, approver, approval time, meaning and effective date are retrievable after v2.0 is opened, approved and made effective, and the v1.0 signature digest still recomputes from the stored snapshot and bound content.
- The approval signature covers the effective date and the controlled content; neither can change afterwards without the recompute failing, and the register shows signer, UTC time and meaning for every in-force version.
- A tester completes read-and-understood training from the Quality register with an e-signature, and compliance counts only acknowledgments of the in-force version from assigned users.
- Revise exists once, and every QMS write (create, PATCH, revise, retire, review, unlink, controlled-copy download) writes its audit row inside its own transaction.
- Periodic review, approver routing, controlled copies and change-control unlink are governed, signed or audited actions with no hard delete.
- Every finding in this order is FIXED in the register with its closing commit, and each stage's red-then-green evidence is filed under `docs/evidence/MR-12/`.

## Founder decisions this order needs

- **F-11 — QMS positioning.** The recommended "controlled SOP register with signed approval and training" keeps CAT2-18 at P0 and Stages 2–5 in Phase 1. Only positioning QMS as not the system of record for the pilot would downgrade it.
- **F-12 — signing roles and segregation of duties.** Author ≠ approver and the `approver`/`qa` roles set who may sign in Stages 2, 3, 5 and 7. Training acknowledgment (Stage 1) is signed by the trainee and needs no signing authority.
- **F-13 — second factor for signers.** Sets whether `mfaToken` is required in the Stage 1, 3, 5 and 7 signing ceremonies.
- **NEW-1: system of record for SOP body text** — the linked Authoring artifact (recommended) or a body stored on the QMS version. Blocks Stage 2 step 4 and Stage 3 step 4; it also decides what Stage 8 renders.
- **NEW-2: training assignment model** — role-based or curriculum-based. Blocks Stage 4 step 4.
- **NEW-3: training before the effective date** — may a user acknowledge an approved-pending version before D? Blocks Stage 4 step 6.
- **NEW-4: signature meanings and review routing** — the word for retirement (blocks Stage 5 step 3), whether "send for review" is a signed `REVIEWED` act, and the default reviewer and approver quorum per document type (block Stage 7).

## Do not

- Do not append a DROP for `superseded_by_id`, the old `effective_date` handling or any other schema another file creates. Amend the creating migration in place with a dated header note, or leave the column unused (Rule 1).
- Do not keep a second revise path or build a second version table. `openQmsRevision` is the only revise implementation and `qms_document_versions` the only version store; MR-06 relies on both (DATA-16).
- Do not fix effective dates, overdue flags, signature display or training percentages in the client only. "In force", "overdue", compliance and the signature block are computed on the server from the snapshot and the database clock.
- Do not invent a snapshot in the backfill for an effective document with no matching approval signature, and do not rewrite the meaning on retirements already signed. Report the count and leave them for a governed re-approval.
- Do not drop the v1 digest recipe when adding v2. Stored signatures must still verify under the basis they were signed with.
- Do not delete the AnA `ack_training` path, or any QMS `onAsk` action, without naming its replacement by path and the test that proves it reachable in the commit message.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-12/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
