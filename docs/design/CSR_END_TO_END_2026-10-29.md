# AnA as the CSR expert — complete the end-to-end Clinical Study Report (ICH E3)

W1 / D2 (Authoring, Submission Center) and D4 (biostatistics evidence). Founder direction, 2026-10-29: AnA builds a CSR end to end, including 10,000-page reports, with a senior medical writer's craft and vocabulary across therapeutic areas. This file is the design; slices land one at a time with evidence under `docs/evidence/D2-CSR/`.

## What already exists

The repository already has a substantial CSR stack. Its pieces are not connected to each other, and most of them cannot be reached from the client. This assessment rests on the five-reader inventory plus a check of server/data/public-csr-reference/manifest.json, server/routes/ana-cortex.ts:311-404 and server/services/ai-governance/approved-models.ts.

KNOWLEDGE (the canonical E3 model)
- server/services/ind/ctd/csr-e3-guidance.ts builds ICH_E3_GUIDANCE from csr-e3-sections-plan.ts (§1–9), csr-e3-sections-results.ts (§10–13) and csr-e3-sections-appendices.ts (§14–16). That is about 119 headings, down to 16.4, with regulator basis from csr-e3-basis.ts and regulatory-basis.ts. It also provides renderE3Brief, renderE3Scaffold and e3SectionDraftingMode, which marks §3 and §14–16 as 'manual'. The tree is pinned by tests/regulatory/csr-e3-overlay.test.ts.
- Gaps: 33 headings are title-only, mostly in §14 and §16. There are no E3 Annexes, no per-heading writing rules, no estimand content and no therapeutic-area vocabulary. Every E3 basis is graded 'recall'.
- requirements-resolver.ts routes the AnA tool get_document_section_requirements and fails closed. AnaDocumentDraftingService.csrRequirements does the same for batch_draft_sections. in-text-references.ts resolves E3 citations.
- server/services/ana/medical-writing.ts (medical_writing_guidance) has 10 global style rules and a 'csr' standard at the top level only. 'CORE Reference 2016' is a bare label with no content behind it.
- server/services/ana/skills/library/clinical.ts has the clinical.study-report skill: a 10-step method. None of its tools reads study data.
- Duplicate outlines:
  - server/services/csr-builder.ts ICH_E3_STRUCTURE: about 46–50 nodes, with an invented §2.1–2.10 and §8.x, and no §14 or §16 children. It drives /api/csr-workflow/board and the job runner.
  - server/services/templates/clinical-csr-templates.ts: a hand-kept synopsis form (get_csr_template).
  - server/services/ana/intelligence-questions/flows/csr-report.ts (2042 lines) and war-game/auditors/csr-auditor.ts (1099 lines): not keyed to E3 node ids.
  - csr-builder-routes VALID_SECTION_NUMBERS: omits 9.8 and 12.6.
- server/services/lumen-context/sections.ts and server/services/ana-ri/document-templates.ts carry the top-level headings only. The safety-narrative template reuses renderE3Brief('12.3.2').
- server/services/docx/templateRegistry.ts 'csr-ich-e3' backs generate_document.
- server/services/market-specs/document-template-library.ts holds all 119 headings, served by /api/submissions/document-templates, which has no client caller.
- authoring/ind-template-outlines-m4-m5.ts and authoring-draft-template.ts put the full tree into the Authoring editor.
- authoring-guidance.ts 5.3.5.x gives placement-level guidance and is self-described as model-generated.

DETERMINISTIC DATA PATH (reachable)
- shared/csr-source-input.ts and shared/csr-source-contract.ts define the Zod contract concept2cure.csr-source.v1: at most 5 MiB, parallel arms only, not CDISC.
- server/services/csr/vault-source-input.ts does governed ingestion of Vault JSON (hash, current version, lifecycle approval).
- server/services/csr-tabulation-builders.ts (buildCSRTables) produces 11 aggregate tables. It computes no statistics and has no vital signs, PK, subgroup, conmed, deviation, time-to-event, §14 package or §16.2 listings.
- server/services/csr/saved-clinical-tables.ts, source-receipt-eligibility.ts and run-source-guard.ts rebuild tables from a sealed run.
- A user reaches all of this through Submission Center: EctdCompile.tsx → OrchestratorRunControls.tsx → CsrSourceInputControls.tsx, using the csr.tabulate step and GET /runs/:runId/clinical-tables.
- server/services/csr/program-source-readiness.ts drives CsrNarrativeReadiness.tsx, which tells the user honestly that first-study CSR drafting is unavailable.

GROUNDING (the right Rule-2 shape, unreachable)
- server/services/csr/cortex-authoring-context.ts and cortex-authoring-reader.ts build a section-specific evidence pack from the retained tables, bound to a digest. Its parts:
  - loadCsrAuthoringEvidence and buildCsrAuthoringEvidence
  - reconcileCsrTableClaims, which checks claimed values cell by cell
  - CSR_AUTHORING_EVIDENCE_RULES, the prompt rules
- The pack is reached only by POST /api/ana-cortex/csr/evidence-context and /api/ana-cortex/chat with context.csrEvidence. No client caller exists, and the client chat, /api/ana-ri/stream, has no such tool.
- server/services/ana/csr-claim-reconciliation.ts, csr-section-evidence-binding.ts and csr-document-evidence-gate.ts are pure, fail-closed primitives. They are called only from tests or from caller-less functions: medical-writing-review.ts reviewCsrWithEvidence and reviewCsrSectionWithEvidence. As a result critique_document always returns csrEvidence 'not_assessed', so the verdict is always 'revise'.

DRAFTING AND JOBS
- server/services/csr-builder.ts draftCSRSectionWithProvenance prompts from metadata only. The guards in server/services/csr/unsupplied-statistics.ts and the placeholder gate then reject every results draft. The job ends failed: unresolved_placeholders.
- server/services/csr/csr-job-runner.ts is a hardened queue: SHA-256 per section, resume, tenancy re-checks. It feeds the drafter no evidence and keeps no review state.
- server/services/csr/csr-output-integrity.ts checks that saved sections are present and their hashes match.
- server/routes/csr-jobs.ts serves POST /api/csr/jobs. It is auth-gated and has no client caller.
- server/routes/csr-workflow-routes.ts serves the csr-workflow board, CsrWorkflow in BiopharmaProject.tsx:307. The surface is in NAV_HIDDEN and can only ever show an empty state.
- server/services/submission-package-orchestrator.ts runs the csr.draft-narrative step. The route refuses it with 409 CSR_NARRATIVE_INPUTS_REQUIRED (submission-orchestrator.ts:308).
- server/services/csr/load-csr-inputs-for-project.ts supplies inputs to Module 2.

AnA WRITING TOOLS (reachable, but the model supplies their numbers)
- server/services/ana/safety-narrative.ts (draft_safety_narrative) composes one subject per call from fields the model types in. A batch narrative UI was deleted in 2895218b8 on 2026-08-04: SafetyNarrativeAffordance.tsx, SafetyNarrativeQcPanel.tsx and safetyNarrativeBatch.ts.
- statistical-narrator.ts (narrate_statistical_result) narrates whatever estimate, CI and p-value the model passes in, and records no input envelope.
- writing-precision-gate.ts, terminology-consistency.ts and figure-arithmetic.ts, with saved-document-critique.ts, back critique_draft, critique_document and verify_revision. They check self-consistency only.
- Also present: code_meddra, build_abbreviation_list, check_numerical_integrity, reconcile_dossier_numbers and check_dossier_consistency.

REVIEW, ASSEMBLY AND EXPORT
- server/services/authoring/workflow-source-import.ts (CSR kind) is the only assembly path: hash-checked csr_section_outputs rows go into an Authoring document.
- server/services/authoring/csr-scientific-review.ts and csr-scientific-review-core.ts check cells against tables, with a human attestation chained into the audit log.
- There is no CSR assembler for TOC, §14 or §16 leaves, bookmarks or hyperlinks, and no CSR-specific export. Generic Authoring export and Submission Center EctdCompile apply.

PRECEDENT AND CORPUS
- server/services/clinical-regulatory-evidence/csr-adapter.service.ts, csr-content-projection.ts and csr-index-batch.ts project content into the CRE corpus.
- server/services/csr-intelligence-library.ts does regex extraction with verbatim spans.
- server/data/public-csr-reference holds 21 public records for the C. difficile programme (target NCT05330182): one CC-BY publication and FDA BLA review memos for REBYOTA and VOWST, including clinical reviews of 104–135 pages and statistical reviews of 36–42 pages. It contains no actual sponsor CSR.

SCHEMA
- shared/schema.ts:9221 csrBuildJobs and :9291 csrSectionOutputs, created by migrations/20260628_csr_job_state.sql. That file is on no deploy applier (scripts/ci/migration-deploy-path-baseline.json:90).
- The precedent library: csr_reports and csr_details, plus about 30 knowledge tables in 0005_csr_knowledge_database.sql, which is also not on any applier. Most of these tables have no writer.

LEGACY, DEAD OR RULE-2-DEFECTIVE
- server/routes/csr-builder-routes.ts is mounted at both /api/csr-builder and /api/csr, has no client caller, and shadows /api/csr/jobs. Three of its paths break Rule 2:
  - /analyze-benefit-risk asks the model for the benefit-risk verdict.
  - /safety-signals (analyzeCSRSafetySignals) asks the model for frequencies from its own knowledge.
  - /generate-narrative writes a patient narrative with no subject data.
- Dead code:
  - server/services/csr/index.ts (stub facade)
  - server/csr-training-service.ts (no importer)
  - server/services/csr-knowledge-extractor.ts (no route)
  - server/services/csr-search-service.ts (disk plus OpenAI, not tenant-scoped)

DELETED HISTORY
- No client CSR-authoring builder has ever existed in git history. The deleted client pieces were library and analytics UIs: 7a144fd1e, d04381632, bb243dfad and fdfb00d33.
- Server deletions: 27ecdb8d2 (csr-extractor-service.ts), 2a71a823c (csr-adapter.ts), 796c9ac98 (the foresight CSR files) and 1b5bf1677 (extract_csr.md).

EXISTING EVIDENCE DIRECTORIES
- docs/evidence/D2-EDITOR-CSR-CRF/2026-10-26
- docs/evidence/D2-EDITOR-CSR-CRF-COVERAGE/2026-10-26
- docs/evidence/D4-BIOSTAT-CSR-METHODS-CONDUCT/2026-09-25

MODEL GOVERNANCE
- server/services/ai-governance/approved-models.ts lists Opus 5.5 as the primary high-risk drafting entry, but its PQ (server/eval/pq/pq-protocol.json, PQ-DRAFT-001) is PENDING EXECUTION. ADR-0015 §3 says that in production only a model with a passed PQ serves high-risk document_drafting.

## Capability model (state from the 2026-10-29 inventory)

| Capability | State | Gap |
|---|---|---|
| Ingest protocol, SAP and amendments as text evidence | missing | Nothing in the inventory reads a protocol or SAP into a CSR path. vault-source-input reads only csr-source.v1 JSON. The CRE csr-content-projection projects precedent CSR fields, not this study's protocol. The §9 methods sections have no source. |
| Ingest TFL outputs (RTF/PDF) and analysis datasets (ADaM/SDTM, XPT, Dataset-JSON) | missing | The only governed input is the bespoke csr-source.v1 JSON (at most 5 MiB, parallel arms only, not CDISC). No XPT, Dataset-JSON, RTF or TFL PDF parser is on any CSR path. |
| Ingest CRFs and subject listings for §16 | missing | No ingestion exists. csr-e3-sections-appendices.ts records the 21 CFR 314.50(f) requirements as titles only. |
| Full ICH E3 tree including the synopsis and the 16.x appendices | partial | ICH_E3_GUIDANCE (csr-e3-guidance.ts) has all 119 headings, but 33 are title-only and the E3 Annexes are absent. The builder and the job runner use a shallower second outline, csr-builder.ts ICH_E3_STRUCTURE. The synopsis form in clinical-csr-templates.ts is a third copy. |
| Deterministic numbers from the engine, never from the model | partial | csr-tabulation-builders.ts produces 11 aggregate tables, and efficacy statistics are passed through as supplied. There are no vital signs, ECG, PK, subgroup, time-to-event, conmed, deviation or exposure-adjusted tables, and no §14 TFL package. The unsupplied-statistics guard is correct but has nothing supplied to accept, so every results section falls back to a template. Rule-2 defects remain in csr-builder-routes (/analyze-benefit-risk, /safety-signals). narrate_statistical_result and draft_safety_narrative narrate figures the model types in. |
| Section-by-section drafting with source traceability | partial | The traceable design exists: the cortex-authoring-context evidence pack, bound to a digest, plus reconcileCsrTableClaims. It is not wired into draftCSRSectionWithProvenance or the job runner, and it is not exposed in /api/ana-ri/stream. The drafter is metadata-only, and its provenance records model:null and tokenCost:0. |
| Patient safety narratives at scale (hundreds to thousands) | partial | safety-narrative.ts is a sound deterministic composer, but it handles one subject per call from fields the model types in. It has no subject-level data reader and no batch job over deaths, SAEs and discontinuations. The batch UI was deleted in 2895218b8. |
| Cross-section consistency (synopsis vs body vs tables) | partial | writing-precision-gate, terminology-consistency, figure-arithmetic and check_dossier_consistency check that a document agrees with itself. Checking against the source tables (csr-claim-reconciliation, csr-document-evidence-gate) runs only in tests, because no producer builds claim receipts. |
| Medical-writing craft: style, tense, voice and therapeutic-area vocabulary | partial | medical-writing.ts has 10 global rules and a top-level CSR standard, with one-line notes for 10 therapeutic areas. The clinical.study-report skill is a one-page method. There are no per-heading writing rules, model sentences, estimand integration, therapeutic-area safety topics or E3 Annex display models. The CORE Reference and the TransCelerate CSR template appear as labels only. |
| QC: verify every number against its source | partial | Cell-level primitives exist: reconcileCsrTableClaims and reconcileCsrClaims. csr-scientific-review.ts runs after import into Authoring. Nothing produces claim receipts from a draft, so critique_document always reports evidence as not_assessed. |
| Review and sign-off per section | partial | csr_section_outputs has no review or approval state, and the board cannot show one. Review exists only after import into Authoring (csr-scientific-review attestation, the authoring gates). The table's migration (20260628_csr_job_state.sql) is on no deploy applier, so under Rule 1 any new column would not deploy. |
| Assemble a 10,000-page output (body plus appendices as separate eCTD leaves, bookmarks, hyperlinks, PDF/A) | missing | The only assembly is workflow-source-import (job sections → Authoring document). There is no TOC, abbreviations or §14/§16 leaf assembly, no bookmarking to the depth FDA_PDF_SPECS requires, no hyperlinking and no streaming of very large outputs. §14–16 are 'manual', and no deterministic path owns them. |
| Export | partial | There is no CSR-specific exporter. Generic Authoring export and the docx 'csr-ich-e3' blueprint have no TFL or appendix rendering. Submission Center EctdCompile compiles sequences but receives no CSR leaves from a CSR build. |
| Reach: a user can start, watch and finish a CSR build | partial | POST /api/csr/jobs has no client caller and no AnA tool. The csr-workflow board is in NAV_HIDDEN and can only show an empty state. The orchestrator narrative step is refused with 409. Users reach only tabulation and the readiness card, which says drafting is unavailable. |
| AnA as an expert co-writer that can explain, critique and revise | partial | AnA has E3 briefs (get_document_section_requirements), style guidance, critique and revise gates, MedDRA coding and narrative and statistics wording. The skill never directs AnA to the per-heading briefs and gives it no tool that reads the study's retained tables or the CSR job. AnA cannot ground what it writes in data. |
| A model approved for high-risk CSR drafting | partial | approved-models.ts has Opus 5.5 as the primary high-risk drafting entry, but PQ-DRAFT-001 has not been executed for this version. Under ADR-0015 §3, production high-risk drafting fails closed until a PQ passes. |

## Decisions (product manager, 2026-10-29, under the founder's delegation)

1. **OVERTURNED by the founder, 2026-10-31.** *"CSR is just one of the reports that we build. We build a lot of other documents. You initiate it out of a project. … Do I have an IND card? No, these are document types."*
   **The rule now:** a CSR is a document type like every other. It is started from its **project**, through the same document-start path every document type uses, and worked in the one Authoring editor. There is no per-document-type card, screen or entry point, for the CSR or any other type. The CSR-specific controls placed on Submission Center's eCTD Compile surface (`CsrSourceInputControls`, `CsrRunBuilds`, `CsrHeadingReview`, `CsrNarrativeBuild`, `CsrAssemblyControl`, 2026-10-30) are to be converged onto the project's document start and the editor, and removed from Submission Center in the same change (zero duplication). Before that work: find the existing project → document-start path (RULE 3) and name it.
   *Superseded text:* **Where it lives.** A build starts from the retained Submission Center run that holds the engine tables (its CSR card), and the draft lands in the one Authoring editor (`workflow-source-import.ts`), where it is reviewed, signed and exported like any governed document. No new surface; the hidden csr-workflow board becomes the build's progress view inside that flow.
   **Convergence plan (2026-10-31, under CLAUDE.md RULE 4). What already exists, by path:**
   - *The one document start:* **New document** in Authoring (`client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx`), opened from the project, where a template is the document type. The CSR is already a type there: `clinical_study_report` (`server/services/market-specs/document-template-library.ts:445`), every ICH E3 heading (119).
   - *The one editor:* `DocumentCanvas.tsx` / `DocumentWorkbench.tsx`. It already holds sources (`SourceAssemblyDialog.tsx`, `SourceImportDialog.tsx`), per-section AI draft, the editor's own review and signature, export, and filing placement (`AuthoringPlaceIntoFiling.tsx`). §14.3.3 by reference is already in it (`CsrNarrativeReferenceView.tsx`).
   - *Beside it, to converge in (and delete from Submission Center):* the study's source data and frozen tables (`CsrSourceInputControls.tsx`), the build (`CsrBuildDraftControl`, `CsrRunBuilds.tsx`), section review (`CsrHeadingReview`, a second review beside the editor's own), narratives (`CsrNarrativeBuild`) and assembly with placement (`CsrAssemblyControl.tsx`).
   **Order:** (1) open the running app and walk Project → New document → Clinical study report, recording what works and what does not; (2) the study's data becomes a source of that document in the editor's existing sources; (3) drafting a heading uses the editor's section draft, grounded in the engine tables (the CSR job's drafter serves it, not a separate build screen); (4) narratives and assembly become actions of the document in the editor; (5) review and approval are the editor's, and `CsrHeadingReview` and the job's separate section-review state are retired onto it; (6) the CSR controls leave Submission Center's eCTD Compile in the same change, each removal naming its replacement by path. Each step is opened and used in the running app before it is called done.
2. **Import and verify, not compute, for launch.** The engine derives descriptive tables from ADaM and imports the approved SAP/TFL efficacy outputs; every number in the text is verified against them. Model-based efficacy estimation (a validated biostatistics engine) is a later decision.
3. **Composition boundary.** First scope: a Phase 2/3 parallel-arm interventional CSR (drug or biologic). Crossover, PK/BE, device and non-interventional studies are refused by name until widened, as CMC's `composition-scope.ts` does.
4. **Reference content.** Verbatim public ICH E3 and E3 Q&A (R1) text and the CC-BY CORE Reference may be encoded as basis with quoted spans; TransCelerate templates wait for a licence check. End-to-end proofs use the public CDISC pilot ADaM data; no sponsor CSR is in the repository today.
5. **Scale target.** 10,000 pages and 1,000 patient narratives per build; slices 7–8 are designed for streaming and parallel work at that size.
7. **Two reviews, one approval (2026-10-29, slice 3).** The build board's per-section state (draft, in review, approved) is an editorial triage before import, bound to the exact text by hash, and the build's requester may not approve their own sections. It is not the CSR's approval. The governed approval stays the Authoring document's review, scientific-review attestation and Part 11 signature after import, owned by the D5 CSR-path lane; nothing on the board changes those gates. Slice 3's design text said the board approval *is* that attestation; that is superseded here, so the attestation is not duplicated.
8. **A figure an edit removes (2026-10-30).** In a results section (§2, §10-13) a claimed figure that an edit removed blocks the saved CSR's evidence verdict: there a removal cannot be told apart from a swap to a value another claim in the section carries (found by review). Outside those sections it is reported without blocking, since a writer may legitimately drop a figure from a methods or discussion section.
6. **Retiring Rule-2 defects.** The model-frequency and model-verdict CSR endpoints (`/safety-signals`, `/analyze-benefit-risk`, `/generate-narrative`) have no client caller; each is removed with its engine replacement named (slice 9).

## Founder decision still open

- **The model that serves high-risk CSR drafting.** `approved-models.ts` names the primary drafting entry, but PQ-DRAFT-001 has not been executed for its version, so production CSR drafting stays closed (ADR-0015 §3). Proposal: run PQ-DRAFT-001 with a CSR eval set (section accuracy against reconciled tables, narrative fact fidelity).

## Slices (in order)

### 1. Reach the retained CSR evidence pack from AnA chat (S)

- **Deliverable:** In the AnA chat the client already uses (/api/ana-ri/stream), a user names a retained Submission Center run and an E3 section, for example §12.2. AnA calls a new tool, get_csr_section_evidence, which wraps loadCsrAuthoringEvidence and returns that section's engine tables, bound to a digest. AnA also calls get_document_section_requirements for the E3 brief. It then narrates over the tables, and reconcileCsrTableClaims checks every figure AnA wrote back to its cell. The reply shows the run, the table digest and any claim that does not reconcile. The skill is updated to name both tools. Table numbers now come from the engine and the model only narrates.
- **Extends:** server/services/csr/cortex-authoring-reader.ts loadCsrAuthoringEvidence and cortex-authoring-context.ts reconcileCsrTableClaims (today reachable only through the caller-less /api/ana-cortex/csr/evidence-context), plus the clinical.study-report skill in server/services/ana/skills/library/clinical.ts
- **Files:** `server/services/ana/AnaToolExecutor.ts`, `server/services/ana/regulatory-knowledge-tools.ts (or the clinical tool-defs file that registers CSR tools)`, `server/services/ana/tool-selection.ts`, `server/services/ana/skills/library/clinical.ts`, `ana-launch-scope.inventory.json`, `server/services/csr/cortex-authoring-reader.ts (reused, not changed)`, `server/services/ana/__tests__/csr-section-evidence-tool.test.ts`, `docs/evidence/D2-EDITOR-CSR-CRF/2026-10-29-ana-evidence/README.md`
- **Proof:** Fail first: a test asks the tool for §12.2 on a run whose receipt has been revoked, then on a draft whose AE count differs from aeBySOC by one. It must show CSR_SECTION_EVIDENCE_UNAVAILABLE for the first and a non-reconciling claim for the second before the passing case. Then an end-to-end run: transcribe the aggregate disposition and primary-efficacy counts of the REBYOTA PUNCH CD3 trial, as given in the FDA Statistical Review in server/data/public-csr-reference, into a csr-source.v1 Vault JSON. Run csr.tabulate. In chat, draft §11.4.1 and §10.1, and file the reconciled claim list with the FDA-reported figures beside each. Note: the reference set holds FDA review memos and a publication, not a sponsor CSR.

### 2. Complete the CSR job drafter: converge onto ICH_E3_GUIDANCE and draft results over engine tables (M)

- **Deliverable:** A CSR job, bound to a retained orchestrator run, drafts every narrative-mode heading of the 119-node ICH_E3_GUIDANCE tree rather than the builder's 46–50-node copy. For each results section (§10–13 and the synopsis) the drafter gets that section's evidence pack. unsupplied-statistics treats the pack's cells as supplied, so engine numbers pass and invented numbers are still refused. reconcileCsrTableClaims gates every save. Provenance records the real model id and token cost. ICH_E3_STRUCTURE and VALID_SECTION_NUMBERS are deleted, and the board, workflow-source-import.ts and m5-clinical-qc.ts read the canonical tree.
- **Extends:** server/services/csr-builder.ts draftCSRSectionWithProvenance and ICH_E3_STRUCTURE, server/services/csr/csr-job-runner.ts, server/services/csr/unsupplied-statistics.ts
- **Files:** `server/services/csr-builder.ts`, `server/services/csr/csr-job-runner.ts`, `server/services/csr/unsupplied-statistics.ts`, `server/services/csr/cortex-authoring-context.ts`, `server/routes/csr-workflow-routes.ts`, `server/routes/csr-builder-routes.ts`, `server/services/authoring/workflow-source-import.ts`, `server/services/authoring/m5-clinical-qc.ts`, `server/services/__tests__/csr-builder-e3-outline.test.ts`, `server/services/__tests__/csr-builder-completeness.test.ts`
- **Proof:** The existing csr-builder-e3-outline test is rewritten to require all 119 ICH_E3_GUIDANCE numbers, and it fails against today's ICH_E3_STRUCTURE. A new job-runner test drafts §12.2 with a stub model that writes one AE percentage not in the pack. The section must be refused, with the reason recorded in the lineage, and then accepted once the figure matches. End to end: the PUNCH CD3 transcription from slice 1 completes a job with §10, §11.4 and §12.2 in status 'complete' and no unresolved_placeholders.

### 3. Reach CSR builds from the board, and put the job tables on the deploy path with section review state (M)

- **Deliverable:** From Submission Center's CSR readiness card, or from the csr-workflow board, a user clicks 'Build CSR draft' on a run with retained tables. The board shows the job's progress section by section, and each section moves through draft, in review and approved. A reviewer's approval is the existing csr-scientific-review attestation, chained into the audit log. The readiness card stops saying drafting is unavailable once a source-bound run exists, and the orchestrator's 409 is lifted only for source-bound runs.
- **Extends:** server/routes/csr-jobs.ts POST /api/csr/jobs (no caller), CsrWorkflow in client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx:307, migrations/20260628_csr_job_state.sql, and the orchestrator narrative refusal in server/routes/submission-orchestrator.ts:308
- **Files:** `scripts/db/migration-set.mjs (add 20260628_csr_job_state.sql to C2C_MIGRATION_FILES before the final tenant-sweep pair)`, `scripts/ci/migration-deploy-path-baseline.json`, `migrations/20260628_csr_job_state.sql (amended in place with a dated header: review_status, reviewed_by, reviewed_at, source_run_id)`, `shared/schema.ts`, `server/routes/csr-jobs.ts`, `server/routes/csr-workflow-routes.ts`, `server/services/csr/program-source-readiness.ts`, `server/routes/submission-orchestrator.ts`, `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx`, `client/src/concept2cure/.../CsrNarrativeReadiness.tsx`, `client/src/concept2cure/v2/registryModel.ts (only if the founder un-hides the surface)`
- **Proof:** ci:migration-set-order and ci:migration-drop-safety fail on a version that appends the file after the sweep, and pass on the correct order. A client test fails while the board renders no start control, and passes once it does. A route test proves that the 409 still fires for a run with no source. The end-to-end proof is a recorded click path from EctdCompile to an approved §11.4 section for the PUNCH CD3 transcription, filed under docs/evidence.

### 4. Complete the E3 knowledge to senior-writer depth and converge the parallel CSR outlines (L)

- **Deliverable:** The following knowledge is added to the existing tree, and get_document_section_requirements and medical_writing_guidance return it:
- Per-heading writing rules: tense, voice, standard result sentences, hedging.
- E9(R1) estimand treatment in 9.7.1 and 11.4.
- Content for every title-only §14 and §16 node: TFL numbering and shells, AE and lab table conventions, CTCAE and DAIDS grading notes, exposure-adjusted incidence, CRF page selection.
- E3 Annexes I–IVb as display models.
- Therapeutic-area efficacy and safety vocabulary.

The E3 bases are re-read verbatim from fda.gov/media/71271 and the E3 Q&A (R1), and upgraded from 'recall' to 'regulator-text' where they are confirmed. The hand-kept synopsis form is derived from §2 'contains'. The csr-report flow and the auditor key their fields to E3 node ids.
- **Extends:** server/services/ind/ctd/csr-e3-sections-plan.ts, csr-e3-sections-results.ts, csr-e3-sections-appendices.ts, regulatory-basis.ts, server/services/ana/medical-writing.ts, the synopsis in server/services/templates/clinical-csr-templates.ts, intelligence-questions/flows/csr-report.ts, war-game/auditors/csr-auditor.ts
- **Files:** `server/services/ind/ctd/csr-e3-sections-plan.ts`, `server/services/ind/ctd/csr-e3-sections-results.ts`, `server/services/ind/ctd/csr-e3-sections-appendices.ts`, `server/services/ind/ctd/csr-e3-guidance.ts`, `server/services/ind/ctd/regulatory-basis.ts`, `server/services/ana/medical-writing.ts`, `server/services/templates/clinical-csr-templates.ts`, `server/services/ana/intelligence-questions/flows/csr-report.ts`, `server/services/ana/war-game/auditors/csr-auditor.ts`, `tests/regulatory/csr-e3-overlay.test.ts`
- **Proof:** The overlay test gains a field census that fails today, on the 33 title-only nodes and the missing Annexes, and requires that every regulator-text basis carry a quoted span. A new test fails while the synopsis template lists any field not derived from §2. End to end: AnA critiques §11.4.1 of the slice-2 PUNCH CD3 draft, cites the brief by E3 number, and the revision passes critique_document. The prior figures and the re-read source excerpts are filed.

### 5. Feed source evidence to the CSR evidence gates so saved CSRs get a real verdict (M)

- **Deliverable:** Each drafted section stores its claim receipts, which reconcileCsrTableClaims already computes in slice 2, and binds them to the section's SHA-256 and AnA run id. Every claim maps to its evidence fact. critique_document on a saved CSR then reports csrEvidence as reconciled or failed instead of 'not_assessed'. medical_writing_review runs the evidence variant. Before release, verifyCsrDocumentEvidence lists every unbound claim across the whole document, synopsis included, so that a synopsis figure that differs from the body or from the tables is caught.
- **Extends:** server/services/ana/csr-claim-reconciliation.ts, csr-section-evidence-binding.ts, csr-document-evidence-gate.ts, medical-writing-review.ts reviewCsrSectionWithEvidence (test-only callers today), writing-precision-gate.ts critiqueDocument and saved-document-critique.ts
- **Files:** `server/services/ana/csr-claim-reconciliation.ts`, `server/services/ana/csr-section-evidence-binding.ts`, `server/services/ana/csr-document-evidence-gate.ts`, `server/services/ana/medical-writing-review.ts`, `server/services/ana/writing-precision-gate.ts`, `server/services/ana/saved-document-critique.ts`, `server/services/ana/AnaToolExecutor.ts`, `server/services/csr/csr-job-runner.ts`, `migrations/20260628_csr_job_state.sql (receipts column, amended in place after slice 3)`
- **Proof:** A test fails first: a saved CSR whose synopsis states 15/305 while §11.4 and the table state 16/305 must fail the document gate. Today it returns not_assessed. End to end: the PUNCH CD3 job from slice 3 gets a document-level evidence verdict, and a deliberately altered synopsis figure is caught.

### 6. Complete the deterministic engine: ADaM ingestion and the wider table set (L)

- **Deliverable:** A user puts ADaM datasets (ADSL, ADAE, ADLB, ADEX, ADVS, ADTTE as Dataset-JSON or XPT) and the approved efficacy-results file into Vault. The engine derives the csr-source input itself. It extends the tables with:
- vital signs and ECG (so §12.5 finally gets evidence)
- subgroups
- conmeds
- protocol deviations
- exposure-adjusted incidence
- time-to-event summaries, from the supplied estimates
- crossover designs

It numbers them as a §14 TFL set. Model-based statistics stay as imported, approved SAP outputs. They are not computed here unless the founder decides otherwise.
- **Extends:** server/services/csr-tabulation-builders.ts, shared/csr-source-input.ts and csr-source-contract.ts, server/services/csr/vault-source-input.ts, cortex-authoring-context.ts section-to-table map
- **Files:** `server/services/csr-tabulation-builders.ts`, `shared/csr-source-input.ts`, `shared/csr-source-contract.ts`, `server/services/csr/vault-source-input.ts`, `server/services/csr/cortex-authoring-context.ts`, `server/services/csr/saved-clinical-tables.ts`, `client/src/concept2cure/.../CsrSourceInputControls.tsx`
- **Proof:** A test fails first: an ADAE row whose subject is missing from the ADSL safety population must be rejected, and today this cannot be expressed. The section-to-table map test fails while §12.5 has no table. End to end: the public CDISC pilot ADaM set, if it is admitted under the founder decision on external data, or else a synthetic ADaM set labelled as such, tabulates and drafts §12.2 and §12.5 with every claim reconciled.

### 7. Complete patient safety narratives at scale from subject-level data (L)

- **Deliverable:** A narrative job reads ADSL, ADAE, ADCM and ADMH from slice 6. It selects every death, SAE, discontinuation for an AE and AESI subject defined by the E3 §12.3.2 rule, then composes each narrative deterministically from engine-sourced facts. The model writes only connective clinical prose, and every date, dose, event and outcome is checked back to its row. Narratives land as §14.3.3 and §16.2.7 content, with a QC list on the board showing missing fields and items awaiting review. The deleted batch UI is restored onto the board rather than rebuilt elsewhere.
- **Extends:** server/services/ana/safety-narrative.ts and draft_safety_narrative (AnaToolExecutor.ts:3840), csr-job-runner.ts, the safety-narrative intelligence flow (intelligence-questions/engine.ts:615). The deleted batch UI (2895218b8) is the history this restores.
- **Files:** `server/services/ana/safety-narrative.ts`, `server/services/csr/csr-job-runner.ts`, `server/services/csr/narrative-subject-selection.ts (a new engine module inside the existing csr service; nothing like it exists today)`, `server/routes/csr-jobs.ts`, `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx (CsrWorkflow narrative QC panel)`
- **Proof:** A test fails first: a narrative whose stated onset date differs from the ADAE ASTDT is refused. A selection test fails when one SAE subject is missed. End to end: about 200 narratives from the slice-6 dataset, filed with a full fact-to-row reconciliation and timing at scale.

### 8. Complete CSR assembly and export into Submission Center for a very large document (L)

- **Deliverable:** An approved CSR job assembles into:
- a body leaf with a generated TOC (bookmarks four levels deep), an abbreviations list and internal hyperlinks to §14 and §16
- §14 TFLs, §16.2 listings and §16.3 CRFs as separate eCTD leaves under 5.3.5.x, with a study tagging file

It is rendered as PDF/A, streamed rather than built in memory so that a 10,000-page appendix set completes. It is handed to Submission Center's existing compile and validation path.
- **Extends:** server/services/authoring/workflow-source-import.ts (the only assembly path), server/services/docx/templateRegistry.ts 'csr-ich-e3', build_abbreviation_list, Submission Center EctdCompile.tsx and the STF handling, regulatory-basis FDA_PDF_SPECS and FDA_STF_IG
- **Files:** `server/services/authoring/workflow-source-import.ts`, `server/services/docx/templateRegistry.ts`, `server/services/csr/csr-assembly.ts (an assembler inside the existing csr service; no assembler exists anywhere today)`, `Submission Center compile services behind client EctdCompile.tsx`, `client/src/concept2cure/.../EctdCompile.tsx`
- **Proof:** A test fails first: an assembled body with a broken §14 hyperlink, or bookmarks shallower than four levels, fails a PDF-spec check. End to end: a synthetic 10,000-page appendix set compiles within the memory budget, and the agency validator results are filed.

### 9. Retire the Rule-2-defective CSR endpoints and the dead CSR code (S)

- **Deliverable:** The model-verdict and model-frequency endpoints are removed, each with its replacement named in the commit:
- /generate-narrative is replaced by the slice-7 narrative job.
- /safety-signals is replaced by the engine AE tables plus cortex evidence.
- /analyze-benefit-risk is replaced by the existing deterministic benefit-risk engine, if one is found in the pre-deletion search, or else the deletion goes to the founder.

The /api/csr shadowing of /api/csr/jobs is removed. The four dead files are deleted after the git-history search and an importer check. This can run in parallel with any slice.
- **Extends:** server/routes/csr-builder-routes.ts (/analyze-benefit-risk, /safety-signals, /generate-narrative, the duplicate /api/csr mount), csr-builder.ts analyzeCSRSafetySignals, server/services/csr/index.ts, server/csr-training-service.ts, server/services/csr-knowledge-extractor.ts, server/services/csr-search-service.ts
- **Files:** `server/routes/csr-builder-routes.ts`, `server/bootstrap/register-clinical-intel-routes.ts`, `server/services/csr-builder.ts`, `server/services/csr/index.ts`, `server/services/index.ts`, `server/csr-training-service.ts`, `server/services/csr-knowledge-extractor.ts`, `server/services/csr-search-service.ts`
- **Proof:** A route test fails while /api/csr/safety-signals answers or /api/csr/jobs is shadowed by csr-builder-routes. A grep gate fails while any importer of a deleted file remains. Since none of these pieces has a client caller, deleting them removes nothing a user can reach.

## Risks

- High-risk drafting fails closed in production. approved-models.ts has Opus 5.5 as the primary high-risk drafting entry, but PQ-DRAFT-001 has not been executed for this version, and ADR-0015 §3 refuses PQ-pending models in production. Slices 1, 2 and 7 work outside production but cannot serve customers until a CSR-drafting PQ passes.
- No real sponsor CSR exists in server/data/public-csr-reference. It holds FDA BLA review memos (REBYOTA and VOWST clinical and statistical reviews) and one CC-BY publication. The end-to-end proof is therefore a hand transcription of aggregate results into csr-source.v1 and a check against FDA-reported figures. It is not a check against a real CSR, and patient-level proofs (slices 6–7) need public CDISC pilot data or labelled synthetic data.
- Rule 1: csr_build_jobs and csr_section_outputs (migrations/20260628_csr_job_state.sql) are on no deploy applier. Adding review, receipt or source_run_id columns before moving the file onto C2C_MIGRATION_FILES would pass CI and never deploy. Slice 3 must land before any schema change in slices 5–7.
- Rule 3 and zero duplication: three or more CSR outlines (ICH_E3_STRUCTURE, the synopsis template, the csr-report flow and auditor, VALID_SECTION_NUMBERS) plus two evidence-gate families (cortex reconcileCsrTableClaims and ana csr-claim-reconciliation) could be extended side by side. Slices 2, 4 and 5 must converge them and delete the copies in the same change.
- Rule 2 drift at scale: statistical-narrator and safety-narrative accept figures the model types in. If they are used outside the evidence-bound paths, the model becomes the source of numbers again. Both tools need an input envelope bound to engine evidence.
- The E3 knowledge provenance is self-declared 'recall'. The writing guidance cannot claim world-class authority until slice 4's verbatim re-read is done, and adding content beyond E3 (CORE Reference, TransCelerate templates) raises licence questions.
- Scale: the existing stack is sized for 5 MiB JSON and in-memory tables (a 40k-character evidence cap, 100k participants). A 10,000-page CSR needs streamed ingestion and assembly. The job runner has no parallelism or retries, so drafting 119 sections plus thousands of narratives in sequence may be too slow.
- Surface placement: csr-workflow is in NAV_HIDDEN, and CSR work is split between Submission Center (tables and readiness) and BiopharmaProject (the board). If it is exposed without a decision on where it lives, Rule 2 forbids a new surface outside the launch catalog.
- Gate sensitivity: lifting the 409 CSR_NARRATIVE_INPUTS_REQUIRED for source-bound runs must not lift it for metadata-only runs, or the template-filled skeleton becomes reachable as if it were a CSR.
