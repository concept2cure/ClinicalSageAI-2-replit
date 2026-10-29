# D2 / D4 — CSR slice 2: the job drafter converges on ICH_E3_GUIDANCE and drafts results over engine tables

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 2. Launch rows: D2 (Authoring) and D4 (biostatistics evidence). Workstream W1.

## What already exists

All of these were found in the design's inventory and re-read before any change was made.

- `server/services/ind/ctd/csr-e3-guidance.ts` `ICH_E3_GUIDANCE` is the canonical E3 tree, 119 headings. It also provides `e3SectionDraftingMode`, which marks §3 and §14–16 as `manual`. It was **unchanged** in this slice.
- `server/services/csr-builder.ts` `ICH_E3_STRUCTURE` was a duplicate outline of 46–50 nodes. It had an invented §2.1–2.10 and §8.1–8.2, and no §11.4.x, §12.2.x, §12.3.x, §14.x or §16.x children. The job runner, the csr-workflow board, `workflow-source-import.ts`, `m5-clinical-qc.ts` and the overlay test all read it. **Deleted.**
- `server/routes/csr-builder-routes.ts` `VALID_SECTION_NUMBERS` was a second hand-kept copy of those ids, which left out §9.8 and §12.6. **Deleted.**
- `draftCSRSectionWithProvenance` prompted from metadata only. It recorded `model: null` and `tokenCost: 0` even for accepted AI drafts. **Fixed.**
- `server/services/csr/cortex-authoring-context.ts` already provided `buildCsrAuthoringEvidence` (the section evidence pack bound to a digest) and `reconcileCsrTableClaims` (exact checks, cell by cell). `cortex-authoring-reader.ts` `loadCsrAuthoringEvidence` already read the pack through the project-authorized, receipt-verified `readSavedClinicalTables`. Before this slice, the pack was reached only by the caller-less `/api/ana-cortex/csr/evidence-context`. **Reached** from the job runner. The reader was not changed.
- `server/services/csr/unsupplied-statistics.ts` `acceptModelDraft` already refused figures that the study metadata did not contain. **Extended** with `acceptEvidenceBoundDraft`.

## What changed

- The builder's outline (`getICHE3Structure`) is now derived from `ICH_E3_GUIDANCE` and has every heading.
  - Each node carries `draftingMode`.
  - `isDraftableE3Heading`, `csrSectionSelectionRefusal` and `resolveCSRDraftTargets` are now the single selection and target rule.
  - A full build drafts the 69 narrative headings that carry content of their own. A bare parent such as §12.2 is drafted through its children. A manual heading is refused by name with `CSR_SECTION_MANUAL`.
- Converged onto the canonical tree:
  - the job runner
  - the csr-workflow board, where a top-level row counts as drafted when any heading beneath it, at any depth, is drafted
  - `workflow-source-import.ts`, where gaps are drafting targets only, so a manual heading or bare parent is never reported as missing
  - `m5-clinical-qc.ts`
  - the builder routes, which now use zod refinements on the shared rule
  - the orchestrator's narrative section list, a minimal edit in a shared file that drops §3 and §14–16
- Binding a job to a run: a job can be bound to a retained run with `evidenceSource {programId, runId, studyId}`. The binding is stored in `study_info_snapshot`, so there is no schema change (Rule 1 and slice 3).
  - For each results section that has a table mapping, the runner loads that section's evidence pack, with the requester as the actor.
  - It refuses a pack whose protocol differs from the job's protocol.
  - It fails the job closed if the source no longer verifies.
- Drafting over the pack:
  - The drafter receives the pack as quoted user-priority data, with `CSR_EVIDENCE_DRAFTING_RULES`.
  - The model must end the section with a `csr-claims` block that names the cell behind each figure.
  - `acceptEvidenceBoundDraft` checks every claim with `reconcileCsrTableClaims`. It then checks that every statistic in the prose is made only of numbers from reconciled claims, or from the study information.
  - The supplied set is the claimed cells, not every cell in the pack. An invented figure therefore cannot pass by matching an unrelated cell.
- Refusal and acceptance:
  - On refusal, the reason (`unreconciled_figures`, `unreconciled_claims` or `claims_invalid`) is written to `lineage.rejectedModelDraft` and the template is stored. The job then ends `failed: unresolved_placeholders`, as the unsupplied-statistics guard already did.
  - On acceptance, the claim receipts go to `lineage.reconciliation`.
- Provenance: the provenance drafter calls `ai.chat` and records the gateway's `resolvedModel || model` and `usage.totalTokens`. A reply with no model id is refused with `model_unattributed`.

## Proof (fail first)

| Check | Red | Green |
|---|---|---|
| `csr-builder-e3-outline.test.ts` (rewritten) requires all ICH_E3_GUIDANCE numbers and titles, the drafting mode on every node, no invented §2.x or §8.x, refusal of manual headings, and that the duplicate export is gone | `red-outline.txt`: 17 of 18 failed against `ICH_E3_STRUCTURE` (the outline mismatch itself, not only missing functions) | `green.txt` |
| `csr-job-runner.evidence.test.ts` (new) drafts §12.2 over retained tables with a stub model | `red-job-runner-reconcile-disabled.txt`: with reconciliation short-circuited (a mutation, since reverted), the off-by-one AE percentage (11.5% against the cell `12 (10.5%)`) completes the job. The mismatched-claim and unclaimed-figure cases also fail. | `green.txt`: refused with `unreconciled_figures` in the lineage, then `complete` once the prose says 10.5%. Each section records the model `claude-opus-5-5-20261001` and token cost 1234. A revoked source and a foreign protocol fail the job before any model call. |

## Not done here (reported, not claimed)

- **The end-to-end PUNCH CD3 run is blocked.** It needs the slice-1 csr-source.v1 transcription in Vault and a retained run. Nothing in this slice can produce either.
- **Nothing passes `evidenceSource` yet.** `POST /api/csr/jobs` (slice 3's file) and the orchestrator do not pass it. Reaching a bound build is slice 3.
- **Production drafting stays closed until PQ-DRAFT-001 passes.** See `approved-models.ts` and ADR-0015 §3. The tests use the AI-client test seam.
- **Legacy job rows are refused.** Rows saved with the deleted ids (§2.1, §8.1 and so on) now fail import with 409, which is fail-closed. `csr_build_jobs` and `csr_section_outputs` are on no deploy applier (`20260628_csr_job_state.sql`), so no deployed rows exist.
- **Pre-existing failures, unchanged by this slice:**
  - `csr-job-runner.placeholder-gate` "retains the existing placeholder refusal…"
  - `csr-project-scope.pglite` "keeps genuine organization-wide builds…"
  - `csr-e3-overlay` "market-specs CSR spine…"

## Adversarial review (2026-10-29), fixed in place

| Finding | Red | Fix |
|---|---|---|
| **Rule 2 hole.** `acceptEvidenceBoundDraft` checked prose only with the statistic patterns built for the metadata path. In a run-bound section, "13 of 114 patients (10.5%)" passed when only `114` and `12 (10.5%)` were claimed, because the numerator matches no pattern. "11.5 percent" also passed, because the pattern requires `%`. A model-supplied figure was stored as an accepted draft. | `red-review-unclaimed-numbers.txt`: 2 new `csr-job-runner.evidence` cases fail. | New `findUnclaimedNumbers` in `unsupplied-statistics.ts`. An evidence-bound section may contain no number that is not a claimed cell or part of the study information. Cross-references to report parts (section, §, Table, Figure, Listing, Appendix, ICH E…) are exempt, unless a percent sign follows. Unit cases are in `unsupplied-statistics.test.ts`. |
| **A gap hidden as absence.** `workflow-source-import.ts` stopped listing §3 and §14–16 as gaps, and the builder had inverted the pglite assertion to `not.toContain`. An Authoring draft of a CSR therefore carried no §14–16 and said nothing about them. | `red-review-manual-gap.txt` | Each manual top-level heading in the job's scope now produces the gap "prepared from source outputs and records, not drafted by a CSR job; this draft does not contain it". The test requires that gap, and also requires that it is not reported for headings outside the scope. |
| **E3 text.** The §12.3.3 template said "narratives … are provided below", but narratives belong in §12.3.2 or §14.3.3, and §12.3.3 is the analysis and discussion. The §11.4.1 template stated "ITT population", which nobody supplied. | (template text) | Both corrected. |

Not fixed here (reported):
- A claim binds a figure to a cell. It does not bind the sentence that states the figure. A model could therefore attribute a claimed placebo value to the active arm. Slice 5 binds each claim to its evidence fact.
- Numbers written as words ("eleven") are not detected.
- `e3SectionDraftingMode` (`csr-e3-guidance.ts`, not this slice) marks the by-patient listing headings (§11.4.3, §11.4.6, §12.2.4, §12.3.1.x) as narrative. The model drafts them as cross-references to §14 and §16. When unbound, they are protected only by the metadata-path patterns.
