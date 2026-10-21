# D2 · Filing document classes, increment 3: CTD Module 2 components from the one record — 2026-10-20

**Row moved:** D2. **Workstream:** W1. **Scope rule kept:** no new surface, route, table, tool or
model. Each change completes, converges or reaches something the platform already has.

The filings in scope: `ICH_NONCLIN_OVERVIEW` (2.4), `ICH_CLIN_OVERVIEW` (2.5),
`ICH_NONCLIN_SUMMARY` (2.6), `ICH_CLIN_SUMMARY` (2.7), plus `ICH_QOS` (2.3), `ICH_M3_DS` (3.2.S)
and `ICH_M3_DP` (3.2.P).

## What already exists (CLAUDE.md Rule 3)

A five-lens, read-only sweep was run before any design: server, client, outlines and packs, AnA,
and full history, the last from a blobless clone of origin. A synthesizer re-read the key rows. It
was run at `dd836863` on 2026-10-20 (workflow `wf_ca13daba-51c`). In short:

| Exists | Path | What it does today | What it does not do |
|---|---|---|---|
| The one ICH M2–M5 record | `server/services/ind/ctd/authoring-guidance.ts` (`CTD_AUTHORING_GUIDANCE`) + `ich-m4-headings.ts` (`ICH_M4_HEADINGS`) | Holds 2.4.1–2.4.6, 2.5.1–2.5.7, 2.6.x including 2.6.4.1–10 and 2.6.6.1–10, and 2.7 down to 2.7.4.2.1.5. The 2.5.6 brief names 2.5.6.1–2.5.6.5. | Had no heading rows for 2.5.6.1–2.5.6.5. Lacks the QOS (2.3.S.x/2.3.P.x) and Module 3 depth, which its header assigns to the CMC lane. |
| Template library | `server/services/market-specs/document-template-library.ts` (`DOCUMENT_TEMPLATES`, `REGISTRY_COMPONENT_TEMPLATES`, `getRegistryDocumentTemplate`) | Is the outline the Authoring picker, `get_document_template`, AnA drafting and every class pack read. | Kept 2.4, 2.5 and 2.7 as hand copies of their first level: 6, 7 and 6 headings. |
| 2.6 outline | `server/services/regulatory/registry/blueprints/nonclinicalSummaryBlueprint.ts` | The one record projection for a component: 2.6 from the guidance half, checked 2026-10-07. | Read the guidance half only, so it had no 2.6.4.x or 2.6.6.x. Its own test said to add them "with that table" once they existed. |
| Lifecycle-record outlines | `server/services/market-specs/lifecycle-record-outlines.ts` | The precedent that records win over hand copies (PAS, CBE, annual reports, meetings). | Covers no CTD component. |
| Single-document projects | `shared/regulatory/filing-document-classes.ts`, `server/services/c2c/filing-class-packs.ts`, `scripts/db/emit-filing-class-packs.ts` | 21 classes. The CSR, protocol, IB, SAP, ICF and DSUR are ICH classes, author-only. | Has none of the seven, so the wizard routes them to `nda` + ICH / Global, which is not offered. |
| Authoring inside a project | `AuthoringCreateExport.tsx` + `builtin-authoring-templates.ts`; `IndDocumentLibrary.tsx` + `ind-template-outlines-m2-m3.ts`; `askAnaToDraft.ts` → `ana-ri/stream.ts`; `FileToVaultDialog.tsx` | Lets a person start any of the seven from Start from, draft each section with AnA, and file it to the Vault. | Has no project whose scope is the one document, and no governed outline. |
| AnA composers | `m2-summary-builders.ts`; `draft_clinical_overview_m2_5` and `draft_clinical_summary_m2_7` (from the program's CSR builds); `draft_quality_overall_summary_m2_3` (composition boundary) | Compose deterministically from the program's own data. | Save nothing. The QOS composer is US IND small molecule only (P-28). |
| CMC / Module 3 | `server/services/cmc/composition-scope.ts`, `module3-compile.ts`, `place-module3-into-submission.ts` | The one Module 3 path, for an in-scope US IND. Its refusal points to Authoring and the Vault. | Has no standalone DS/DP document. |
| Standalone Module 3 | US DMF / EU ASMF → `dmf` → `mod3:ich` (`document-class.ts`) | Is the existing standalone drug-substance project. | Is four flat rows. |
| Deleted | `client/src/concept2cure/authoring/` (Phase 9, `2895218b8`); `Module2SummaryPage.jsx` and siblings (`83fa7f6cf`); `CTDProjectWizard.tsx` (`8ba28dc0d`); `/m2/qos` (2026-10-05) | — | Each was flat, fixture-backed or unreachable when deleted. None is rebuilt here. |

The sweep also found about ten hand-kept heading copies of these documents outside the template
library, and they disagree with the record:
- `ana-ri/document-templates.ts`;
- `shared/ana/ind-module-authoring.ts`;
- the inline 2.5 outline in `AnaToolExecutor.ts`;
- `ctd-module-structure.ts`;
- `template-seeds.ts`;
- `ectd-fallback-templates.ts`;
- others.

This increment does not extend any of them. Converging them onto the record is a later step.

Decisions that bind this work:
- P-28, the composition boundary;
- "One Module 3 path";
- "One ICH M2–M5 record";
- P-14 and `FILING_SPINE.md`: Modules 2–5 are written once, in the application project;
- `WORKFLOW_DECISION_2026-10-08.md`: never offer a filing the platform cannot finish;
- Rule 1: a changed outline is a new pack version.

## a. Complete the component outlines from the record (3a)

- **Record, completed:** `ich-m4-headings.ts` gains 2.5.6.1, 2.5.6.1.1, 2.5.6.1.2, 2.5.6.2,
  2.5.6.3, 2.5.6.4 and 2.5.6.5, the M4E(R2) benefit–risk subdivisions. The record's own 2.5.6
  brief already named all seven.
  - The numbers and wording were matched against a search extract of the table of contents of
    FDA's hosted M4E(R2) copy, 2026-10-20. The regulator hosts (database.ich.org, hhs.gov) do
    not resolve from the build environment, so the basis is `recall` and its note says a
    verbatim re-read is owed.
- **Converged:** `ctd-component-outlines.ts` (new, 135 lines with comments) projects the record's
  subtree, nested by code. `DOCUMENT_TEMPLATES` `nonclinical_overview`, `clinical_overview` and
  `clinical_summary` now *are* that projection; the hand copies are deleted.
  - Purposes are the record's own words: a briefed code's key content, or a structural
    heading's line from its ancestor's brief, attributed ("From the 2.5.6 brief: …").
  - Required: a brief that names a submission. A structural heading takes its ancestor's flag.
- **Completed:** `nonclinicalSummaryBlueprint.ts` reads both halves, via `ctdRecordSubtree('2.6')`.
  - Its basis is now `recall`. 2.6.1–2.6.7 were checked on 2026-10-07; the new leaves rest on a
    search extract, and an outline is only as checked as its rows. The note says both.

| Outline | Nodes before | Nodes now |
|---|---|---|
| 2.4 Nonclinical Overview | 6 | 6 (same headings, now read from the record) |
| 2.5 Clinical Overview | 7 | 14 (2.5.6.1–2.5.6.5 nested under 2.5.6) |
| 2.6 Nonclinical Summaries | 14 | 34 (2.6.4.1–10, 2.6.6.1–10) |
| 2.7 Clinical Summary | 6 | 49 (to 2.7.4.2.1.5) |

Red first: `component-outlines-red-before-wiring.txt`. Six of 20 cases failed before the library
and the blueprint read the record; all 20 pass after.

## b. AnA drafts every section of those outlines from the record

On the deepened outlines, 125 drafting requests did not resolve correctly
(`component-drafting-red-before-fix.txt`, which lists each request):

- **56 got no requirements at all.** Asked by heading alone ("Benefit-Risk Assessment",
  "Pharmacology"), a structural heading was not found, because the title index reads the
  guidance half only.
- **57 were flagged as a title mismatch.** "2.7.4.2.1.2 Deaths" is the record's own number and
  title, but the code check compared against the guidance half only.
- **12 were refused as outside the 2.6 outline.** "Absorption" is a row of that outline, but
  the scoped path asked the record-wide index first.

The fix is in `AnaDocumentDraftingService.ts`:

- `recordTitle` reads both halves of the record, for the mismatch check and for candidate
  listings.
- `componentOutlineCodes` answers a title from the component's served outline. Only an outline
  read from the CTD record qualifies.
- A title the outline holds more than once ("Appendix" is 2.7.1.4, 2.7.2.5, 2.7.3.6 and
  2.7.4.7) is listed. It is never resolved to the first.
- The 2.6 scoped path asks the outline's rows before the index.

All 26 cases of `tests/regulatory/ctd-component-outlines.test.ts` pass.

## c. A regression from increment 2c, found and fixed here

`server/routes/__tests__/globalBiotechTemplateEditor.pglite.integration.test.ts` had been red on
trunk since `ac1fcf70` (2c): it failed with "expected [ …(21) ] to deeply equal [ …(10) ]". That
increment made the picker's document carry the whole outline, front matter and subsections
included, and that behaviour is pinned by `builtin-templates-carry-whole-outline.test.ts`. This
test still compared the saved sections with the top level only. It now compares them with every
node of the outline; 20/20 pass.

## d. Gates (3a)

- **Typecheck:** `typecheck-no-regression --incremental`: 0 errors, baseline 0.
- **ESLint on the changed files:** 6 warnings, all already present (unused type imports and
  max-lines in `AnaDocumentDraftingService.ts`).
- **Affected suites:** every test file that names these outlines, the record, the drafting
  service, the picker or the packs. That is 114 files and 2,468 tests: 2,460 pass and 8 fail.
  - The 8 also fail on trunk without this change: `authoringSectionCheckRecord` (5),
    `authoringTemplateStartFrom` (2) and `ind-pharmacology-leaf-drafting` (1).
  - The last one pins an old snapshot of the record (115 heading rows; trunk had 121 before this
    change).
