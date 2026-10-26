# Rule 2 · S2: AnA's Module 2.4 and 2.6 drafts stop composing from model-written studies

**Rule:** CLAUDE.md Rule 2: "Numbers, verdicts and governed content come from
deterministic engines; the model narrates."
**Audit:** the Rule 2 audit of AnA tools that compose or decide from figures the
model supplies (`../design.md`), slice S2. It is also increment 3b Slice 2 of the
D2 filing-type work (`docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/increment-3/3b-plan.md`).
**Date:** 2026-10-26.

## The defect

`draft_nonclinical_overview_m2_4` and `draft_nonclinical_summaries_m2_6` took a
`studies[]` and a `findings[]` array in the tool input. The model writes that
input. The handlers passed it to the deterministic composers (`buildEnrichedM24`,
`buildM26NonclinicalSummaries`) and returned the result as the sponsor's nonclinical
program. Every value in the draft came from the conversation:
- each NOAEL, species, duration and GLP status;
- each adversity class;
- each row of the 2.6.7 toxicology table.

The engine was deterministic, but its inputs were not. A figure the model
invented or misremembered came out as a composed Module 2 draft with a
completeness score.

Module 2.5 and 2.7 had the same shape until 2026-10-05, and were fixed by
`module2-csr-inputs.ts`.

## What already exists (Rule 3)

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| Compose-from-the-record pattern for 2.5/2.7 | `server/services/ana/module2-csr-inputs.ts` (3b Slice 1, `461f00e9a`) | Resolves the open project as the person asking, reads its completed CSRs, and refuses supplied figures as `ignoredSuppliedFigures` | Its project boundary was private to it |
| CSR scope | `server/services/csr/project-scope.ts` `resolveCsrScope` | Resolves the integer project (or program uuid) with the project-access check | — |
| 2.5 outline mode | `server/services/ana/clinical-overview-outline.ts` (C4a) | The served 2.5 outline with each heading's key content | Covered 2.5 only |
| The one ICH M2–M5 record | `getDocumentTemplate('nonclinical_overview')` and `getRegistryDocumentTemplate('ICH_NONCLIN_SUMMARY')` in `server/services/market-specs/document-template-library.ts` | Serve the 2.4 and 2.6 outlines from the record (`ctdRecordSubtree`) | — |
| The composers | `preclinical/nonclinical-m24-adapter.ts` `buildEnrichedM24`, `preclinical/m26-nonclinical-summaries.ts` | Compose 2.4/2.6 from a study set | They are correct, and they are kept; the defect was where their input came from |
| A nonclinical record per project | — | **None exists.** `ctd_nonclinical_studies` is keyed to a `ctd_programs` id, and nothing maps a project to one. The governed `nonclinical_studies` register is outside the launch catalog | Which store 2.4/2.6 read is founder decision R-1 |
| Hand scaffold | `server/services/templates/nonclinical-templates.ts` | `get_nonclinical_template` | Not used as an outline here; inventory S40 converges it |

**Searches run:**
- the two tool names, across code, tests and skills;
- `studies` / `findings` in `bla-biologics-tool-defs.ts`;
- `resolveCsrScope`, `scopeInputOf`, `answersBeforeOutline`;
- `ICH_NONCLIN_SUMMARY`, `nonclinical_overview`;
- `load_nonclinical_program`, `anaCanDoNow`;
- `ctd_nonclinical_studies`, `nonclinical_studies`, `listStudiesForSummary`;
- `git log --all --diff-filter=D -- '*module2*' '*nonclinical-inputs*'` (none).

Inventory-plan S44's bullet "`loadNonclinicalStudiesForProject(ctx project)`"
cannot run, because nothing maps a project to a `ctdProgramId`. This slice
supersedes that bullet; S44's other bullets stand.

## The change

The work is **converge** and **reach**: one project boundary for every Module 2
composer, and one outline helper for 2.4, 2.5 and 2.6. Nothing was rebuilt.

1. **`server/services/ana/record-source-project.ts` (moved out of `module2-csr-inputs.ts`).**
   - It holds the project boundary: the open project (a uuid `projectRef` under the v2 shell, else `projectId`), or the one named when none is open.
   - It holds the `cross_project` refusal (P-14), the scope-error mapping, `suppliedAny` and `answersBeforeOutline`.
   - `module2-csr-inputs.ts` is now its first consumer, with no change in behaviour: `module2-csr-inputs.pglite.test.ts` passes 6/6 before and after.
2. **`server/services/ana/module2-nonclinical-inputs.ts`.**
   - `loadModule2NonclinicalInputs` resolves the project as the actor.
   - It then answers `needs_data`: "This platform does not yet record nonclinical studies against a project…"
   - Supplied `studies`/`findings` set `ignoredSuppliedFigures`.
   - Only that branch changes when R-1 is decided (slice S14).
3. **`server/services/ana/ctd-component-outline.ts` (git mv of `clinical-overview-outline.ts`, generalized).**
   - `ctdComponentOutline(template)` serves any component outline from the record, with its limits and basis.
   - `nonclinicalOutline('2.4' | '2.6')` reads the record. The hand scaffold is not used.
   - `CITES` stays 2.5-only.
4. **The handlers (`AnaToolExecutor.ts`).**
   - Both delegate to `draftNonclinicalFromRecords`.
   - Supplied figures, or a project the person may not read, are answered as a refusal.
   - Otherwise they return `{structure, nonclinical_data, next_step}`, as 2.5 does.
5. **The definitions (`bla-biologics-tool-defs.ts`).**
   - `studies` and `findings` are removed, `required: []` is set, and `project_id` is added.
   - The description says "do not pass studies, doses, NOAELs or findings" and what is returned until studies are recorded.
6. **Text that sent figures in.**
   - The `load_nonclinical_program` definition and instruction no longer say to pass its studies to the 2.4/2.6 drafts.
   - The nonclinical skill's method steps 1, 3 and 4 are updated.
   - `biotech-program.ts` drops `draft_nonclinical_overview_m2_4` from the preclinical phase's `anaCanDoNow` until S14.

**User-visible.** Until nonclinical studies are recorded against a project (S14,
after R-1), every 2.4 and 2.6 request returns:
- the record's ICH M4S outline (2.4.1–2.4.6, or 2.6.1–2.6.7 with the 2.6.4.x and 2.6.6.x headings);
- each heading's key content;
- a statement that no study is recorded.

It states no study, dose, NOAEL or finding.

## Proof

`server/services/ana/__tests__/nonclinical-drafts-refuse-model-figures.test.ts`:

| Case (each for 2.4 and 2.6) | Trunk | After |
|---|---|---|
| Studies and findings supplied: `ok: false`, `ignoredSuppliedFigures`, and neither `50 mg/kg/day` nor `hepatocellular hypertrophy` appears in the answer | **fail**: `status: 'drafted'`, composed from them | pass |
| Figures supplied, no project: `needs_project` | **fail**: drafted | pass |
| Project open, nothing supplied: the outline's codes equal `ctdRecordSubtree('2.4' / '2.6')` and `nonclinical_data.status` is `needs_data` | **fail**: `needs_parameters` | pass |
| The definitions have no `studies` or `findings`, `required` is empty, and the description says "do not pass" (≤1024 characters) | **fail** | pass |

- `red/before.txt`: 8 of 8 fail on trunk (`94d960fff`).
- `green/after.txt`: 15 files, 653 tests, all passing. The files are:
  - the new test;
  - `nonclinical-clinpharm-tools`;
  - `module2-csr-inputs.pglite` (6/6, unchanged by the refactor);
  - `ana-tools-read-the-ctd-record`;
  - both composer suites;
  - `biotech-program`;
  - the three tool-selection suites;
  - the skills suites.

**The whole AnA run** (`server/services/ana/__tests__`, the skills suites, and every suite that names a file this change touches): 439 files, 7,400 tests. The first run had 7 failures.
- **Three were this change's, and are fixed:**
  - Two were in `tool-selection-tokenize`. The new 2.6 description had dropped the codes 2.6.2/2.6.4/2.6.6, so "write sections 2.6.2 and 2.6.4" no longer routed to the tool. The description names every code again.
  - One was in `skills/library`. The method no longer said when to use `get_nonclinical_template`; step 1 says it again.
- **Four fail identically on trunk with this change stashed.** They are not this change's:
  - `ana-launch-scope` ×3: `device-510k` is now a launch surface (`62a8d5e7f`), but the inventory still files its tools, such as `write_kit_section`, as hidden.
  - `tool-selection-biotech-workflows` ×1: `get_document_template` falls outside the 50-tool budget for "help me prepare an EU clinical trial application".
  - They belong to the device integration work and are reported to the founder; this change leaves them alone.

**Moved pins.** These tests pinned the defect, and were moved, not deleted:
- `nonclinical-clinpharm-tools.test.ts`:
  - "drafts the M2.4 overview with gaps and an adversity profile";
  - "drafts the M2.6 summaries with tables";
  - "the M2.4 … drafts return the tables".
- The M2.4 composer's gaps and adversity profile were already tested in `preclinical/__tests__/nonclinical-m24-adapter.test.ts`. Its tables are now asserted there too.
- The M2.6 composer's tables are tested in `preclinical/__tests__/m26-nonclinical-summaries.test.ts`.
- The handler cases now assert the refusal.

**Gates:**
- `ci:typecheck-no-regression`: 0 (baseline 0).
- ESLint ratchet: no file changed its warning count.
- `ci:unreferenced-modules`: 74 (baseline 74).
- `manifest:ana`: regenerated (`docs/ana-capability-manifest.json`). It also picks up two earlier description edits (`get_document_template`, `draft_clinical_overview_m2_5`) that had not been regenerated. The two nonclinical tools now read `scope: project`, and `governed: false`, which is right for read-class tools that write nothing.
