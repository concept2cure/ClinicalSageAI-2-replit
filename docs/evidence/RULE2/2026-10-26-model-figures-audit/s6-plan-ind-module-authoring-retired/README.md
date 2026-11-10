# Rule 2 · S6: `plan_ind_module_authoring` is retired onto the record-composed 2.5 and 2.7 tools

**Rule:** CLAUDE.md Rule 2, and the working agreement: zero duplication, and a deletion names its replacement by path.
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **S4** (AnA the writer).
**Audit:** `../design.md`, slice S6. The coordinating session approved the slice and its file list.
**Date:** 2026-11-01.

## The defect

`plan_ind_module_authoring` planned a Module 2.5 Clinical Overview or 2.7 Clinical Summary from `facts[]` in the call,
which the model writes. The definition itself described them as "unverified caller/model-supplied facts/figures to
transcribe verbatim".

Each value went into the plan's text and into the `required_strings` its verify step asked the document to carry.
So on trunk, the model's call `{module: '2.5', facts: [{section_id: '2.5.4', label: 'Primary endpoint ORR', value:
'42.3%'}]}` came back as "## 2.5.4 Overview of Efficacy … - Primary endpoint ORR: 42.3%", with "42.3%" required in
the document.

It was offered in four places:
- the end of the IND interview ("Author IND Module 2 Narrative … from the collected facts");
- every IND chat's context block;
- three skills;
- the IND-enabling program phase.

## What already exists (RULE 3)

| Piece | Path | What it does |
|---|---|---|
| The tool retired | `server/services/ana/ind-module-authoring.ts`, its handler in `AnaToolExecutor.ts`, its definition in `evidence-literature-tool-defs.ts` | Planned 2.5/2.7 from model-supplied facts; this session last amended it (C4a `93e989df3`, C4c `900265097`) |
| The 2.5 replacement | `draft_clinical_overview_m2_5`: definition `legacy-import-tool-defs.ts`, handler `AnaToolExecutor.ts`, record source `module2-csr-inputs.ts` | Composes 2.5.1–2.5.7 from the program's completed CSRs. With none, it gives the 2.5 outline (`ctd-component-outline.ts`) read from the ICH M2–M5 record |
| The 2.7 replacement | `draft_clinical_summary_m2_7`: definition `bla-biologics-tool-defs.ts`, handler `AnaToolExecutor.ts` | Composes 2.7.1–2.7.4 from the same records, and says so when there are none |
| The 2.7 outline without a CSR | `get_document_template` (`template_id: clinical_summary`), `server/services/ana/document-template-tool.ts` | Serves the record's 2.7 outline to its depth, a superset of the planner's first level |
| The tests that prove the replacements reachable | `nonclinical-clinpharm-tools.test.ts` (the 2.7 handler: supplied figures not used, `needs_data`, composed from records); `new-tool-handlers.test.ts` and `ana-tools-read-the-ctd-record.test.ts` (the 2.5 outline with no data); `module2-csr-inputs.pglite.test.ts` (the loader both read); this slice's red test, which since the review also pins the 2.5 handler ignoring supplied figures | — |

**History search:** `git log --all --diff-filter=D -- '*ind-module*'` returned nothing before this change. No other file
imported `ind-module-authoring.ts`: `git grep` after the change finds only comments and the retirement test.

**Carried over:** the planner's sections were the record's headings directly below 2.5 and 2.7 (C4a).
- The 2.5 headings are the 2.5 tool's outline.
- The 2.7 headings are `get_document_template`'s `clinical_summary` outline. The red test's last case holds this.

**Not carried, and why:** the former section ids and the unplaced-fact report described facts the model supplied. Its
`required_strings` were the record's section headings plus each fact's value. The headings are the outlines above,
and a draft's heading coverage is `medical_writing_review`'s job, which the 2.7 skill already names. The values
were the model's.

## The change

- **Deleted:**
  - `server/services/ana/ind-module-authoring.ts`;
  - its two tests;
  - its definition, `ALL_ANA_TOOLS` entry, handler and import;
  - its register and launch-scope inventory entries.
- **Repointed to the two record tools:**
  - the IND interview's completion (two actions, 2.5 and 2.7);
  - the IND chat context block, which now also says "Do not pass results, counts or rates";
  - the IND-initial, 2.5 and 2.7 skills (the 2.7 skill adds `get_document_template` for the outline).
- **The biotech spine:** the IND-enabling phase drops the tool. The two record composers are listed in the late
  clinical phase, which produces the pivotal CSRs they read. S2 removed the outline-only 2.4 composer from the same
  list in the same way.

**Stale design note:** `docs/design/ANA_IND_COVERAGE_PLAN.md` still mentions the tool. It is a design record outside
S4, so it is left as written. The capability manifest is regenerated in the F1 commit that follows.

**User-visible:** at the end of the IND interview, in an IND chat and in the IND and Module 2 skills, AnA no longer
plans 2.5 or 2.7 from figures typed into the conversation. It offers the 2.5 and 2.7 drafts composed from the
program's completed CSRs. With no completed CSR it gives the 2.5 outline, and the 2.7 outline through
`get_document_template`.

## Proof

- `red/before.txt`: 8 of 9 cases fail on `776cb7a34`. The carried-over 2.7 outline pin passes, because the replacement
  already serves it.
- `green/after.txt`: 9 of 9 pass.
- The neighbourhood passes: 41 files, 988 tests. It covers:
  - the IND context block;
  - the CTD-record reads;
  - the three tool-selection suites;
  - tool authorization and launch scope;
  - the biotech program and the suggested actions;
  - the nonclinical/clin-pharm tools (both replacement handlers);
  - the IND tool retirements;
  - every intelligence-questions and skills suite;
  - the Module 2 composer headings.
- **Gates:** typecheck 0; ESLint ratchet unchanged; `ci:unreferenced-modules` OK.
- **`ci:step-presentation`** reports 20 risk-based-monitoring tools with no `present` block. Trunk reports the same 20
  with this change stashed, and the gate is not in pre-push. They are S8's, and the coordinator has been told.

## The adversarial review (2026-11-01), and the fixes

A read-only critic checked the plan and the landed commit `8684f0bcb`. All 18 edits and 5 pin edits were verbatim
against the base, and the result was byte-identical to the commit. It found four things, fixed in the follow-up commit:

- **An untrue test citation.** The red test's header said `nonclinical-clinpharm-tools.test.ts` "holds both handlers".
  It tests only the 2.7 handler. The header and the table above now name each handler's tests by path.
- **An untrue claim about what carries over.** The header, this README and the `8684f0bcb` message said the
  `required_strings` "all described facts the model supplied". Half of them were the record's own section headings,
  which do carry over, as the paragraph above now says. The pushed commit message cannot be changed, so this README
  corrects it.
- **An ambiguous comment.** The biotech-spine comment read as if every later phase offers the 2.5/2.7 tools. It now
  names `clinical_late`, whose deliverables are the pivotal CSRs.
- **A gap.** Nothing tested that the 2.5 handler ignores CSRs supplied in the call, and the IND intake now routes to
  it. The red test gains that case: with no project open, the handler answers `needs_project` with
  `ignoredSuppliedFigures` and does not echo the figure.

Refuted as a defect: the `Completes: server/services/ana/module2-csr-inputs.ts` trailer names a file the change does
not touch. It is valid, since it names the capability the change converges onto, and the commit also names
`AnaToolExecutor.ts`.

