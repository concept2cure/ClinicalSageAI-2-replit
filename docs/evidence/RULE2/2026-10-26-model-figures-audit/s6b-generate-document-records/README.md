# Rule 2 · S6b: generate_document writes no regulated document from text the model supplies

**Rule:** CLAUDE.md Rule 2 ("numbers, verdicts and governed content come from deterministic engines; the model
narrates"), and Rule 4 (one editor).
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **S4**, AnA the writer: "narrates evidence with citations, takes
direction, and pushes back when the data do not support a claim".
**Audit:** `../design.md`, slice S6b.
**Date:** 2026-11-01.

## The defect

`generate_document` built a DOCX from `sections[].content` in scratch mode, or from `replacements` in template mode.
The model writes both. The tool offered, and built:
- a CSR;
- Module 2, 3, 4 and 5;
- a CER, a 510(k) and an IB.

Every figure in them was whatever the call carried: "ORR 42% (95% CI 35–49); assay 99.8%" came out as a formatted CSR
section.

Three more faults sat in the same handler:
- **The backbone and ICSR refusal was bypassed.** It ran after the scratch branch, so any call with `sections` went
  straight past it and built an eCTD backbone or an ICSR anyway.
- **An omitted `document_type` was built as a CSR** (`input.document_type || 'csr'`).
- **The intelligence flows routed straight into it.** They offered "Generate CSR Draft", "Generate 510(k) Document",
  "Generate CER Draft" and "Generate CMC Module 3" through `generate_document`.

## What already exists (RULE 3)

| Piece | Path | What it does |
|---|---|---|
| The CSR record path | `get_csr_section_evidence` (`server/services/csr/cortex-authoring-reader.ts` through AnA), then `draft_authoring_document` in the one editor | A section's engine tables from a retained Submission Center run; CSR slice 1 of `docs/design/CSR_END_TO_END_2026-10-29.md` |
| Module 3 | `POST /api/cmc/module3-os/compile/:projectId`, approval, `POST /api/cmc/module3-os/place-into-submission/:projectId`; `draft_quality_overall_summary_m2_3` | Compiled from the CMC records under the export gate |
| Module 2 | `draft_quality_overall_summary_m2_3`, `draft_nonclinical_overview_m2_4`, `draft_clinical_overview_m2_5`, `draft_nonclinical_summaries_m2_6`, `draft_clinical_summary_m2_7` | Record-composed since 3b Slice 1 and Rule 2 S2/S3 |
| CER, 510(k), PMA, Q-Sub sections | `write_kit_section` (the device kit's section editor, reviewed by a person), `compose_510k_summary`, `assess_stored_cer` | The device work areas |
| IB | The project's IB document on its canonical outline (`server/services/market-specs/ib-outline-detail.ts`; `docs/evidence/D2-ANA-IB-OUTLINE/`) | Written in the one editor |
| The earlier refusal | the `ectd_backbone` / `icsr` branch of the same handler, and their removal from the enum (pinned by `tool-selection.test.ts`) | The precedent this slice follows |
| The governed-write gate | `server/services/ana/governed-write-tools.ts` | Admits only an approved model's turn; it does not judge what the document is |

**Searches run:**
- `generate_document`, `masterDocumentBuilder`, `generateFromScratch`;
- each refused type name;
- the four flow labels;
- `git log --since=2026-10-26 -S generate_document` on the handler and the engine (no other session is on them);
- the CSR end-to-end design.

Nothing was rebuilt. The refusal table is split out of the handler into `server/services/ana/generate-document-refusals.ts`,
in the same folder (RULE 6: "split, don't add").

## The change

- **The refusal comes first.** Before either mode runs, `generate_document` refuses each record document by name,
  saying which tool or route produces it:
  - CSR and Module 5;
  - Modules 2, 3 and 4;
  - CER, 510(k) and IB;
  - eCTD backbone and ICSR.

  Template mode is refused for them too.
- **An omitted `document_type` asks for it** (`needs_parameters`), and is no longer built as a CSR.
- **The definition shrinks to what the tool writes.** It now offers Module 1, protocol and SAP, and names where each
  refused document is made. The refused types left the enum, as `ectd_backbone` and `icsr` did.
- **A PMA is withheld (founder decision P-55, R-7).** Generating one waits until a PMA record path exists. The refusal
  names `write_kit_section` for the PMA modules and `advise_pma_readiness`. The PMA intake flow offers the same.
- **Kept, with the reason:**
  - protocol and SAP, whose content is design, not results;
  - Module 1, which is administrative.
- **The intelligence flows offer the record path:**
  - CSR → `get_csr_section_evidence`;
  - 510(k) → `write_kit_section`;
  - CER → `assess_stored_cer`;
  - CMC Module 3 → `navigate_to` (CMC / Module 3). The register commit stays the CMC flow's first action;
  - PMA → `write_kit_section` (P-55, R-7).
- **The clinical IB skill (step 8)** drafts in the project's IB document with `draft_authoring_document` and exports
  from the editor, instead of producing the IB with `generate_document`.

**Not in this commit, because of the plan's one-package rule:**
- `server/services/device/device-section-registry.ts` still tells AnA to "Use the generate_document tool to draft any
  section" of a device submission. That file is outside S4's paths, so it is a separate `Plan: F1` commit, filed
  below.

**User-visible:** asked to generate a CSR, Module 2–5, a CER, a 510(k), an IB or a PMA, AnA no longer produces a DOCX
of model-written text. It says where that document is made and goes there. Protocols, SAPs and Module 1 documents are
generated as before.

## Proof

`server/services/ana/__tests__/generate-document-refuses-record-documents.test.ts`:

| Case | Trunk (`d914c2618`) | After |
|---|---|---|
| Each of the eleven refused types (the ten record documents and the PMA) with sections: refused, path named, nothing built, the figure not echoed | **fail**: `success: true`, a DOCX built | pass |
| A CSR in template mode: refused before the template is read | **fail** | pass |
| No `document_type`: `needs_parameters` | **fail**: built as a CSR | pass |
| Protocol and SAP still built | pass | pass |
| The definition names what it refuses, at most 1024 characters | **fail** | pass |
| The CSR, 510(k), CER, CMC and PMA flows offer the record path, and no `generate_document` | **fail** | pass |

- `red/before.txt`: 19 of 21 cases fail on trunk; the 2 controls pass.
- `green/after.txt`: 21 of 21.
- The neighbourhood is green: 37 files, 951 tests, with the device suite. It covers:
  - this test;
  - the intelligence-flow suggested-actions and sessions suites;
  - every `intelligence-questions` suite;
  - the three tool-selection suites;
  - tool authorization;
  - the skills suites and the skills route.

**Gates:**
- `ci:typecheck-no-regression`: 0 errors (baseline 0); ESLint ratchet: no file changed its warning count (`green/gates.txt`).
- `manifest:ana`: regenerated.
- `ci:one-design-plan`: the commit carries `Plan: S4` and `Completes: server/services/ana/AnaToolExecutor.ts`.

## The device prompt (`Plan: F1`)

`renderDeviceContextBlock` (`server/services/device/device-section-registry.ts`) is the device block AnA's chat prompt
carries for a 510(k), De Novo, PMA, CER or IVDR project. It told AnA to "Use the generate_document tool to draft any
section".

Each type now names the tool that writes its sections:
- **510(k), De Novo and PMA:** `write_kit_section`, into the kit's section editor where a person reviews it. A 510(k)
  also names `compose_510k_summary`.
- **CER:** `write_kit_section` with `cer-main` and `cer-pmcf`.
- **IVDR:** `create_per_document`, for the performance evaluation report.

The file sits outside S4's paths, so this half is its own commit. It also carries the regenerated
`docs/ana-capability-manifest.json`.

**Proof:**
- `red/device-prompt-before.txt`: the five new cases in `device-chat-cer-per.test.ts` fail with the registry as it
  was.
- `green/device-prompt-after.txt`: 22 of 22 pass.
- typecheck 0; ESLint ratchet unchanged.

