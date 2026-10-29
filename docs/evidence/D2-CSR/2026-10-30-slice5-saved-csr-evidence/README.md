# D2 / D4 — CSR slice 5: a saved CSR gets a real number-to-source verdict

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 5. Launch rows: D2 (Authoring) and D4 (biostatistics evidence). Workstream W1. Boundary: AnA's critique verdict only. The D5 lane's release, review, approval and signing gates, `shared/authoring/csr-scientific-review.ts` and the narration tools are not touched.

## What already exists

Re-read before any change. Each piece below was extended. None was rebuilt.

- `server/services/ana/csr-claim-reconciliation.ts` `reconcileCsrClaims` reconciled numeric claims (numerator, denominator, estimate) against qualified evidence facts. It could not express "this exact retained-table cell". **Extended** with an optional `cellText` on fact and claim. When either side carries it, the two must be identical (`NUMERIC_MISMATCH`).
- `csr-section-evidence-binding.ts` `verifyCsrSectionEvidenceBinding` bound claims to a section's SHA-256 and a run id. It returned issue codes only. **Extended**: it now also returns the claim-level findings.
- `csr-document-evidence-gate.ts` `verifyCsrDocumentEvidence` ran the whole-document manifest. **Extended**: it now also returns `claimFindings` by section.
- `medical-writing-review.ts` `reviewCsrSectionWithEvidence` / `reviewCsrWithEvidence`: unchanged. They still have only test callers. See below.
- `writing-precision-gate.ts` `critiqueDocument` already accepted `csrClaims`/`csrEvidence`, but `saved-document-critique.ts` never passed any. So `critique_document` on a saved CSR always returned `csrEvidence: not_assessed`. **Reached**: the saved-document critique now passes the real claims and facts. Unchanged file.
- `server/services/csr/cortex-authoring-context.ts` `buildCsrAuthoringEvidence` and `reconcileCsrTableClaims` (slices 1 and 2), and `unsupplied-statistics.ts` `acceptEvidenceBoundDraft` / `findUnclaimedNumbers` (slice 2 and its review). These wrote the exact-cell findings to `csr_section_outputs.lineage.reconciliation`. Reused, unchanged.
- `server/services/csr/saved-clinical-tables.ts` `readSavedClinicalTables` is the project-authorized, receipt-verified retained-table reader. Reused, unchanged, as the critique's default source reader.
- `server/services/authoring/workflow-source-import.ts` (CSR kind) is the only import path. It already carried a `WorkflowSectionOrigin` per section, with the job output's hash, into `authoring_documents.provenance.importSource`. `verifySavedWorkflowImport` re-materializes and deep-compares it. **Extended** (below).
- Searches run: `reviewCsrSectionWithEvidence|reviewCsrWithEvidence|verifyCsrDocumentEvidence|verifyCsrSectionEvidenceBinding|reconcileCsrClaims|csrEvidence|not_assessed` over `server shared client/src tests`; `materializeWorkflowSource|sectionOrigins|workflowCopySectionContent|savedImportSource`. No other producer of CSR claim receipts exists.

## What changed

1. **Receipts at drafting.** `csr-builder.ts` `acceptSectionReply` writes `lineage.claimReceipts` when an evidence-bound draft is accepted. `new server/services/csr/csr-claim-receipts.ts` `buildCsrClaimReceipts` builds it. For each claimed cell it records the table, row, column, exact value, row label (endpoint) and column header (population). It is bound to the pack's `evidenceDigest`, the source SHA-256, and `outputSha256` (= the saved `content_hash`). No schema change: `lineage` is an existing jsonb column. Rule 1 is not engaged.
2. **Receipts through the import.** `verifiedCsrSection` attaches `csrEvidence` to the section's `WorkflowSectionOrigin` (optional field in `shared/authoring/source-import.ts`) through `importedCsrSectionEvidence`. It is attached only when the receipts were made for this exact output (`outputSha256 === content_hash`). It is bound to `sectionSha256`, the hash of the copy the import stores. It records `studyInformationNumbers`: the numbers the section takes from the job's study information rather than a cell. Receipts made for other text are dropped. The import fingerprint covers them, so `verifySavedWorkflowImport` detects tampering.
3. **The verdict.** `new server/services/ana/csr-saved-evidence.ts` `assessSavedCsrEvidence` is pure. `saved-document-critique.ts` reads each retained run behind the receipts inside the review's REPEATABLE READ snapshot, with a savepoint so that a failed read cannot abort the review. It then:
   - builds one evidence fact per claimed cell from the current retained tables, and runs the existing `verifyCsrDocumentEvidence`. That covers the section hash (`SECTION_VERSION_CHANGED`), the run plus evidence digest (`RUN_ID_MISMATCH`, `SOURCE_VERSION_MISMATCH`), the cell text (`NUMERIC_MISMATCH`), the endpoint and population (`ENDPOINT_MISMATCH`, `POPULATION_MISMATCH`), and a cell that no longer exists (`MISSING_SOURCE`);
   - reports **every number with no claim**, per section. These block in a results section, §2 and §10–13 by E3 number (including §10.2 and §11.3, which have no table mapping, so a figure there can never be claimed), and are listed but non-blocking elsewhere. A section with no code is read too, under its title;
   - reports `CLAIM_NOT_STATED` for a claimed figure the section no longer states;
   - checks consistency across sections: an unclaimed n/N whose denominator matches a claimed cell stated elsewhere with a different numerator is reported as `CROSS_SECTION_CONFLICT`, with that cell's claimed and current text and the sections that state it;
   - returns `reconciled_pending_human_review` or `blocked`. `not_assessed` remains only for a CSR that carries no receipts at all (an imported hand-written CSR, for example). Its unclaimed numbers are still listed.

   `critique_document` returns a summary in `csrEvidence` (status, counts, runs) and paginated `csr-evidence-issue` and `csr-unclaimed-figures` items. The document `verdict` is `revise` unless the status is reconciled. The snapshot digest covers the verdict.

## Proof (fail first)

| Check | Red | Green |
|---|---|---|
| `saved-csr-evidence.pglite.test.ts` (new, real SQL for the saved document; receipts produced by the real `acceptEvidenceBoundDraft` → `buildCsrClaimReceipts` → `importedCsrSectionEvidence` path) | `red-trunk-not-assessed.txt`: all 6 cases fail against trunk's `saved-document-critique.ts`. The synopsis-15/305-vs-16/305 CSR returns `not_assessed`. | `green.txt`: reconciled when every figure is its cell. **Synopsis 15/305 while §11.4 and the table say 16/305 → `blocked`**, with `SECTION_VERSION_CHANGED`, `CLAIM_NOT_STATED` (cell `primaryEfficacy[0][2]`, claimed and current `16/305 (5.2%)`), `CROSS_SECTION_CONFLICT` (stated `15/305`, stated elsewhere in `11.4`) and blocking unclaimed `15`, `4.9`. The same holds when the synopsis has no receipts (`BINDING_MISSING` plus the conflict). A changed source names the cell (`17/305 (5.6%)`). An unreadable run is `blocked` with its code and the review still commits, with no writes. A §9.4.4 number is listed as non-blocking. |
| Mutations (`red-mutations.txt`) | Cross-section and unstated checks removed: the 2 synopsis cases fail. Cell-text comparison removed: the changed-source case fails. | restored |
| `csr-job-runner.evidence.test.ts` (extended) | `red-receipts-not-written.txt`: with the receipts write removed, the acceptance case fails | `claimReceipts` bound to `content_hash` and the pack digest |
| `workflow-source-import.pglite.test.ts` (extended) | (new case) | receipts carried and bound to the stored copy's hash; receipts with a forged `outputSha256` dropped; fingerprint changes |

Neighbours (`green.txt`): 37 files and 378 tests, covering saved-document critique, the evidence gates, workflow import and governance, the authoring workflow-import route, and every `server/services/csr/__tests__`. Two existing assertions were updated for the additive fields (`findings: []`).

## Adversarial review (2026-10-30)

Four gaps found and fixed, each red first (`red-review-gaps.txt`: the 4 new cases fail on the builder's version, the 6 original cases pass):

1. **The real import was never assessed.** The CSR import saves the copy under the study's title with `module` null (`workflow-source-import.ts` `csrTitle`, `authoring-source-import.ts` `createWorkflowCopy`). The critique recognised a CSR only by a title, module or product code containing "CSR"/"clinical study report", so an imported CSR named "LMN-201 Part B" got no `csrEvidence` at all and could pass. The test had set the title by hand. `savedIsCsr` now also reads `provenance.importSource.kind === 'csr'`.
2. **An unclaimed number in §10.2 or §11.3 did not block.** "Results section" was implemented as "has a table mapping", which leaves out §10.2 (protocol deviations) and §11.3 (compliance). It is now §2 and §10–13 by number. Such a section with figures also enters the manifest and reports `BINDING_MISSING`.
3. **A receipted section deleted from the document did not block.** It now reports `MISSING_SECTION`.
4. **A section with no code was skipped entirely**, so its numbers were neither listed nor cross-checked. It is now read under `(uncoded section N: title)`, listed as non-blocking, and takes part in the cross-section check, so a contradicting n/N blocks.

Consequence, stated plainly: a CSR whose §10.2 or §11.3 states any number (study-information numbers included, since no receipt can carry them for an unmapped section) is `blocked` until a person reviews it. That is the fail-closed reading of the slice-2 rule that every figure in a results section is a claimed cell's.

## Not done here (reported, not claimed)

- **End to end on PUNCH CD3 / LMN-201 is blocked**, as in slices 1–3. It needs a retained run from a real csr-source.v1 transcription in Vault, a job and an import. The proof is the PGlite test above. No deployed run exists.
- **`medical_writing_review` does not run the evidence variant.** The tool takes free draft text with no saved document identity, so no receipts can bind to it. The saved-document path is `critique_document`. `reviewCsrSectionWithEvidence` is still test-only. Giving `medical_writing_review` a `document_id` is a separate decision.
- **Sections imported before this change carry no receipts.** They report `BINDING_MISSING` (results sections that state numbers) until they are re-imported. Jobs drafted before this change have no `lineage.claimReceipts`, and re-drafting writes them.
- **Edited sections stay blocked.** Any edit after import changes the section hash, so the receipts no longer bind (`SECTION_VERSION_CHANGED`). Re-binding an edited section (re-reconciling the edited text against the run) is not built. The verdict says what changed and does not guess.
- **The cross-section check is limited to n/N and "n of N" figures.** An unclaimed percentage or mean that contradicts another section is reported as an unclaimed figure. It is not paired with the cell it contradicts. Numbers written as words are still not detected (slice-2 note).
- **`studyInformationNumbers` is recorded by the importer from the job's study-information snapshot.** The critique trusts the saved import origin for that list and does not re-materialize the import on every critique.
- **The fact status 'qualified'** means that the receipt-verified reader returned the current, non-withdrawn source. It is not clinical or statistical verification. The status is `reconciled_pending_human_review`, never approval. The D5 approval gates are unchanged.
- **Typecheck:** `typecheck.txt`. The container OOM-killed the full `tsc --noEmit -p .` three times (exit 137) while other lanes were running. A scoped check over the slice's files, which pulls in every import transitively, shows 0 errors in the touched files. The full-project run is still owed.
