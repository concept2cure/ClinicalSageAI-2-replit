# D5: the three Part 11 audit dimensions that had never run (2026-10-18), and their fix plans

Run on 2026-10-18 at `7a45bfb1e` (session `01P6GWSv`): one read-only finder per dimension (binding and meaning, append-only, separation of duties); every finding put to two independent refuters; then a second pass verified the 13 findings beyond the first pass's cap and planned a fix for each confirmed one (canonical module, the red test, the collateral, the 24-hour ownership, any product decision). The full record is `findings-and-plans.json`.

**Re-checked at `7be209e9c9` (2026-11-01): none of the open fixes below has landed** (`EXPECTED_AUDIT_IMMUTABILITY_TRIGGERS` names none of the four triggers; the artifact act has no separation-of-duties check).

## Fixed

- Freeze, dispatch and transmit take a release meaning; a "review" is not the release: `747a7210a`, `docs/evidence/D5/2026-10-19-release-acts-take-a-release-meaning/`.

## Open, in the planner's order (handed on; the full plan of each is in the JSON)

The 24-hour holds below were computed on 2026-10-19 and have all expired. Re-check ownership against `.design/claude-convergence/COORDINATION.md` before taking one. Under RULE 5 each needs an open package (`L1` for launch row D5) and a `Completes:` path.

2. **Signed QMS controlled-document versions (qms_document_versions) depend on one trigger that boot, health and the sweep never check (phase 1: boot/health/sweep registry) / device_audit_trail is excluded from the boot-required list for a reason that is false (phase 1: registry) / The orchestrator step-event ledger relies on trg_orchestrator_steps_immutable, which nothing checks (phase 1: registry + policy) / vault.document_archives append-only triggers are not in the expected list (phase 1: registry)**  
   Files: `server/services/audit/audit-immutability-triggers.ts`, `server/services/audit/__tests__/audit-immutability-triggers.test.ts`, `server/services/audit/__tests__/audit-immutability-triggers.pglite.test.ts`, `server/db/__tests__/provision-app-role-append-only.test.ts`, `docs/compliance/part11-immutability-record-class-policy.md`  
   Red test: In audit-immutability-triggers.pglite.test.ts, add four cases. For each, DISABLE the trigger and expect report.ok to be false and report.disabled to name exactly that trigger:
- qms_signed_version_immutable
- trg_device_audit_trail_immutable
- trg_orchestrator_steps_immutable (also DROP it and expect it in missing)
- vault_document_archives_delete_guard

All four fail at HEAD, where ok is true and disabled is [].

In audit-immutability-triggers.test.ts, the arrayContaining additions also fail at HEAD. Show each case red with its registry entry removed.

3. **AnA governed-action e-signature accepts the meaning 'authorship' on acts where the signer did not author the target**  
   Files: `server/services/ana-ri/part11-governance.ts`, `server/routes/ana-ri/governed-esignature.ts`, `server/routes/ana-ri/utility.ts`, `server/routes/ana-ri/__tests__/governedActionConfirmTier.test.ts`, `server/services/ana-ri/__tests__/part11-governance.test.ts`  
   Red test: In governedActionConfirmTier, add an it.each over place_in_dossier, revert_to_version, erase_personal_data and k510_workflow.transmit, each posting AUTHOR. Expect 400 MEANING_NOT_ALLOWED, with reverify not called, executed empty and audits empty. At HEAD each returns 200. Add a paired green case: create_submission_package with AUTHOR returns 200 'authorship'. Add a unit test for authorshipIsTrueOfSigner.

4. **The tagArtifact UPDATE branches rewrite content but leave content_hash at the old value (signed revert_to_version path and section branch)**  
   Files: `server/services/artifact-tagger.ts`, `server/services/ana-ri/__tests__/ana-governed-command-signature.pglite.integration.test.ts`, `server/services/__tests__/artifact-tagger-finalized.pglite.test.ts`  
   Red test: ana-governed-command-signature.pglite: after revert_to_version, art.content_hash must equal sha(V1); after a section write, it must equal the sha of the new text. At HEAD both stay sha(V3). artifact-tagger-finalized.pglite: the section-draft update must give content_hash = sha256('AnA draft text'); at HEAD it stays 'sha'.

5. **The DOCX-with-ledger export should state, for each signature, which version it covers and whether that version is the exported text, and check the printed content hash against the body**  
   Files: `server/services/export/docx-ledger-export.ts`, `server/services/export/docx-ledger-collector.ts`, `server/services/export/docx-ledger-xml.ts`, `tests/gates/unverified-verdicts/docx-ledger.gate.test.ts`  
   Red test: In docx-ledger.gate.test.ts, add cases A-E:
- A, stale v3 approval on the v5 body: expect 'Covers: version 3', 'DOES NOT COVER', coversRenderedContent="false".
- B, covering signature: expect 'covers the content of this document' and coversRenderedContent="true".
- C, unresolved version: expect 'not checked' and no coversRenderedContent attribute.
- D, stored-hash mismatch: expect 'DOES NOT MATCH'.
- E, body version gone mid-export: expect rejection with VerificationUnavailableError.

All five fail at HEAD.

6. **The submission-chat rewrite signature stores free text as its §11.50 meaning**  
   Files: `server/routes/ana-features.ts`, `server/services/ana/submission-chat-apply-rewrite.ts`, `tests/routes/ana-apply-rewrite-signature.test.ts`  
   Red test: In ana-apply-rewrite-signature.test.ts:
- meaning 'ok ok ok' must give 400 SIGNATURE_MEANING_UNKNOWN, with no compare and no apply. At HEAD it returns 200.
- meaning 'authorship' must give 400 MEANING_NOT_ALLOWED. At HEAD it returns 200.
- meaning 'review' must give 200 and be passed through. This is the guard against over-tightening.

7. **render_signature_manifestation must print the record the signature is bound to (title, version, content hash) and refuse a model-supplied record_title that differs**  
   Files: `server/services/ana/AnaToolExecutor.ts`, `server/services/compliance/signature-manifestation.ts`, `server/services/ana/evidence-literature-tool-defs.ts`, `server/services/compliance/__tests__/signature-manifestation.test.ts`, `server/services/ana/__tests__/render-signature-manifestation-binding.test.ts (new)`  
   Red test: signature-manifestation.test.ts: the block must print the version and the full hash; at HEAD it does not. The new handler test has three cases:
- mismatched record_title gives ok:false record_title_mismatch;
- with no title, the bound title, version and hash are printed;
- the tenant params are ['sig_X', 7].

The first two fail at HEAD.

8. **Artifact approve/lock (status route and AnA update_artifact_status) never apply the canonical separation-of-duties check**  
   Files: `server/services/governance/separation-of-duties.ts`, `server/services/artifact-signed-act.ts`, `server/routes/c2c/artifacts.ts`, `server/services/ana-ri/ana-signed-artifact-act.ts`, `server/routes/c2c/__tests__/artifact-approval-ceremony.pglite.integration.test.ts`, `server/services/ana-ri/__tests__/ana-signed-artifact-act.pglite.integration.test.ts`, `tests/artifact-status-lock-covers-approval.test.ts`, `server/services/__tests__/fixtures/artifact-signed-target-harness.cjs` …  
   Red test: In artifact-approval-ceremony.pglite, the route-level cases are:
- (a) the author self-approves: expect 403 SEPARATION_OF_DUTIES and nothing written;
- (b) a co-author approves: expect 403;
- (c) the author self-locks: expect 403;
- (d) a NULL author: expect 409 AUTHOR_UNRESOLVED;
- (e) an independent signer: expect 200.

(a)-(d) return 200 at HEAD.

Also mirror (a) and (c) through AnA in ana-signed-artifact-act.pglite, and add a harness case with createdById 777 to artifact-signed-target-cases.json.

9. **CMC governed signatures stop defaulting an omitted §11.50(a)(3) meaning to 'approval'**  
   Files: `server/api/cmc/governance.ts`, `server/api/cmc/__tests__/cmc-sign-signature-row.test.ts`, `server/api/cmc/__tests__/module3SectionApproveSignature.test.ts`, `client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts (optional)`  
   Red test: cmc-sign-signature-row: for each spec/register case, a request with no meaning must give 400, with no BEGIN, signature or ledger writes and no reauth. At HEAD it returns 200 and writes meaning 'approval'. module3SectionApproveSignature: a request with no meaning must give 400 INVALID_SIGNATURE_MEANING with no reauth and no query.

10. **CMC signed-register and batch PUTs: the "signed record is closed to edits" check is not atomic**  
   Files: `server/services/cmc/signed-record.ts`, `server/api/cmc/routes.ts`, `server/api/cmc/batchRecordRoutes.ts`, `tests/schema-contract/cmc-batch-record-tenant-scope.contract.test.ts`, `tests/schema-contract/cmc-signed-register-edit-race.contract.test.ts (new)`, `server/services/cmc/__tests__/signed-record.test.ts`  
   Red test: Batch contract: an afterQuery seam releases the batch between the SELECT and the UPDATE. The PUT must give 409 SIGNED_RECORD with product_name unchanged; at HEAD it returns 200 and overwrites. The new register race contract runs container-closures, manufacturing-processes and comparability-studies, each flipped to its signed value after the reselect. Each must give 409 with content unchanged; at HEAD each returns 200.

11. **Authoring /sign: write the 'approved' snapshot before the approving signature and record the signature as covering it**  
   Files: `server/routes/authoring.router.ts`, `server/routes/__tests__/authoringApprovalSealBinding.test.ts`, `server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts`, `server/routes/__tests__/authoring-atomic-mutations.test.ts`, `server/routes/__tests__/authoringApprovalNoWorkflow.test.ts`, `scripts/ci/sign-ceremony-baseline.json (optional reason text only)`  
   Red test: In authoringApprovalSealBinding, /sign clears the last workflow step. The signature INSERT must carry params[9]==='approved' and params[10] equal to the snapshot hash, the digest must be recomputable, and the frozen INSERT must come before the signature INSERT. At HEAD params[9] and params[10] are null and the order is reversed.

12. **Authoring signatures are committed with no printed name when the name lookup fails (/freeze, /e-sign, /sign)**  
   Files: `server/routes/authoring.router.ts`, `server/routes/__tests__/authoringSignerPrintedName.test.ts`, `server/routes/__tests__/authoring-sign-ceremony.test.ts`, `server/routes/__tests__/authoringApprovalSealBinding.test.ts`, `server/routes/__tests__/authoring-atomic-mutations.test.ts`, `server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts`, `server/routes/__tests__/authoringApprovalNoWorkflow.test.ts`, `server/routes/__tests__/authoring-governed-delete-signed-freeze.test.ts` …  
   Red test: In authoring-sign-ceremony, a users lookup that throws must give 503 SIGNER_IDENTITY_UNVERIFIED on e-sign, sign and freeze. No authoring_signatures or frozen_documents INSERT may be written, and freeze's reverify must not run. At HEAD all three return 200 with signer_name null. A control case checks that name===email still gives 200 with signer_name null.

13. **Authoring approval (e-sign as APPROVER, and the /sign that clears the last workflow step) does not check that the signer is independent of the author**  
   Files: `server/routes/authoring.router.ts`, `server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts (or new sibling authoring-approval-independence.pglite.test.ts for the red cases)`, `tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts`, `tests/golden-journeys/ind-authoring.journey.test.ts`, `server/routes/__tests__/authoringApprovalSealBinding.test.ts`, `server/routes/__tests__/authoringApprovalNoWorkflow.test.ts`, `server/routes/__tests__/authoring-signing-authority.test.ts`, `server/routes/__tests__/authoringSignFreezeAndExportGate.test.ts` …  
   Red test: In node-status-follows-work.pglite, two cases:
- The creator e-signs as APPROVER: expect 403 SEPARATION_OF_DUTIES, sealedState unchanged, and an independent user then gets 200.
- The author's /sign clears the last step: expect 403 with the step still PENDING and the document not APPROVED.

Both return 200 at HEAD.

14. **qms_document_versions under the append-only grant ceiling (phase 2) / device_audit_trail under the append-only grant ceiling (phase 2) / submission_orchestrator_steps under the append-only grant ceiling (phase 2) / vault.document_archives into APPEND_ONLY_TABLES (phase 2)**  
   Files: `scripts/db/provision-app-role.mjs`, `server/db/__tests__/provision-app-role-append-only.test.ts`, `tests/db/append-only-store-grants.dbtest.ts`, `tests/db/vault-document-archives.dbtest.ts`, `docs/work-orders/README.md (optional)`  
   Red test: provision-app-role-append-only: the four names are added to the toEqual list; this fails against APPEND_ONLY_TABLES at HEAD. append-only-store-grants.dbtest: the four stores are added to STORES; app_service UPDATE and DELETE must fail with 42501, and they do not at HEAD.

15. **QMS controlled-document approval must exclude the Authoring section writers of the bound document (canonical resolveTargetAuthors)**  
   Files: `server/services/qms/document-approval-signature.ts`, `server/services/qms/__tests__/controlled-document-lifecycle.pglite.test.ts`, `server/services/qms/__tests__/qms-approval-checks-the-filing.pglite.test.ts`, `server/routes/__tests__/qms-document-approval-signature.test.ts`  
   Red test: controlled-document-lifecycle.pglite: user 7 wrote the sections (doc_revisions created_by '7') and author_id is 3. approveQmsDocumentSigned by 7 must reject with SELF_APPROVAL, the status must stay in_review, and no version row may be written. At HEAD it resolves and becomes effective. At the route level, a doc_revisions row by the signer must give 403 QMS_SELF_APPROVAL.


## For the founder (from the planner)

- Should a CMC register's data entrant be allowed to qualify or validate their own record? And should specification approval and register qualification keep accepting the meaning 'authorship'? Today no separation-of-duties check runs at those endpoints. Closing this means either refusing 'authorship' (APPROVAL_IS_NOT_AUTHORSHIP, which also removes the user-visible option at cmcRegisterForms.ts:1347) or adding assertSignerIsNotAuthor.
  *Recommendation:* Keep this out of commit 9. Ask the founder or quality owner. The recommendation is the four-eyes check through governance/separation-of-duties.ts, consistent with Module 3 section approval (a4454303f), and not a meaning filter. Hand it to lane session_01GJidg5q1KFNfFT2VZyjcqw after the decision.

- Should the AnA DOCX-with-ledger export refuse when the artifact reads approved or locked but no signature covers the exported text, as authoring file-to-vault already does with anySignatureCovers? Or is stating it on the page enough?
  *Recommendation:* Ship commit 5 as planned, so the page says it. Refusing the export is an optional follow-up for the founder and does not block D5.

- Should AnA k510_workflow.transmit be signed with the fixed meaning 'release', through an entry in SIGNED_ACTS? Today, after commits 1 and 3, only APPROVER transmits on that path. RELEASE is refused by governed-esignature.ts, and REVIEWER is refused only after re-authentication.
  *Recommendation:* Not a blocker. Recommend adding k510_workflow.transmit to SIGNED_ACTS with the required meaning 'release' as a follow-up. That refuses a wrong meaning before the password and matches the Submission Center dispatch vocabulary.

- These are not policy decisions; separation-of-duties.ts and the founder decision of 2026-10-05 already adopt author≠approver. They are consequences the founder should be told about before the fix ships. A single-signer tenant can no longer approve, lock or release its own artifacts, authoring documents or SOPs. Legacy rows with a NULL creator get 409 AUTHOR_UNRESOLVED until authorship is established. Are there known production tenants or legacy imports this would strand?
  *Recommendation:* Proceed with commits 8, 13 and 15 as fail-closed implementations of existing policy. Before they deploy, give the founder a one-line notice naming the single-signer consequence. Ask whether a count of production rows with a NULL created_by is wanted.


## Dismissed by their verifiers

- The tenant purge's retained-evidence exemptions rely on immutability triggers that nothing requires or checks (document_data_dispositions, submission_orchestrator_inputs): The facts in the finding are accurate, but no real caller reaches a wrong outcome.

- The record-class policy forbids DELETE of artifact signatures and lock snapshots 'for every role', but the applier installs a purge door that erases them, and the same purge keeps electronic_signatures: The path is real. A platform admin can call DELETE /api/tenants/:id and then POST /api/tenants/:id/purge (tenants-simple.ts:363/:464, both behind requirePlatformAdmin). That runs PURGE_DOORS → public.purge_tenant_artifact_records, which erases the org's concept2cure_signatures and concept2cure_submi

- The audit-report export creates a locked, published artifact with no signature, and its signature summary drops the meaning: The finding has two parts, and neither shows a real caller getting a wrong compliance outcome that nothing already handles.

- Authoring /sign defaults the meaning to REVIEWER, and that signature approves and freezes the document and approves its filing sections: The code the finding quotes is real (lines have drifted to 7581, 7512, 7694), but no real caller can reach the outcome it describes. The approval branch in advanceWorkflowForSignature only runs if the signer's roles include the meaning, 'QA' or 'RA_CMC': `const userRoles = (((req.user as { roles?: u
