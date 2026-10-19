# Part 11 lens: landing e1f3fd425, 39-file scope, read at HEAD 9795a1e1e (2026-10-19)

**Limits.** I had Read, Grep and Glob only, with no shell. I could not run `git show e1f3fd425 -- <file>` and read no hunks. Every line number is the file at HEAD.

- **Attribution is inferred.** "Introduced by" rests on the landing README, the 2026-10-13/18 evidence, migration dates, the landing file list, and `/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/df678b90-6e5c-570f-95c8-b0431c63411d/scratchpad/scope-numstat.txt`. The last table gives the command that settles each one.
- **Nothing was executed.** I ran no tests, gates or builds.
- **Labels.** CONFIRMED means I traced it at HEAD from entry point to write with no guard found. PLAUSIBLE means it depends on something I could not read or run.
- **Paths.** Evidence paths are under `/home/user/ClinicalSageAI-2-replit/`. Repeat references use the file's basename.

**Net effect of the landing.**
- QMS content is now bound to its Authoring copy and guarded by DB triggers. Signed versions are immutable. QMS document writes are in-transaction, and AS2 receipts are cryptographically verified.
- The 2026-10-05 independence fix on freeze/dispatch/transmit is intact (`submission-service.ts:937-951`).
- No file in the 39 adds a signing site that takes the session's word.
- It left the four-eyes rule behind (L-1), left change control unguarded (L-2), and left two unlineaged writers (L-3).

## Findings, most severe first

### L-1. QMS approval's four-eyes rule ignores everyone who wrote the text in the Authoring workbench
**High · control unenforced on the new path · CONFIRMED · introduced with the bound-document model (landing-era, hunk not read)**

- **Where.**
  - `server/services/qms/document-approval-signature.ts:289-302` — the author test is `row.author_id` plus `metadata.controlledTextAuthorship`.
  - Same file, `:377` (`twoPersonRule`), `:385-404` (ledger payload), `:428` (manifest).
  - `author_id` is set only to the creator (`controlled-document-service.ts:97-101`) or the reviser (`:219-221`).
  - The only writer of `controlledTextAuthorship` is `training-controlled-text.ts:27`, and it refuses bound documents (`:47`).
  - The canonical resolver for this, `authoringDocumentAuthors` (`separation-of-duties.ts:254-300`), is used only by `peer-review.ts:124` and `workflow-import-governance.ts:164`.
- **Failure.**
  1. M (role `member`) creates SOP-001, so `author_id` is M.
  2. C (org `admin`, hence `isGlobalAuthoringAdmin`, so edit and approve on every document) rewrites the sections in the workbench.
  3. C signs `POST /api/mdx/qms/documents/:id/approve` with password and TOTP.
  4. `author_id` is not C and `controlledTextAuthorship` is absent, so there is no `SELF_APPROVAL`. The document goes effective under a signature over text C wrote.
  5. The signed record states `twoPersonRule: 'enforced'` with `controlledTextAuthorUserIds: []`.
- **Variants.**
  - No admin is needed if M grants C AUTHOR and APPROVER.
  - `bind` (`controlled-document-service.ts:110-133`) makes the binder OWNER of a new editing copy while `author_id` stays the original author.
  - A revision sets `author_id` to the reviser, so v1's author can approve v2 text copied unchanged from v1.
- **Test gap.** `controlled-document-lifecycle.pglite.test.ts:105-117` approves as an admin over text edited by raw SQL with no actor. There is no co-author case.
- **Fix.** For rows with an `authoring_document_id`, also call `assertSignerIsNotAuthor('authoring-document:<id>', org, signer, {meaning:'approval', client})`. Union the copies in `metadata.retainedAuthoringDocuments`, map errors with `separationOfDutiesRefusal` (`separation-of-duties.ts:542-571`), and derive `twoPersonRule` from the result.

### L-2. A change-control approval signature does not survive an edit, and nothing stops the edit
**High · control absent after signing · CONFIRMED · earlier than the landing (inferred)**

- **Where.**
  - `server/services/qms/changeControl.service.ts:193-223` (`updateChange`) and `:287-294` (`deleteChange`) have no status predicate.
  - The routes are `server/routes/mdx-qms.ts:1341-1361` and `:1476-1495`.
  - The digest covers classification, risk, impact assessment, implementation plan, target date and the document pointer (`change-approval-signature.ts:78-100`). It is computed only at `:166`. Nothing recomputes it later and there is no table trigger.
- **Failure.**
  1. CC-1 is approved with `classification: 'critical'`.
  2. Any editor sends `PATCH /api/mdx/qms/changes/1 {classification:'minor', impactAssessment:'…'}`. It returns 200, and `status` stays `approved`.
  3. `metadata.approval` and the `qms-change-approval` signature still read as approval of the earlier text.
  4. The only trace is `mdx.qms.change.update` (`mdx-qms.ts:1354-1358`). It is written after commit, with no details, no reason and no prior value.
  5. `DELETE` soft-deletes an approved or closed change with no reason (`:1488-1492`).
- **Layer.** Server only. The client never calls `PATCH` or `DELETE` on changes (`qmsWrites.ts:12,39,48,61` are POSTs). The UI offers no such control; the API accepts it.
- **Attribution.** The routes existed at 94b4f9238 (MR-06 / `hi-1.json` cites `requireEditorAccess` on them). The landing's `changeControl.pglite` test passes a `client` argument, so I read the service change as the request-client parameter.
- **Fix.** Refuse with 409 unless status is `proposed` or `under_assessment`. Require a governed reason. Write a chained row in-transaction with before and after values. Add a "does not cover" verdict wherever the approval is displayed.

### L-3. Two content writers through `authoring-documents.ts` record no lineage
**Medium · control absent on two writers · CONFIRMED · QMS-revise copy is landing-era; org-template seeding is undetermined**

See the content-integrity section below for the full answer.

### L-4. Gateway receipt evidence is mislabelled and overwritten
**Medium · server, UI mostly masks it · CONFIRMED · landing (`fda-esg-receipts.ts` is new, 132/0; `fda-esg.ts` is 103/40)**

- **(a) Unverified bytes served as an agency acknowledgement.**
  - `fda-esg.ts:803` stores `as2Receipt` for any HTTP response, with `verified:false` unless the outcome is RECEIVED (`:510-514`).
  - `downloadAcknowledgment` (`:885-893`) returns it as `provenance:'agency'` without reading `verified`.
  - The route sets `X-Ack-Provenance: agency` and the filename `agency-acknowledgement-…` (`mdx-submission-gateway.ts:439-449`).
  - Failing state: the synchronous reply is a proxy 502 page, or an unsigned or unmatched MDN. The transmittal is `in_transit` and `ack_received_at` is null.
  - `GatewayTransmittals.tsx:481` disables the ACK button in that state. A direct GET still returns a file named as an agency acknowledgement. This is the defect `acknowledgement.ts` was written to prevent.
- **(b) The receipt upload overwrites earlier evidence** (`fda-esg-receipts.ts:80-92`).
  - `mdn_raw` and `metadata.as2Receipt` are replaced by the upload.
  - `as2ReceiptHistory` starts empty (`fda-esg.ts:365`) and holds only uploads, so the earlier synchronous response is gone.
  - `ack_received_at` and `receivedAt` are the upload time (`observedAt`), served as the receipt time.
  - The reason is a fixed string at `:90`. That is acceptable for a verified MDN, so I noted it rather than raising it.
- **Fix.** Serve receipts with `verified !== true` as an unverified-response record. Append the prior receipt to history before replacing it. Label the stored time "recorded at" or parse the MDN's own time.

### L-5. Study-design hard delete is weaker than the write it mirrors
**Low–Medium · CONFIRMED · likely landing (`study-design.ts` is +7/−1, consistent with adding the persist check; not read)**

- `POST /persist` (`server/routes/study-design.ts:512-561`) runs `requireProtocolProgramWriteTx`. That check allows only the program lead or an org manager (`governed-program-write.ts:13-38`).
- `DELETE /:studyId` (`study-design.ts:621-653`) runs `requireEditorAccess` only.
- `deleteStudyDesignTx` (`study-design-repository.ts:430-438`) filters on tenant only, and the ledger row has no payload (`study-design.ts:636-644`).
- Failure: a plain `member` who cannot write program P's records hard-deletes P's design.
  - Protocols bound through the soft link `protocol_documents.study_design_id` lose it.
  - The only record is "deleted study-design:ID" plus a reason.
- `persist` also overwrites in place. Its payload holds title, phase and risk only (`study-design.ts:542`), with no digest or prior values.
- **Fix.** Apply the same program check on delete. Put the design digest and prior metadata in the ledger.

### Lower priority

- **L-6 · The approver-chosen effective date is outside the signature and the ledger, and can be back-dated.** CONFIRMED, earlier.
  - `mdx-qms.ts:523` takes only a date regex. `document-approval-signature.ts:318` stores it with COALESCE, and `:385-404,428` omit it from the payload and manifest.
  - Signing on 2026-10-19 with `effectiveDate` 2026-01-01 records an effective SOP from before its approval. The date is recorded nowhere audit-visible.
- **L-7 · IND "filed" means a draft sequence was created.** CONFIRMED, advisory.
  - `filing.routes.ts:244-253, 338-347, 391-397` call `mark*Filed` right after `createSequence`. These functions set `status` and `filedAt` unconditionally (`ind-annual-report-persistence.ts:132-152`, `ind-amendment-persistence.ts:101-121`).
  - The overdue feeds skip `filed` (`ind-annual-report-persistence.ts:176`).
  - Amendment filing builds its plan from the request body (`filing.routes.ts:380`), not the draft's stored plan. Only submission and IND number are compared (`:376-378`).
  - The annual-report and amendment routes are on the launch IND screen (`launch-scope-api-gate.test.ts:516-525`).
- **L-8 · Orchestrator `sign-release` has no independence rule.** PLAUSIBLE, low, earlier.
  - `submission-sign-release.ts:147-256` has no `assertSignerIsNotAuthor`. The meaning is fixed to approval at `:130`.
  - The run initiator can self-sign the release that satisfies the release gate.
  - Dispatch still needs a separate non-creator signature (`submission-service.ts:937-951`). I did not read `resolveReleaseSignatureStatus`.
  - `governed-signed-act.ts:52-55` documents the same omission for its acts. Agency-response approval has its own author rule (`response-service.ts:478`).
- **L-9 · ICSR transmit has no human gate.** Latent, outside the launch catalog.
  - `registers.routes.ts:519-524` calls `transmitIcsrTransmission` with `requireRole(AUTHOR)` only: no re-authentication, reason or signature.
  - The attempt audit row is written after the send (`icsr-gateway-transport.ts:530-534`). The landing made this a real AS2 CMS path.
  - Production returns 403 `LAUNCH_SCOPE` because pharmacovigilance claims the prefix (`ui-surface-registry.ui-v2.ts:1218-1222`; pinned by `launch-scope-api-gate.test.ts:484-496`).
  - It becomes a blocker if that claim is lifted.
- **L-10 · Two small items.**
  - `POST /docs/:docId/apply-template` (`authoring.router.ts:6298-6468`) overwrites section text with no reason and no `authoring_audit_trail` row. It is API-only, with no client caller. A hash-chained revision does record who, what and when.
  - The new `qms_signed_version_immutable` trigger (`20261014_qms_controlled_authoring_content.sql:52-55`) is not in the boot-gate trigger list or the app-role append-only ceiling (no grep hit in `server/services/audit/*.ts` or `scripts/db/*.mjs`). A disabled trigger would go unnoticed.

### Outside the 39 (adjacent, PLAUSIBLE)

The CMC signing sites `server/api/cmc/specificationRoutes.ts:389-484` (read), `batchRecordRoutes.ts:587` and `routes.ts:1179` (not read) check authority and re-authenticate. They accept any `SIGNATURE_MEANINGS` value (`governance.ts:43-55`). No author rule appears by grep, and the specification signature binds `digest: null` (`specificationRoutes.ts:482`). CMC is in the launch catalog, so this is the same shape as the 2026-10-05 bypass.

## Content integrity: ci:lineage-save-gate (not re-reporting the red)

- **Why it is red.** The gate wants `replaceAuthorSpans` plus `assertLineageCoversContent`, or `enforceAuthorLineage(client,…)`, inside `authoring-documents.ts` (`check-lineage-save-gate.mjs:401-433`; GUARDED entry `:171-174`).
  - That call now lives in `authoring-section-seed.ts:23-29` and runs only when a seed carries `lineage`.
  - The interactive save paths are fine. `PATCH /sections/:id` is `authoring.router.ts:2296`, revert `:2646`, AI accept `:4272`, apply-template `:6417`/`:6443`.
  - Also fine: `createSection` (`authoring-documents.ts:669-673`), assembly (`authoring-assembly.ts:127`) and from-draft (`authoring-from-draft.ts:390-395`).
- **Writers that pass content with no lineage.**
  1. `POST /api/authoring/docs` from an organization template copies stored prose (`authoring-template-sections.ts:93-101`) with no `lineage` (`authoring-documents.ts:518-525`). Built-in templates seed `''` (`builtin-authoring-templates.ts:67`) and are unaffected.
  2. `POST /api/mdx/qms/documents/:id/revise` on a bound document copies the whole sealed text through `insertDocumentTx` (`controlled-document-service.ts:191-193`) with no `lineage` and no contributors.
- **Reachable by a user.** Yes, both, on launch surfaces. `/api/mdx/qms` is the quality surface's prefix (`ui-surface-registry.ui-v2.ts:705`). Editor role is enough, plus view on the document for revise.
- **What it means for the record.**
  - The text is not unrecorded. Each section gets a hash-chained genesis revision attributed to the creator or reviser, and a CREATE audit row with the full text. For QMS it also carries `copiedFromQmsVersion`, `sourceDocumentId` and `sourceSectionId`.
  - What is missing is `document_span_lineage`: per clause, who asserted it and whether a machine drafted it.
  - For a QMS revision, v1's machine-draft and accepted-draft marks are dropped. Spans are keyed by section id, and the new ids have none (`lineage-gate.ts:176`).
  - On the first human save, the gate records every clause, copied and new, as the saver's own (`lineage-gate.ts:196-198`). Machine or other-author text becomes "asserted by the reviser".
  - QMS approval does not check lineage coverage, so v2 can be approved with none ever recorded. L-1 means the approver check cannot compensate.
- **Fix.** Pass `lineage:{machineDraft:null}` for template seeds. For the QMS copy, carry the source spans or refuse approval until coverage passes. Then move the primitive back, or point GUARDED at the seed helper.

## Known items re-confirmed at HEAD (not re-argued)

- **CAT1-07 (MR-06 stage 1) still open.** `authoring.router.ts` freeze `:5212` (signer picks AUTHOR or REVIEWER, `:4959`), e-sign `:5489` and sign `:7578` call no independence check. The only authoring caller of the resolver is the workflow-import path.
- **P11-03(3).** Retire is signed with meaning `APPROVED` (`mdx-qms.ts:531`).
- **P11-03(4), §11.50 display gap (UI).**
  - The new history dialog (`client/src/concept2cure/quality/ControlledDocumentHistory.tsx:28-30`) shows a date only.
  - The server's `GET /qms/documents/:id/versions` (`mdx-qms.ts:401-417`) returns ids and no signer name.
  - The system records signer, time and meaning (`metadata.approval`, `electronic_signatures`); the screen does not show them.
- **P11-04 remainder.** After-commit, non-fatal audit rows, reported in `meta.auditTrail`, remain on suppliers, internal audits, management review ("signoff" is an unsigned INSERT, `mdx-qms.ts:1088-1093`), NC disposition and change writes.
  - Supplier, audit, NC and change-patch writes take no reason.
  - The landing moved document create, bind, PATCH and revise into one transaction with the chained ledger.
- **P11-15.** The approve reason floor is 3 (`mdx-qms.ts:522`).

## What held

- **Re-authentication at every signing site, authority first.**
  - `submission-sign-release.ts:166,250`, `governed-signed-act.ts:206,216`, `governed-signature-ceremony.ts:238,243`.
  - `mdx-qms.ts:564,581` for approve, retire and change-approve; Authoring via `reverifyAuthoringSigner` (`authoring.router.ts:802-816`).
  - Production requires an enrolled authenticator (`reverify-signer.ts:84-87`).
- **Audit-write search.** No `void auditService…` and no empty catch around an audit write in the 39. The only discarded write is the credential-row insert at `fda-esg.ts:200`, which is logged.
- **§11.70 for QMS content.** DB guards block edits after review or approval. `readCurrentQmsReleaseApproval` recomputes the digest and returns "changed" (`current-release-approval.ts:80`). Training acknowledgements bind the digest and signature id.
- **Reopen semantics.** Revise clears approver, date and `metadata.approval` (`controlled-document-service.ts:218-221`) and retains the signed snapshot.
- **Receipt verification.** Pinned certificate, `-nointern`, and message-id plus MIC tie (`as2-cms.ts:82-95,138-144`).

## Attribution checks to run

| Finding | Command and what to look for |
|---|---|
| L-1 | `git show e1f3fd425 --stat -- server/services/qms/controlled-document-service.ts server/services/qms/controlled-document-content.ts db/migrations/20261014_qms_controlled_authoring_content.sql`. An `A` means the landing added the model. |
| L-2 | `git show e1f3fd425 -- server/services/qms/changeControl.service.ts`. Expect only the `client` parameter. |
| L-3 | `git show e1f3fd425 -- server/services/authoring/authoring-documents.ts scripts/ci/check-lineage-save-gate.mjs`. Look for removed `enforceAuthorLineage` calls. |
| L-4 | `git show e1f3fd425 -- server/services/submission-gateways/fda-esg.ts` for `as2ReceiptMetadata` and `downloadAcknowledgment`. |
| L-5 | `git show e1f3fd425 -- server/routes/study-design.ts`. |

## Coverage

**Read in full at HEAD (37 of 39).**
- Routes: `governed-signed-act.ts`, `mdx-qms.ts`, `study-design.ts`, `submission-sign-release.ts`.
- Authoring: `authoring-create-outcome.ts`, `authoring-documents.ts`, `authoring-draft-sources.ts`, `authoring-draft-tool.ts`, `authoring-from-draft.ts`, `authoring-source-import.ts`, `import-source-references.ts`, `ivd-workflow-source.ts`, `section-generation-service.ts`, `workflow-import-governance.ts`, `workflow-source-import.ts`.
- IND and Part 11: `icsr-gateway-transport.ts`, the four `ind-*-persistence/snapshot` services, `governed-signature-ceremony.ts`, `reverify-signer-deps.ts`.
- QMS: `changeControl.service.ts`, `controlled-document-content.ts`, `controlled-document-service.ts`, `current-release-approval.ts`, `document-approval-signature.ts`, `training.ts`, `training-content.ts`, `training-controlled-text.ts`.
- Gateways: `acknowledgement.ts`, `as2-cms.ts`, `fda-esg.ts`, `fda-esg-receipts.ts`, `index.ts`, `transport-refusals.ts`, `types.ts`.

**Skimmed (2 of 39).**
- `server/routes/authoring.router.ts` (8,820 lines). Read at 150-490, 802-816, 905-1010, 1474-1813, 1972-2511, 2571-2860, 4880-5760, 5950-6149, 6298-6760, 6917-7160, 7380-7860 and 8782-8820, plus grep over the whole file.
- `as2-transport.ts`. Symbols and header comments by grep only; the body (HTTP post, MIME and MDN parser) was not read.

**Not opened.**
- `authoring.router.ts` at 1010-1470, 1813-1971, 2860-4880 (comments, citations, reviews, AI draft/accept/deficiency scan), 5760-5950, 6150-6298, 6760-6917 (export), 7160-7380 (workflow), 7860-8780 (audit export, tracked-change decisions, reorder, images).
- Client files: `ControlledDocumentHistory.tsx` read in full; the rest only by grep (`GatewayTransmittals.tsx`, `SopRegister.tsx`, `ChangeControl.tsx`, `qmsWrites.ts`).

**Outside the 39, opened to trace.**
- Part 11 and SoD: `separation-of-duties.ts`, `reverify-signer.ts`, `signature-meanings.ts`, `governed-target-binders.ts`.
- QMS: `change-approval-signature.ts`, `controlled-text-authorship.ts`, `current-signing-admission.ts`, `governed-qms-write.ts`.
- Authoring: `authoring-section-seed.ts`, `lineage-gate.ts`, `authoring-permissions.ts`, `authoring-template-sections.ts`, `authoring-assembly.ts`, `authoringObjectAuthorization.ts`.
- Gateways, IND and orchestrator: `mdx-as2-receipt.ts`, `filing.routes.ts`, `ind-icsr-transmission-persistence.ts`, `submission-orchestrator-continuation.ts`, `submission-service.ts:855-985,1860-1925`.
- Study design and CMC: `study-design-repository.ts`, `governed-program-write.ts`, `AnaToolExecutor.ts:14540-14800`, `specificationRoutes.ts:380-520`, and `20261014_qms_controlled_authoring_content.sql`.
- Gate and registry: `check-lineage-save-gate.mjs`, `sign-ceremony-baseline.json`, `launch-scope.ts` and the surface registry.

No hunks were read for any file.
