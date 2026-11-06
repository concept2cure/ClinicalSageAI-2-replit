# Complete truthful nonclinical composition before governed input reach

2026-11-06. Plan F1; W3, launch D2/D4. Continues P-55/R-1 and P-73 within existing project/AnA/editor owners. Baseline canonical `f6127e72231bd9e9f302f596a672f58b1b40db15`; branch `concept2cure-v2`, initially clean. No new app, screen, editor, route, service, table, model or dependency is proposed.

## What already exists

Inventory precedes worker prompts and implementation. `rg` searched nonclinical/toxicology/Module2/source-binding names and exact consumers across server routes/API/src/services, shared/schema, migrations, client source kinds and AnA tools. Corrected stale guessed filenames rather than relying on them. Full non-shallow `git log --all --diff-filter=D` searches covered `*nonclinical*`, `*toxicology*`, `*draft-project-sources*` and `*draft-source*`: deletions are historical cleanup/seed scope, no replacement governed project composer was recovered.

- `docs/LAUNCH_DEFINITION_OF_DONE.md` P-55 (2026-10-29) resolves R-1: Modules2.4/2.6 read `nonclinical_studies`, count `in_reporting` for an IND, never planned/cancelled. The ingest path converges onto this store, and tabulated2.6 is a preparation worksheet. This is authorization already on record, not an unanswered store choice.
- `server/services/ana/module2-nonclinical-inputs.ts` is the shared existing tool input/composition owner for `draft_nonclinical_overview_m2_4` and `draft_nonclinical_summaries_m2_6` (registered in `AnaToolExecutor.ts`). It rejects model-supplied studies/findings, resolves actor/project, then always says there is no linked store and returns a requirements outline. Its comment and outcome still predate P-55.
- `record-source-project.ts` already resolves the open integer project or v2 regulatory UUID through the actual actor/project CSR policy, preserves open-project precedence and refuses cross-project selection. `module2-csr-inputs.ts` is the adjacent recorded-input pattern; no parallel project resolver is needed.
- `server/services/nonclinical/nonclinical-service.ts`, `shared/schema/nonclinical.ts`, `migrations/20260610_nonclinical_send.sql` own the governed study/SEND records, lifecycle fields and audited writes. Studies link to `submissions` through `submission_id`; `listStudiesForSummary` is currently organization-wide and cannot safely stand in for a project-scoped read.
- `shared/schema/submissions.ts` already records a same-organization `program_id` regulatory UUID. `projects.regulatory_program_id`, canonical `server/services/c2c/program-project-anchor.ts`, `csr/project-scope.ts` and `report-os/project-access.ts` own project identity/access. Reuse their actual anchor and actor policy, never title/metadata guessing or an unfiltered organization list.
- `server/services/nonclinical/m26-m4-view.ts` already adapts governed study taxonomy (`adme_pk`) into the deterministic M2.6 composer; it keeps lifecycle/SEND declarations separate from approval. `preclinical/m26-nonclinical-summaries.ts`, `preclinical/nonclinical-m24-adapter.ts` and `m2-summary-builders.ts` already compose recorded fields. Their missing-field, category and placement behavior must be inspected and reused honestly; no model-entered NOAEL, duration, GLP or default clinical conclusion is acceptable.
- `server/services/preclinical/nonclinical-program-loader.ts`, `load-nonclinical-studies-for-project.ts` read the older model-extraction `ctd_nonclinical_studies` store. `preclinical-governed-bridge.ts` already threads ingest into the governed register. Do not substitute the extraction landing zone or build a third store.
- `server/services/authoring/nonclinical-study-report-builder.ts`, `nonclinical-study-report-structure.ts` and `m4-nonclinical-qc.ts` already serve Module4 report structure/QC; `investigator-brochure-view-assembler.ts` only probes organization availability, so it is not a scoped study loader. No parallel report builder is needed.
- `draft-project-sources.ts`, `draft-source-*`, `drafting-source-lineage.ts`, authoring selected-source readers and the newly landed Quality record-source helpers are existing evidence/authorization homes. Preserve their scope, privacy, currentness and provenance boundaries. At the initial baseline, P-104 source-tier propagation was an open held-route issue; the canonical synchronization below supersedes that generic finding. Native nonclinical source disclosure, authorization and currentness still require their own reviewed binding before tool-data activation.
- Existing tests include `nonclinical-drafts-refuse-model-figures.test.ts`, `module2-csr-inputs.pglite.test.ts`, nonclinical registry/PGlite status tests, deterministic M24/M26/view tests and nonclinical workflow tests. Extend existing tests and source owners; no new user-facing capability or store is needed.

## Completion boundary under review

Read the already-authorized governed records for the admitted project through the actual submission/program link, preserving tenant/actor/unique-anchor and lifecycle rules. Retain model-figure refusals and distinguish inaccessible/unavailable stores from an empty eligible record set. Reuse deterministic composers, retain missing-data/worksheet qualifications and source identifiers, and avoid scientific/readiness/GLP/approval claims from presence alone. Design review precedes behavioral reds and any production change. Root serializes checks/Git/canonical publication.


## Active completion contract after read-only review

At baseline f6127e722, two independent reviews found that ordinary and SSE continuations lacked native-study source-tier propagation, and governed studies had no persisted classification. That finding narrowed this slice before implementation. Canonical ea3b158e6, merged normally as `29dd53375`, now supplies private run-source authority, conservative Tier 3 for unassessed input, captured gateway tiers and before-dispatch rechecks across ordinary/SSE continuations. The blanket generic tier-protection blocker is therefore superseded. This slice still adds no nonclinical reader or study-specific actor/project/lifecycle/version grant, and does not qualify native study classification/currentness or activate study-bearing output. Those bindings must be implemented and tested using the existing run authority, without model-declared tiers or fabricated Quality receipts. Project access, GLP/lifecycle and serving-model labels alone are not disclosure authority.

Instead, finish existing deterministic composition defects exposed by that review, which are already reached by the nonclinical summary/document and preclinical workflows:

- `preclinical/nonclinical-m24-adapter.ts::mapStudyTypeToM24` defaults unknown types to toxicology. Preserve the original type separately; unknown/other stays unclassified, and known ADME/PK remains PK. `toBuilderStudy` supplies a pretend Module4 section and a report-reference finding when neither was supplied.
- `m2-summary-builders.ts::buildM24NonclinicalOverview` treats the generic toxicology bucket as repeat-dose coverage and prints all those studies as repeat-dose. Extend its existing shape with optional original/source type and an explicit unclassified category. Only explicitly identified repeat-dose input closes that coverage gap; generic/single/local/immunotoxicity do not. Preserve all study entries and source labels in the existing index.
- `preclinical/m26-nonclinical-summaries.ts` has the same repeat-dose coverage error; missing categories print Not applicable and absent report placement/finding gain placeholders that imply a report exists. Keep unclassified rows visible and gaps explicit, reuse one repeat-dose predicate from the existing builder, and identify tables as preparation worksheets per P-55.
- Both M24/M26 assert that full reports are already in Module4 without checking a filed report. Replace this with an explicit source-report/placement verification requirement, retain sponsor toxicology judgment and phase/duration qualification, and do not turn GLP flags or category coverage into a safety/readiness verdict.
- `ana/module2-nonclinical-inputs.ts` and four existing descriptions in `bla-biologics-tool-defs.ts` still say the store decision is pending/no project records exist. Correct that stale claim: the governed store is chosen, but project-scoped/protected-result binding is not enabled and the request reads no studies. Sanitize unexpected source-context failure without caught SQL/error text; preserve model-figure refusal and all scope/outline behavior.

No current input/store/model/approval boundary is widened. Existing apps/routes/editor layouts are untouched. Behavior reds precede production changes, covering unknown types, non-repeat tox, missing fields, empty categories/waivers, unsupported report claims, and both tool-refusal/error paths. The eight production/source-binding owners above remain inventory context; actual changed paths are the existing adapter/composers/tool input/descriptions and their tests. Native nonclinical governed project binding and independent scientific qualification remain open. Existing P-104 generic protection is inherited from the merged canonical; no new native-study privacy or scientific qualification is claimed.


## What already exists — legacy tool-test policy fixture

The first overview/tool red run fails14/52, but seven failures arise before the handler: the older unit fixture predates P-104 mandatory skill admission and its empty DB stub cannot read current policy, returning SKILL_POLICY_UNAVAILABLE. The diagnostic log names this, and a queued source-error mock then reaches the wrong later case. Correct the existing unit seam with an explicit empty-rule policy fixture while retaining the real registration wrapper and every handler assertion; current policy enforcement remains separately tested, not bypassed in production. Rerun calibrated reds before production fixes. This unit cannot claim real policy/project/privacy qualification; the pure composer and refusal/error behaviors are its scope.


## What already exists — positive fixtures and normalization preservation

The existing overview safety-judgment controls in `server/services/__tests__/m2-summary-builders.test.ts` and `m2-summary-conclusions-from-recorded-fields.test.ts` call generic toxicology a complete repeat-dose category. Their intended-complete fixtures will explicitly supply repeat-dose source metadata and recorded field labels; every sponsor-judgment assertion stays intact. Additional review found that M26 accepts already-normalized builder records through existing workflows, so a second normalization must preserve their source subtype rather than losing explicit repeat-dose identity. Raw specific types still take precedence over conflicting optional metadata; no new HTTP admission is implied.


## What already exists — distinct effect-level labels

The existing M24 study index (`m2-summary-builders.ts`) falls back from NOAEL to NOEL under a NOAEL header; its toxicology table omits NOEL. M26 already needs separate columns in the active contract. Extend that same recorded-value preservation to the existing M24 tables, with a behavioral red before the correction. A recorded NOEL is not a NOAEL and neither is independently verified by this composer.


## What already exists — downstream source-reference validation

Read-only compatibility review found `authoring/ctd-authoring-readiness.ts` rejects blank `inputSectionKeys`, while `authoring/m2-summary-qc.ts` treats a nonempty array as declared traceability. M24 must omit missing/whitespace-only report locators from that reference array, while retaining every study in the index and its placement gap. Add a selected existing-builder red and run the existing QC/readiness suites; neither downstream gate is weakened.


## What already exists — unclassified finding preservation

The existing M24 all-study index lacks a finding column. Once unknown study types correctly stop entering the toxicology bucket, their supplied finding would disappear from the composed output. Retain it in that same index with a Key Finding column rather than misclassifying the study or adding a parallel table owner. Pin a unique unclassified finding in an existing-builder red before correction.


## Validation status before canonical synchronization

Calibrated pre-fix core reds:41 failed/48 passed across4 suites. Later preservation reds: roundtrip4 failed/3 passed/37 skipped, NOEL1 failed/36 skipped, blank references2 failed/36 skipped, unclassified finding1 failed/38 skipped. Logs retained separately; these counts are not disjoint test populations. Final5-suite core currently110 passed. Initial13-suite adjacent cohort165 passed/1 failed because the revised M26 wording used “for ACME-401” where an existing assertion expects “of ACME-401”; wording corrected and assertion preserved. Full merged rerun/build/canonical gates remain pending. Independent read-only review found and rechecked reference-key/finding preservation defects; no remaining material blocker in the narrowed contract. No actual governed-study tool output enabled.


## Merged validation and remaining work

The merged tree passes110/110 core cases in5 suites,166/166 adjacent workflow/QC/readiness/admission cases in13 suites, and102/102 existing source-authority/gateway/read-follow-up cases in4 suites. These22 suite populations are distinct (378 cases). The existing tool handler unit uses an explicit empty-rule snapshot; the separate real policy suites retain current-policy/conflict refusal. PGlite and mocked SDK/transport boundaries are software evidence only. Final changed-file lint:10 files,0 errors,9 warnings versus10 existing production warnings, no added warning. No warning/typecheck baseline changed. Full production client/server build and both operations verifiers complete successfully; ordinary bundler/dependency notices are retained in `build.txt.gz`.

`source-sha256.json` pins all10 owned production/test files and `merged-dependency-sha256.json` pins7 incoming source-authority dependencies. All10 owned files are unchanged through the normal canonical merge. Independent review rechecked the two M24 preservation findings and the incoming P-104 authority integration. Canonical publication and its full TypeScript/mandatory repository gates are the final pending step; no receipt claims acceptance before the hooked push finishes.

Native nonclinical study binding remains the next completion within the same project/AnA/editor owners: reuse `nonclinical_studies` and canonical submission/program anchor, filter eligible lifecycle rows, enforce actual actor/project permission and exact version/currentness checks, and integrate with the now-landed private run authority. This increment adds no such read or model disclosure. Module2.6 output remains a preparation worksheet; category presence is not phase suitability, verified GLP, report availability, safety approval or scientific qualification.
