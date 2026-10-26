# D2 · One implementation of CTD authoring: converge the heading copies, delete the dead ones — 2026-10-25

**The founder's order (2026-10-20):** "We must not have any overlapping duplicates. One is all we must ever have!
Clean up the mess … delete old trash too."

**How it is carried out:** under P-47 (`docs/LAUNCH_DEFINITION_OF_DONE.md`, 2026-10-25). A duplicate is folded into
its canonical capability only after each of its functions is shown to exist there, or is carried over first. Each
deletion names its replacement, by path, and the test that proves the replacement reachable.

**Row moved:** D2. **Workstream:** W1.

**Coordination:** the client-journey session (session_01JbQUvBxcGHdBgkgAydQKpx) was told this directory set on
2026-10-25. Its files are not edited here: ProjectHome, ProjectPlan, ProjectStages, PlanAssign, HomeSections,
`IndDocumentLibrary.tsx`, navigation, the surface registry, the client styles. Duplicates in those files are named
below and left to it.

## What already exists (CLAUDE.md Rule 3)

**The canonical ones:**
- **The one ICH M2–M5 record:**
  - `server/services/ind/ctd/authoring-guidance.ts` (the briefs);
  - `server/services/ind/ctd/ich-m4-headings.ts` (the structural headings).
- **Its projection into outlines:** `server/services/market-specs/ctd-component-outlines.ts`.
- **The one outline everything reads:** `getRegistryDocumentTemplate`, in
  `server/services/market-specs/document-template-library.ts`.
- **Module 3 composition:** the CMC lane, `server/services/cmc/*` (P-28).

**The inventory:**
- **Source.** A six-lens, read-only sweep (workflow `wf_0f8a9a31-23c`): content, names, routes, client, AnA, and dead
  code with history. A skeptic checks reachability and P-47 parity for each candidate.
- **So far.** Four lenses returned 171 candidate files: content 58, names 48, routes 43, client 22. The full list
  and the slice plan follow when the run completes.
- **Two existing gates come first** (Rule 3: extend, never add beside):
  - `scripts/ci/check-regulatory-reference-data-single-copy.mjs`. It guards named exports only, which is why ten
    heading copies under other names went unflagged.
  - `scripts/ci/check-unreferenced-modules.mjs` with its baseline. It already lists three CTD files as unreachable:
    `server/api/ectd/routes.ts`, `server/templates/regulatory_templates.js` and `server/utils/templateRegistry.js`.
- **The sweeps' "nothing reaches it" verdicts are not taken on trust.** A direct check found live callers for:
  - `knowledge-base.ts`, `project-sections.ts` and `ctd-onboarding.ts`, all registered in the bootstrap;
  - `indCopilot.js`, used by `routes/ind.ts`;
  - `regional-ctd-templates.ts`, with eight importers;
  - `cmc-module3-compiler.ts`, on the CMC path.

## C1 — converge the IND lane's Module 2/3 projector onto the record

**The duplicate.** `server/services/authoring/ind-template-outlines-m2-m3.ts` (`buildModule2Or3Outline`) was a second
projector of the same record subtree. The 3a review's completeness critic found it.
- It read `services/regulatory/ind-ectd-sections.ts`, a third heading list, plus the guidance half of the record. It
  never read the structural half.
- So the Authoring picker offered "2.7 · Clinical Summary" (IND lane, 7 nodes, no 2.7.4.2 Adverse Events) beside
  "GLOBAL · Clinical Summary" (49 nodes).
- 2.4 pasted the template library's six headings in as `2.4:work:N` rows.
- 3.2.P.2.1.1 was served without its parent heading.

**What the IND list held that the record did not, by comparison** (`ind-vs-record` probe):
- **15 headings:** the QOS subdivisions, 2.3.S.1–7 and 2.3.P.1–8.
- **17 titles that differ from the record's,** e.g. "Stability" where the record has "Stability (Drug Substance)".

**The convergence:**
1. **The record gains the QOS subdivisions:** 2.3.S.1–7, 2.3.P.1–8 and 2.3.A.1–3, recall, numbered by M4Q(R1)'s
   parallel to Module 3. These are headings only; QOS content stays the CMC lane's.
2. **`buildModule2Or3Outline` walks the record (`ctdRecordSubtree`).**
   - Every row's number and title are the record's.
   - A heading the record briefs keeps its full brief.
   - Any other heading takes the IND list's description where it has one, else the projection's own purpose line.
3. **The `:work:` rows for Module 2/3 are deleted** (`localWorkingRows`).
   - 2.4.1–2.4.6 are now real rows.
   - The same outcome, a 2.4 with its six M4S headings, is delivered by the record. `ind-template-outlines-m2-m3.test.ts`
     proves it reachable from the IND library's templates.

**P-47 parity, function by function:**

| Function | Where it is now |
|---|---|
| Each IND Module 2/3 section opens as a working outline. | Same function, same API (`IndTemplateOutlineSection[]`). |
| Root first, then descendants. | Unchanged. |
| A brief's full guidance, checklist and pitfalls. | Unchanged: the test that every brief is retained passes. |
| 21 CFR references and descriptions from the IND list. | Kept, as the regulatory references and the text for the headings the record holds no brief for. |
| The six 2.4 working headings. | Now the record's own 2.4.1–2.4.6, with the outline's purposes. |

Nothing the old projector offered is lost. No client file changed: `IndDocumentLibrary.tsx` reads the same fields.

**Red first:** `c1-ind-projector-red.txt`: 43 of 63 red on trunk `91dbdb9a4`, 63/63 after.

**Pins moved on purpose:**
- **`ind-template-outlines-m2-m3.test.ts`:**
  - root titles and every row title are the record's;
  - 2.4 is 2.4.1–2.4.6, not `:work:`;
  - 2.5 and 2.7 carry the record to its depth;
  - 3.2.P.2.1 and 3.2.P.2.2 precede their leaves. Their absence was pinned before, and that absence was the bug.
- **`ctd-registry-consistency.test.ts`:** the QOS subdivisions are now modelled, so 2.3.S.1 is checked and agrees,
  and only 3.2.A.1 is unchecked.
- **`ind-pharmacology-leaf-drafting.test.ts`:** the 18 QOS rows join the reviewed structural additions, and the
  counts move (146 rows, 280 codes, 228 leaves).
- **`cross-sector-builtin-authoring-templates.test.ts`:** the digest is re-recorded. `c1-builtin-snapshot-delta.txt`
  shows 61 changed, every one an IND-lane Module 2/3 template built through this projector, and none added or
  removed.

**Not done here, left for coordination:** the picker still lists the IND-lane and GLOBAL entries for the same CTD
component, two catalogue entries for one document, though they now carry one outline. Merging them changes template
ids that saved documents carry, and it touches `IndDocumentLibrary.tsx`, so it goes to the client-journey session.

## D1 — delete six CTD template files nothing can reach

Each file was proven dead by its full path, its bare name and its directory, since a loader might read a whole
folder. The sweep's "none" was not taken on trust: it had also proposed `server/templates/m3/p-5-specs-dp.json`, and
`authoring.router.ts` (`templatesDir()`) reads that directory, so it stays and moves to the converge list.

| Deleted | What it was | Proof that nothing reaches it | What does the job (P-47) |
|---|---|---|---|
| `server/api/ectd/routes.ts` (314 lines) | An unmounted eCTD module-structure and "seeder" router. | Listed by `ci:unreferenced-modules`. `/api/ectd` is mounted from `preflightRouter` and `createEctdV4Router`, not this file. | Live eCTD structure: `server/services/ectd/*` and the v4 router. CTD headings: the ICH M2–M5 record. |
| `server/templates/regulatory_templates.js` (535) | "FDA and ICH Regulatory Document Templates": hand-kept section lists. | Listed by `ci:unreferenced-modules`. No importer. | `getRegistryDocumentTemplate` (`document-template-library.ts`), read from the record. |
| `server/utils/templateRegistry.js` (334) | "Mock IND Templates Data … to simulate the 588+ templates": generated, fabricated template data. | Listed by `ci:unreferenced-modules`. No importer. | The IND lane's real templates, `server/services/authoring/ind-authoring-templates.ts`. Removing it also serves "never fabricate". |
| `client/src/services/templates/ctdTemplates.json` (35) | A Module 2 field-form copy (2.1…). | No reference in client, server or shared code; named only in `reports/phase0/code_inventory.txt`. | The Authoring picker's templates, from the record. |
| `sql/cmc_blueprints.sql` (381) | A "TrialSage AI-CMC Blueprint Generator" schema: 7 tables. | On no applier. None of its 7 tables is named by the schema, the server, or any migration. `ci:orm-reachability` is unchanged (7, baseline 7). | Module 3: the CMC lane (`server/services/cmc/*`). |
| `templates/ectd/fda_pyramid_templates.xml` (582) | An "FDA eCTD Pyramid Templates" XML copy of the CTD structure. | No reader. The sibling `fda_template.xml` is read by `fda-module1-numbering.test.ts` and stays. | The ICH M2–M5 record, and the eCTD backbone checks. |

**Gates.** Before and after are in `d1-unreferenced-before.txt`.
- **`ci:unreferenced-modules`:** 78 before. After the deletions it reported 75 and named the three as gone. The
  baseline was regenerated: 75, exactly those three removed.
- **`ci:sql-interpolation`:** it required its baseline lowered for `server/api/ectd/routes.ts` (3 → 0). Lowered,
  and it passes.
- **`ci:orm-reachability`, `ci:reg-reference-single-copy`, `check-image-runtime-assets` and the typecheck:** pass
  (typecheck: 0 errors).

## C2 — the QOS, drug substance and drug product templates read the record

| Template | Before | Now |
|---|---|---|
| `quality_overall_summary` (`ICH_QOS`) | A five-heading hand copy. Its Introduction was coded `2.3.Intro`, while the project blueprint coded it `2.3.I`. | The record's 2.3 subtree: 2.3.S, 2.3.S.1–7, 2.3.P, 2.3.P.1–8, 2.3.A, 2.3.A.1–3 and 2.3.R. The Introduction is front matter coded `2.3.I`, with its purpose from the 2.3 brief. |
| `drug_substance` (`ICH_M3_DS`) | The project blueprint's copy: seven headings with their own titles. | The record's 3.2.S subtree, to its depth. |
| `drug_product` (`ICH_M3_DP`) | The project blueprint's copy. | The record's 3.2.P subtree, to its depth. |

**Composition stays with CMC.** All three outlines now say that they are headings only, and that for a
small-molecule US IND, Module 3 content is composed in CMC / Module 3 (P-28).

**Supporting changes:**
- `ctdComponentTemplate` gained front matter (`ctdFrontMatter`) and extra limitations.
- The tool description groups outlines read from the same record ("… (M4)"). That keeps it at 1,013 characters,
  inside the 1,024 trim, as more outlines join.

**Red first:** `c2-quality-templates-red.txt`: 10 of 64 red on trunk `1d9f68643`. After the fix, 64/64 pass.

**Pins moved on purpose:**
- **`blueprint-grounded-drafting.test.ts`.** A QOS asked for "Stability" lists its own 2.3.S.7 and 2.3.P.8 and is
  never briefed as Module 3's 3.2.P.8. Before, the five-heading QOS had no stability section, and the title was
  refused as outside the outline.
- **`document-template-library.test.ts`.** Drug substance and drug product read the record's subtree, not a project
  blueprint.
- **`cross-sector-builtin-authoring-templates.test.ts`.** The digest was re-recorded. `c2-builtin-snapshot-delta.txt`
  shows six snapshots changed (the registry and component templates of the three), with none added or removed.

**Still a copy, and why (next: C3).** The shared project blueprints `QOS_SECTIONS`, `M3_DS_SECTIONS` and
`M3_DP_SECTIONS` (`shared/regulatory/project-bootstrap.ts`) remain, for two reasons:
- **Drafting reads them as title synonyms.** "Stability" resolves to 3.2.S.7 for a drug substance only because the
  copy says "Stability", while the record says "Stability (Drug Substance)".
- **They can't simply read the record.** `project-bootstrap.ts` reaches the client bundle through
  `shared/regulatory/index.ts`, so importing the 6,200-line server record there would ship it to the browser.

C3 first gives the record a place to hold those synonyms, then removes the copies.

## C3 — AnA's chat outlines for the CTD components read the record

**What the duplicate was.** `server/services/ana-ri/document-templates.ts` is what AnA puts into its own prompt when a
person asks in chat for a CTD document. The orchestrator injects the detected template as "REQUIRED DOCUMENT
STRUCTURE … use the exact headings below". Eight of its outlines were written by hand:

| Outline | What the hand copy got wrong |
|---|---|
| `ctd_2_2_introduction` | Invented subheadings for an undivided 2.2. |
| `ctd_2_3_qos` | Skipped 2.3.S.5, 2.3.S.6, 2.3.P.4, 2.3.P.6, 2.3.P.7, 2.3.A and 2.3.R. |
| `ctd_2_4_nonclinical_overview` | "Integrated Summary and Implications for Clinical Use", which is not M4S 2.4.5's heading. |
| `ctd_2_5_clinical_overview` | No 2.5.6.1–2.5.6.5. |
| `ctd_2_7_3_efficacy_summary` | "Individual Study Results — Pivotal Trials", "Supportive Data", "Conclusions on Clinical Efficacy": headings in no M4E guideline. |
| `ctd_2_7_4_safety_summary` | "Deaths and Serious Adverse Events" merged two M4E headings; there were no 2.7.4.5 subdivisions. |
| `cmc_drug_substance` / `cmc_drug_product` | Their own 3.2.S/3.2.P titles, one level deep. |

**What replaced it.** `ctdRecordTemplateSections(root)` reads each outline from the record:
- every heading below the root, numbered and titled as the record holds it;
- the guidance is the served outline's purpose line, from `ctdComponentSections`;
- the word target is the brief's own `wordCountRange`, and a heading without one carries none.

The QOS keeps its Introduction, from `ctdFrontMatter`, as the served QOS outline does. Detection patterns and drafting
instructions are not heading copies, so they are unchanged.

**P-47 parity.** Each detected request still gets a structured outline, with required and optional sections,
guidance and word targets. The outline is now the record's, and the module is 36 lines shorter.

**Red first:** `c3-ana-chat-outlines-red.txt`: 11 of 11 red on trunk `1d26bd1e8`. All 11 pass after.

**Gates:**
- the 59 test files that name these templates, the detector, the block builder or the orchestrator: 1,230 pass;
- typecheck: 0 errors;
- ESLint: no new warnings (the module's existing file-length warning remains).

**Prompt size.** The block for `cmc_drug_product` is now about 10.5k characters, because it carries the record's 30
Module 3 headings. The orchestrator appends it as it is, with no cap.

## C4a — AnA's IND planning tools read the record

**What the duplicates were.** Two AnA tools kept their own copies of the Clinical Overview and Clinical Summary
headings:

| Tool | Where the copy lived | What it got wrong |
|---|---|---|
| `plan_ind_module_authoring` | `IND_MODULE_TEMPLATES` in `shared/ana/ind-module-authoring.ts` | It held 2.5.1–2.5.6 and 2.7.1–2.7.4 only: no 2.5.7, 2.7.5 or 2.7.6. Its 2.7.1 header lacked "and Associated Analytical Methods". Every header is a `required_strings` entry, so the verify step required the document to carry the wrong heading. (The check matches by substring and the short title is a prefix of the full one, so a document with the full title also passed; the defect was that the scaffold emitted the short title and nothing caught it.) |
| `draft_clinical_overview_m2_5` (outline mode) | Six sections inline in the handler, `AnaToolExecutor.ts` | No 2.5.7 and no 2.5.6.1–2.5.6.5. Its guidance and page counts were its own, beside the record's briefs and word ranges. |

**What replaced each:**
- **`IND_MODULE_TEMPLATES`** is the headings the record holds directly below 2.5 and 2.7, from `ctdRecordSubtree`.
  Each one's header is its code and the record's title.
  - A section's id is now its CTD code.
  - The ten former ids (`overview_efficacy` …) are still accepted on a fact, through `formerId`.
  - The module moved to `server/services/ana/ind-module-authoring.ts`, beside the record it now reads. Nothing in
    `client/` or `shared/` imported it (`git grep ind-module-authoring -- client shared` returns nothing). Its
    header's mention of a "Document Studio client affordance" described no code.
- **The clinical overview outline** is `clinicalOverviewOutline()` in `server/services/ana/clinical-overview-outline.ts`.
  It reads the Clinical Overview the template library serves (`getDocumentTemplate('clinical_overview')`): the same
  outline the Authoring picker and `get_document_template` serve.
  - A briefed heading's guidance is its brief's full key content, and `target_words` is the brief's word range.
  - Any other heading carries the served purpose line.
  - The handler loads the module lazily, as it already loads the template library.

**P-47 parity, function by function:**

| Function | Before | Now |
|---|---|---|
| Plan sections for 2.5 and 2.7 | 6 and 4 hand headers | 7 and 6, from the record |
| Place a fact in its section | by snake id | by CTD code, or by the former snake id |
| `required_strings` (headers and figures) | `deriveIndRequiredStrings` | unchanged; headers are now the record's |
| Self-check and sealability | `evaluateIndModuleVerification`, `assessIndModuleSealability` | unchanged |
| `sectionsWithoutFacts` | snake ids | CTD codes (a contract change, pinned in `ind-module-tool.test.ts`) |
| 2.5 outline: numbers and titles | 2.5.1–2.5.6, hand copy | 2.5.1–2.5.7 and 2.5.6.1–2.5.6.5, the served outline |
| `cite_from_module` (2.5.2→2.7.1 … 2.5.5→2.7.4) | inline | carried over, as `CITES`; each target is a record heading |
| Section guidance | one hand sentence each | the record brief's full key content |
| Length | "Typically 2-3 pages" (2.5.1), "3-5 pages" (2.5.6) | the brief's word range (`target_words`); the record's figure replaces the hand one |

The hand guidance's phrases, mapped to the record's briefs:
- **2.5.1** "background, therapeutic options, unmet need, scientific rationale": in the 2.5.1 brief. "Cite key external
  references": 2.5.7 Literature References is now a section.
- **2.5.2** "formulation development, bioavailability, food effect, IVIVC": in the 2.5.2 brief, as formulation
  history, BA, food effect and IVIVC.
- **2.5.3** "PK/PD, dose-response, special populations, DDI": in the 2.5.3 brief.
- **2.5.4** "endpoints, subgroups, sensitivity analyses, robustness, durability": in the 2.5.4 brief. Sensitivity
  analyses are under estimand and missing-data handling; robustness is under consistency of effect.
- **2.5.5** "exposure, AEs, SAEs, deaths, special-interest events, lab abnormalities, risk minimisation,
  contraindications/warnings": in the 2.5.5 brief. Contraindications and warnings are under anticipated labelling
  risks.
- **2.5.6** "integrated benefit-risk, explicit conclusion, residual uncertainties": in 2.5.6.4.
  - **"Post-approval commitments" is not carried over.** It was a hand phrase with no source. The record's 2.5.6.4
    names risk management (labelling, monitoring, pharmacovigilance, REMS). Adding the phrase to the record would
    need a verbatim read of M4E(R2) first.

**Red first:** `c4-ana-tools-red.txt` was run after a pure move and extraction, before any derivation. 4 of 4 red:
- 2.5 had no 2.5.7;
- 2.7 had the short 2.7.1 title and no 2.7.5 or 2.7.6;
- a fact by CTD code was not placed;
- the 2.5 outline stopped at 2.5.6.

All four pass after the derivation.

**Pins moved on purpose:**
- **`ind-module-tool.test.ts`.** `sectionsWithoutFacts` is now codes: `['2.5.1', '2.5.2', '2.5.6', '2.5.7']`. The
  checked count is the template's length plus one, not a literal 7.
- **`new-tool-handlers.test.ts`.** The 2.5 outline is seven sections, with 2.5.7.
- **`ind-module-authoring.test.ts`** moved with its module. Its uniqueness check reads `code`.

**Gates:**
- the six test files that name either tool or its definition module (`describe-capabilities-description-says-configured-can-be-tried`,
  `ind-module-tool`, `medical-writing-review-tool`, `new-tool-handlers`, `submission-context-block`, `tool-plan-labels`):
  119 pass. The C4a test, `ind-module-authoring.test.ts` and `ind-module-tool.test.ts` run together: 39 pass. (Corrected
  2026-10-26: this line first read "the six test files … plus the C4a test: 119", a file set no run had; review
  `wf_4db15643-511`.)
- typecheck: 0 errors;
- ESLint: no new warnings (the two existing file-length warnings remain);
- unreferenced modules: 75, at baseline.

## C4b — the deterministic Module 2 composers head each section as the record does

**What the duplicate was.** `server/services/m2-summary-builders.ts` composes 2.3, 2.4, 2.5 and 2.7 from recorded data
for the submission package, the submission orchestrator route and AnA's `draft_*` tools. Each composer typed its
headings by hand:

| Composer | What the hand copy got wrong |
|---|---|
| 2.3 QOS | "2.3.P.1 Description and Composition". The record: "Description and Composition of the Drug Product". |
| 2.4 Nonclinical Overview | "2.4.1 Overview of Nonclinical Testing Strategy". The record: "Overview of **the** Nonclinical Testing Strategy". No 2.4.6. |
| 2.5 Clinical Overview | No 2.5.7. |
| 2.7 Clinical Summary | "2.7.4.1 Exposure to the Investigational Drug". The record: "Exposure to the Drug". The SAE and death counts sat under "2.7.4.3 Serious Adverse Events and Deaths", but the record's 2.7.4.3 is Clinical Laboratory Evaluations. No 2.7.6. |

**What replaced it.** `heading(code)` reads the record's number and title, through `ichHeadingTitle`. It throws on a
code the record does not hold, so a composer cannot invent one. The first level below a module stays in capitals,
the composers' house style. `QOS_SECTIONS` lost its `heading` field: `qosHeading('3.2.S.4')` is the record's 2.3.S.4.

**What changed in the composed text:**
- **2.7.4.2** now opens 2.7.4.2.1 Analysis of Adverse Events, with these under it:
  - 2.7.4.2.1.1 Common Adverse Events (the ≥5% statement, unchanged);
  - 2.7.4.2.1.2 Deaths (the death count);
  - 2.7.4.2.1.3 Other Serious Adverse Events (the SAE count).
  Whether a study's SAE count includes its fatal events is not recorded, so when any death is recorded the SAE line
  says so. When the counts were not extracted, both sections print the existing "not extracted" statement.
- **2.4.6 and 2.5.7** say that no literature is cited in the composed overview, and where copies are filed (Module 4.3,
  Module 5.4).
- **2.7.6** says the study synopses are not composed. That is now an open item, in `gaps` and in the narrative's
  "Open items" line. Completeness is unchanged: it counts the data sections 2.7.1–2.7.4.

**P-47 parity.** Every composed paragraph, table, gap and completeness figure is kept. The only text that moved is the
SAE and death statement, from a wrong number to the record's two sections. Three headings were added, and one open
item (2.7.6).

**Not changed, and why:**
- **The QOS part headings "2.3.S DRUG SUBSTANCE" and "2.3.P DRUG PRODUCT".** The record titles 2.3.S and 2.3.P
  "Quality Overall Summary — Drug Substance/Product". That reads as a platform label, not the guideline's heading;
  from recall, M4Q's is "2.3.S DRUG SUBSTANCE (NAME, MANUFACTURER)". Copying the label into the composer would make
  it less right. Correcting the record changes every reader of it (the served QOS outline, AnA's chat outline,
  drafting's title match), so it needs a verbatim read of M4Q(R1) first. The test names the two codes as owed.
- **2.3.A and 2.3.R.** The QOS composer summarizes 2.3.S and 2.3.P only, because Module 3 composition is P-28
  small-molecule (3.2.A has no composer input).
- **2.7.4.3–2.7.4.7.** These are not composed, because no CSR field the composer receives reaches them (labs, vital
  signs, special groups, post-marketing). That is unchanged.

**Red first:** `c4b-m2-composers-red.txt`: 7 of 9 red on `93e989df3`, before the derivation:
- the three wrong titles;
- the missing 2.4.6, 2.5.7 and 2.7.6;
- no Deaths or Other SAEs section.

All 9 pass after.

**Gates:**
- **The 54 test files that reach the composers.** 865 of 869 pass. The 4 failures are in two suites,
  `tests/unit/orchestrator-dry-run-identity.test.ts` (applicant identity, P-27) and
  `tests/golden-journeys/submission-release-signature.journey.test.ts` (release signature). With
  `m2-summary-builders.ts` put back to HEAD, the same 4 fail, so they predate this change and are not touched by it.
- typecheck: 0 errors.
- ESLint ratchet `--since origin/concept2cure-v2`: no file changed its warning count (C4a and C4b together).

**More copies found while tracing these headings**, for a later slice: `db/migrations/100_regulatory_templates.sql`
and `101_complete_template_catalog.sql`. Both are manual-only: on no deploy applier
(`docs/evaluation-2026-09/evidence/03-applier-reachability.json`, `manualOnly`). Also `scripts/seed-ectd-templates.js`
and `scripts/add-ind-templates.js`, which are laptop seeds. Each carries its own Module 2 heading text. Whether
anything reads the table they seed is the inventory's question.

## C4c — what the adversarial review of C4a and C4b found, fixed

**The review.** Workflow `wf_4db15643-511` ran four read-only lenses over `93e989df3` and `79d9913f1`: callers and
contracts, regulatory accuracy, honesty and fail-closed, and tests and evidence. A skeptic per lens tried to refute each
finding. 22 findings came back, 15 confirmed; they reduce to seven defects:

| # | Defect | Where | Fixed by |
|---|---|---|---|
| 1 | AnA's 2.4 draft with findings appended "2.4.4.1 TARGET-ORGAN ADVERSITY PROFILE" after the whole overview. The record holds no 2.4.4.1, and since C4b the text landed after 2.4.6 List of Literature References. The invented code predates C4b; C4b moved it further out of order. | `preclinical/nonclinical-m24-adapter.ts` `buildEnrichedM24` | The composer takes `targetOrganProfile` (`M24BuildContext`) and prints it inside 2.4.4, unnumbered, before 2.4.5. The adapter stops appending. |
| 2 | `plan_ind_module_authoring` asked for "its CTD code" but placed a fact only on an exact first-level code. A fact named 2.7.4.2.1.2 was dropped, its section read "NO SOURCE FACT SUPPLIED", and a short value could still pass the substring check. | `ana/ind-module-authoring.ts` `factsFor` | A fact belongs to the section whose code contains its code (`ctdCodeWithin`), and keeps its own code in the bullet. A fact that fits no section is returned as `unplacedFacts`; the tool reports it in `honesty.unplacedFacts` and as a blocker, never silently. |
| 3 | The literature placeholders (2.4.6, 2.5.7) said "No literature is cited", beside caller text (2.5.1's `developmentRationale`) that can cite. 2.7.5 said "See Module 5.4 for the integrated reference list"; the record's brief says 2.7.5 is the list and 5.4 holds the copies. | `m2-summary-builders.ts` | One wording, true whatever the input: the composer cites nothing of its own; list here every reference the document cites; copies are in Module 4.3 or 5.4. |
| 4 | 2.7.6 asked for each report's synopsis to be included. The record's 2.7.6 brief leads with the Listing of Clinical Studies and says a US eCTD links to the synopses rather than repeating them. | same | The placeholder and the open item now say so. |
| 5 | The record's headings the composers do not write were not open items, so the list read as if only 2.7.6 were missing. | same | `notComposed(root, COMPOSED_xx)` derives them from the record: unconditional headings not written whose parent is written, as runs in CTD order. A conditional heading (2.5.6.5, 2.7.4.6) is not an open item. 2.5 now names 2.5.6.1–2.5.6.4; 2.7 names 2.7.1.1–2.7.1.4, 2.7.2.1–2.7.2.5, 2.7.3.1–2.7.3.6, 2.7.4.1.1–2.7.4.1.3, 2.7.4.2.1.4–2.7.4.5 and 2.7.4.7. Completeness is unchanged: it counts the composed data sections. |
| 6 | The outline mode served the briefs and word targets without the template's own limits ("Scale content to the development phase …") or its basis note, and told the model to draft "to its guidance and target_words" for a program with no clinical data. The skeptic marked this not a defect (the old outline carried neither); it is fixed anyway, because the served template has them. | `ana/clinical-overview-outline.ts`, the handler | `clinicalOverviewLimits()` returns the template's `outline_limitations` and basis, and the handler's `next_step` says the briefs are for a marketing application, content scales to phase, and a section with no data is stated as such. |
| 7 | Two descriptions promised the old shape: `draft_clinical_overview_m2_5` ("the 2.5.1–2.5.6 narrative", "the six-subsection outline") and the 2.5 composer's docstring. | `legacy-import-tool-defs.ts`, `m2-summary-builders.ts` | Both name 2.5.1–2.5.7 and the 2.5.6 subdivisions. `plan_ind_module_authoring`'s `section_id` says a code below a section is accepted and an unplaced fact is reported. |

Also corrected: the C4a gate sentence above, and a parenthetical on the C4a table's verify claim.

**Refuted by the skeptics, and left:**
- "0 death(s)" with no study recorded: only the standalone `/m2/clinical` route allows an empty set, and nothing calls it.
- The 2.4.1–2.4.6 numbering as convention rather than ICH M4S: already recorded as recall with a verbatim read owed (the
  network refuses the guideline hosts; task 17).
- No test of the not-extracted branch: refuted as a defect, but a case was added.

**Red first:** `c4c-review-red.txt`: 14 of 14 new cases red on `805efa13d` (trunk, C4a and C4b as pushed), each on the
defect it names. All pass after.

**Pins moved on purpose:**
- `m2-summary-builders.test.ts`: the 2.5 gaps add the not-composed item, `headings of 2.5 this composer does not write: 2.5.6.1–2.5.6.4`.
- `ind-module-tool.test.ts`: an unplaced fact is a fourth blocker, after the three it already had.
- `nonclinical-m24-adapter.test.ts`: the profile is "Target-organ adversity profile: …" inside 2.4.4, and no "2.4.4.1" appears.
- `new-tool-handlers.test.ts`: the outline carries `outline_limitations`, and `next_step` no longer says "to its guidance and target_words".

**Gates:**
- the 66 test files that reach the changed code: 1,261 of 1,265 pass. The 4 failures are the same two pre-existing
  suites as in C4b (`orchestrator-dry-run-identity`, `submission-release-signature` journey), which fail identically
  without these changes.
- typecheck: 0 errors.
- ESLint ratchet `--since origin/concept2cure-v2`: no file changed its warning count.

## C5/C6 — the duplicates inventory, executed slice by slice

**The inventory.** Workflow `wf_0f8a9a31-23c`: six read-only sweep lenses (content, names, routes, client, AnA, dead code
with history), 194 candidate files, seven area verifiers that re-derived each candidate's reachability and P-47 parity,
and a planner that ordered 60 slices (`S01`–`S60`), five founder-decision slices (`GF-1`–`GF-6`) and twelve handoffs to
the client-journey session (`H1`–`H12`). The plan is filed beside this README as `inventory-plan.md`. Each slice below
is one commit; its red file is `sNN-red.txt`.

### S01 — `ci:unkeyed-request-tables`: the stale `ectd.module_structure` entry

**Cause:** D1 (`3c394edb3`) deleted `server/api/ectd/routes.ts`, the last server reader of `ectd.module_structure`
(`git grep module_structure -- server` returns nothing). The gate fails on a stale baseline entry, and it runs in CI
(`ci.yml`), not in the pre-push hook, so D1 pushed green and left this red.

**Change:** the entry is removed from `scripts/ci/unkeyed-request-tables-baseline.json` and `total` goes from 90 to 89.
The tables stay (Rule 1).

**Red first:** `s01-red.txt` (exit 1, "Stale baseline entries … ectd.module_structure"). After: exit 0, 89 baselined.

### S02 — delete the MDX `TemplatesSurface`, replaced by Authoring → New document → Start from

**What already exists:** `AuthoringCreateExport.tsx` with `AuthoringTemplatePicker.tsx`, reading
`GET /api/authoring/templates` (`builtin-authoring-templates.ts`). The earlier generation of this surface,
`mdx/surfaces/TemplatesSurface.tsx`, was deleted in `e5a74a4df`. `62a8d5e7f` (2026-10-23) moved this one out of
`Workbench.tsx` into its own file with a new hook, and nothing outside tests imported either.

**Deleted:** `mdx/workbench/TemplatesSurface.tsx`, `mdx/hooks/useWorkbenchTemplates.ts`, their two tests, the
`TemplatesSurface` case of `workbenchNoFixtures.test.tsx`, and `interface Template` in `mdx/data/workbench.ts` (no other
user). The `.tpl-*` CSS is the client-journey session's (H10).

**P-47 parity:**
- List the organisation's templates → the picker's search and list (`authoringTemplateSearch.test.tsx`).
- A failed read is a failure, never an empty library → `authoringTemplateSearch.test.tsx:169` ("keeps a http / network
  / malformed failure separate from an empty list").
- "New template" (a prompt to AnA) → any AnA turn; a real template is created in `TemplateLibrary.tsx`
  (`templateLibraryReal.test.tsx`).
- No user ever reached this surface.

**Red first:** `s02-red.txt`: `ci:check-client-reachability` listed three files. After: one, `workflowDecisionService.ts`,
from the 2026-10-23 device integration and outside this lens; it is reported, not deleted here.

**Gates:** the four affected client test files, 64 pass.

### S03 — delete repo-root template, policy and data files nothing loads

**Deleted (16 files):**
- `templates/module2_summary.docx.j2` and `templates/forms/form{1571,1572,3674}.docx.j2`;
- `templates/workflows/ind-workflow.yaml`;
- `templates/ectd/{fda,ema,hc,pmda}_template.xml` and `templates/ectd/0000/index.xml`;
- `policy/reg/{fda,ema,pmda}.json`;
- `server/data/{regulatory-document-requirements-matrix,ich-guidelines-comprehensive,global-regulatory-authorities}.json`.

`templates/forms/acroforms/` (the live FDA forms the form fill reads, copied by the Dockerfile) and
`templates/authoring/` are kept.

**Proof of no reader:** `s03-red.txt`. Full-path greps find no code reader. The only reader was a test case that read
`fda_template.xml` itself. `Dockerfile.optimized:217` says "the rest of templates/ is not read by the server". The
`server/data` JSON lost its reader on 2026-10-15 (`64da63f28`). `prove-module-unused.mjs` does not apply: it takes no
file arguments, and its `--controls` run fails on an unrelated control (reported).

**Changed:**
- `fda-module1-numbering.test.ts`: the "reference FDA backbone template" case and its helper go. The packager's
  Module 1 placement is proven by the same file's other cases.
- Comments in `registryCoverage.ts`, `market-submission-specs.ts` and `check-image-runtime-assets.mjs` no longer name
  the deleted files.

**P-47 parity:** none of these files was loaded, so no function is lost:
- Module 1 → `shared/regulatory/regional-module1.ts`;
- Modules 2–5 → the record;
- backbones → the eCTD compile;
- forms → `ind-form-fill-service.ts`;
- authorities → `market-submission-specs.ts`.

**Gates:** `fda-module1-numbering` and `registryCoverage`, 207 pass; `check-image-runtime-assets`, exit 0.

### S04 — delete the laptop-only CTD seed scripts

**Deleted:** `scripts/seed-ectd-templates.js`, `scripts/create-complete-ectd-templates.cjs`,
`scripts/add-ind-templates.js`, `scripts/populate-ectd-modules.js`.

**Proof of no caller:** `s04-red.txt`. No npm script, workflow, hook, `.replit` or Makefile names them. The only mention
is a header comment in `scripts/seed-mdx-templates.mjs`, now reworded. Under Rule 1, reference data reaches a deployed
database only through a migration; these never did.

**P-47 parity:**
- CTD outlines → `builtin-authoring-templates.ts` (`builtin-authoring-templates.test.ts`).
- The module tree → the record.
- `ectd_templates` stays live for tenant rows (S59).
- Not carried over: their Module 1 contradicts FDA's ("1.0 Cover Letter", "1.2 Introductory Statement").

### S05a — delete the off-applier CTD seed migrations, replaced by the record and `builtin-authoring-templates.ts`

**Applier check first (Rule 1).** The plan grouped `038_gcc_ectd_seeder_service.sql` with these. It is not off every
applier: `install-fresh` step 6 applies every `db/migrations/*_gcc_*.sql`, and so do the CI psql loops. 038 is
therefore its own slice (S05b), with the two live-schema baselines that name its objects. The files here are on no
applier:
- 100–103 do not match the `*_gcc_*` filter (`install-fresh.mjs:1483`).
- `_legacy/043` is in a subdirectory the step does not read.
- None is in `C2C_MIGRATION_FILES`.
- `scripts/db_migrate.sh` would glob 100–103, but nothing runs it.

**Deleted:**
- `db/migrations/{100_regulatory_templates,101_complete_template_catalog,102_load_all_templates,103_load_complete_templates}.sql`.
  Under `db_migrate.sh` the last three would `DELETE FROM ectd_templates` for organisations 1, 6 and 7.
- `db/migrations/_legacy/043_gcc_ectd_expanded_modules.sql`.
- `tests/schema-contract/regulatory-templates-cite-q2r2.contract.test.ts`, which read 100.

**Carried over:** the Q2(R2) pin now reads the record: `tests/regulatory/record-cites-q2r2.test.ts`. No brief cites
Q2(R1), and 3.2.S.4.2/3, 3.2.P.5.2/3 cite Q2(R2). It is green on HEAD, so `s05a-red.txt` shows it failing on a
planted "Q2(R1)", with the record restored after.

**Changed:** `migrations_manifest.json` drops the five files: the 043 conflict entry, the regulatory group entry and
the execution order. It was re-synced with `npm run db:sync-manifest` (292 files) and `db:sync-manifest:check` passes.
No DROP is appended (Rule 1); `ectd_templates` stays.

**Gates:** all exit 0:
- `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:unkeyed-request-tables`;
- `check-duplicate-table-ddl`, `check-migration-reachability`, `check-journey-migration-reachability`;
- the manifest tests and the new pin: 19 pass.

Not green, and not this slice's: `tests/ops/apply-c2c-migrations-manifest.test.mjs` has 8 passing and 2 failing tests.
- Case 5: `20261014_qms_controlled_authoring_content.sql` is on the applier list without a `to_regclass` guard.
- Case 10: `20260702_usage_model_credit_ledger.sql` is in both the allowlist and `KNOWN_UNLISTED`.

Neither names a file this slice touched, and neither reads the gcc manifest. Both are reported to their owners (QMS
authoring; usage ledger).

### S06 — delete dead server CTD modules, replaced by the record path

**Deleted:**
- `server/config/regulatory_config.js` and `.d.ts`. Re-exported by `server/config/index.ts` and imported by nothing.
  Its CTD pattern was malformed and never matched.
- `server/utils/ichSchema.js`, `server/utils/validateZip.js` and `tests/unit/validate-ich-structure.js`, which only
  import each other.
- `server/services/documents/ArtifactSkeletonGenerator.ts`, reached only through the `server/services/index.ts`
  barrel and its `'documents.skeleton'` registry entry.
- `server/services/regulatory/registry/adapters/usIndFromExistingSections.ts`. Its only caller,
  `getUSIndSectionBlueprint`, had none, and goes with it. `US_IND_TASK_BLUEPRINT` stays.

**Proof:** `s06-red.txt`. Every name's remaining mentions are a barrel, a registry map entry, a baseline entry or the
deleted test. The unreferenced-modules baseline loses `validateZip.js` (75 → 74). `yup` stays for a dependency pass.

**P-47 parity:** no function had a caller.
- CTD heading lookups → `ichHeadingTitle` (`ich-m4-headings.test.ts`).
- eCTD structure validation → `ectd-structural-validator.ts` (`submission-orchestrator.test.ts`).
- Skeletons → the Authoring picker's outlines (`builtin-authoring-templates.test.ts`).
- The US IND outline → the `ind:fda` pack scaffold (`c2c-project-scaffold.contract.test.ts`).

**Gates:**
- `ci:unreferenced-modules`: 74, at baseline;
- `service-registry-names-only-existing-modules` and the route-bundle tests pass;
- typecheck: 0 errors.

### S07 — delete dead exports inside live CTD files

**Deleted:**
- **`server/services/regional-ctd-templates.ts`:** `getAllRegionalTemplates`, `getModule1Sections`,
  `getSupportedAgencies` and `getMultiAgencyCTDStructure` (a hand-typed Module 2 list). Also the default export that
  re-exposed them; every importer of the file uses named imports.
- **`server/services/templateService.ts`:** `initializeDefaultTemplates`.
- **`services/regulatory/ind-ectd-sections.ts`:** `getAIDraftableSections`, `getSectionsForPyramidTask` and
  `pyramidToECTDMap`. `buildINDPackageDefinition` and `INDPackageDefinition` lose `export`; they are used only inside
  the file.
- **`services/regulatory/pyramids/ind-pyramid.ts`:** `IB_BINDINGS` loses `export`.

**Proof:** `s07-red.txt`. Each symbol's only references are its definition, a use inside its own file, or the unused
default export.

**Not deleted, correcting the plan:** `docx/templateRegistry.ts` `indTemplate` ('ind-fda').
- It is registered in the map that the tool registry reads (`server/services/tools/index.ts`:
  `documents.list_templates`, and `documents.generate_docx` with `templateId`).
- That registry is loaded by `/api/cortex-unified` and the MCP server, so the template is reachable.
- It is a heading copy ("Nonclinical Summaries", "2.7 … required: false"), so it moves to Tier C as a convergence onto
  the record, not a deletion.

**P-47 parity:** none of the deleted functions had a caller.
- Module 1 → `regional-module1.ts`;
- Modules 2–5 → the record;
- IND sections → `getAllINDSections` and `getRequiredSections` (kept).

**Gates:** typecheck: 0 errors. The 22 test files that name these modules: 383 pass.
