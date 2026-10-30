# Complete existing clinical template drafting and source policies

## What already exists

`market-specs/document-template-library.ts` owns protocol, IB, SAP, specimen ICF, DSUR and PBRER outlines. `regulatory/templateCatalog.ts` owns exact offered metadata. Missing metadata made these complete outlines manual preparation in `authoring/builtin-authoring-templates.ts`, despite IND variants being partly narrative-capable. The existing savedSectionDraftTemplate gate correctly refused their retained manual source. Existing filing-scoped catalog mappings also omitted these clinical starts.

The same library already projects numbered/source guidance into empty editor sections; this projection is extracted without a parallel implementation into `authoring/document-template-outline-sections.ts`. Existing source-reference formats remain identical. Its exact clinical component/code policy is shared with the root-owned IND projection. Whole filings remain preparation workspaces.

Sibling-owned `us-biotech-lifecycle-templates.ts` supplies twelve exact existing lifecycle-record projections and metadata. This scope only wires them into the current library/catalog/builtin path and extends the central `documentComponentContext` helper to exact US/FDA membership. No invented registry identity or generated current legal requirements are added. Device-specific scope and wording remain intact; US medicinal lifecycle components get medicinal wording.

## Completed behavior

- Exact narrative-working metadata now exists for protocol, investigators_brochure, statistical_analysis_plan, informed_consent, dsur and pbrer. Appropriate existing US clinical-application/amendment/supplement mappings, including351(k), offer clinical working documents. These are available choices, not legal applicability or completeness determinations.
- Exact source/code manual policy preserves protocol title-page approval records, generated contents/schema/schedule, IB contents, ICF signatures, DSUR listings/tabulations and appendices, and PBRER original tabulations/appendices. Other known working sections receive explicit narrative mode. SAP describes planned analyses; actual numbers still require validated deterministic sources.
- CREATE guidance and full saved source carry those policies through actual persisted sections and reopening. The existing direct draft-reference gate admits saved narrative and refuses manual/source sections. No generation, source retrieval, content save, approval or signing follows from eligibility alone.
- Retained old manual snapshots remain manual. The historical fixture supplies a retained manual snapshot through only the template lookup seam, uses the actual HTTP writer, restores current lookup, reopens and invokes the actual saved reference gate. No stored history is rewritten.

## Actual qualification

`red.json`:22 genuine failures and6 controls pass across2 suites, no source drift. Six actual JWT/HTTP/PGlite create/reopen/direct-reference cases fail with TEMPLATE_NOT_DRAFTABLE; metadata/offered-list/absent explicit manual-policy assertions fail separately. Whole filings remain manual and the retained-manual snapshot control passes. Code and test pins/raw output predate production changes.

`green.json`:28/28 pass, no drift. `scoped-regression.json`:65/65 across4 suites, no drift, including saved draft-reference and assembly-guidance regressions plus exact US lifecycle scope refusal for Japan/Canada and preserved device scope.

`lint.json` and `lint-details.json`:all7 owned TS files have0 errors and0 warnings versus0 baseline; new helper/tests are held to0 warnings. `evidence-helper-lint.json`:the evidence lint script itself has0 warnings/errors. No baseline changes. `final-inputs.json` and final-source snapshots retain the final owned source. `git diff --check` passes for these files.

The lifecycle module is owned and separately pinned by the sibling stream. The root owns combined transitive-input qualification, full editor/UI/size gates, build, compiler and canonical Git publication. Original RED receipts remain immutable; no test was weakened to bypass the gate.

## Limits

The source-policy classification is a product safeguard for preparing working documents, not a claim that regulations require manual typing. Actual JWT/HTTP, current editor create/reopen, canonical SQL/audit source and saved-section eligibility readers run over isolated PGlite. No provider is called and no actual clinical evidence or agency endpoint is used. This scope does not prove scientific correctness, complete sponsor-template formatting, native PostgreSQL concurrency/RLS, live AnA competence, approval or filing readiness. Human acceptance remains pending.
