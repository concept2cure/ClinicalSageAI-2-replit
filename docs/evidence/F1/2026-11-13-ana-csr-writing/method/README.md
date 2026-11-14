# Existing CSR writing method and qualification-status repair

Plan F1; W1 / D2. This bounded continuation starts from canonical `841c41466b6b96c6d95190432c41549ae9fc43b2`. The October 30 commit `5b611fb6` was consulted as reference material, then its relevant instruction changes were applied surgically to the November source. It was not substituted for the current implementation.

## What already exists

`server/services/ana/skills/library/medical-writing.ts` and `clinical.ts` already deliver writing methods through the existing selector and turn renderer. `ana/medical-writing.ts`, `medical-writing-csr.ts` and `ind/ctd/csr-e3-writing.ts` already compose document/section guidance. The current study-report skill already requires retained engine cells and claim receipts and reaches the sole project canvas/editor. `server/eval/pq/run-pq.ts` already reports IA preparation and qualification status. These owners are extended; no model, service, tool, screen, route or approval path is added. The parent [inventory](../../../../../.design/claude-convergence/F1-ANA-CSR-WRITING-2026-11-13.md) records discovery, deleted history and the independent owners.

## Changes and preserved contracts

The two affected library skills are version 2 and retain their unreviewed state and normal content hashes, selection and policy controls. They now plan a section purpose and source map, compose to that purpose, and revise within the author's instruction while retaining supported figures, citations, qualifiers, limitations and attributed clinical judgments. Methods describe sourced conduct; results state observations in context; discussion separates interpretation; the synopsis reconciles the body; original-record appendices require retained originals. Unsupported statistical methods remain descriptive rather than being forced through a superiority decision.

The shared CSR brief receives composition/revision rules from its existing canonical record. Universal rules distinguish traceability from verification and compare the same population, time point, analysis and source version. CSR conduct/results use retained client records; external examples support background or craft. Therapeutic-area guidance no longer invents cardiac adjudication, an oncology death window, assessor, estimator, grading scale or correction method.

The existing clinical step 12, including the current evidence-claim and sole canvas/editor flow, is byte-identical to the starting source. All later medical-writing overview/summary skill records are also byte-identical. Current exemplar controls and structured numerical claim receipts remain. Public brief function signatures are unchanged. The study-report method's two revision calls are listed as the same existing `critique_draft` and `verify_revision` tools already available to the general writing skill; no tool definition was created.

IA preflight no longer asks the owner to approve an already-approved protocol. Its remaining work explicitly identifies required components that cannot be executed, including the still-missing CSR capture. The approved protocol, model registry, source rights, bank and actual qualification holds are unchanged.

## Verification

| Actual execution | Observed result |
| --- | --- |
| Initial two-file RED on unchanged runtime | 12 failed, 26 passed; 14.561 s; 20 selected pins stable |
| Fourteen-file implementation phase | 659 passed, one failed; 39.319 s; 73 selected pins stable |
| Affected method/library successor | 29 passed across two files; 16.369 s; 73 selected pins stable |
| Affected selector/rendering/tool-pins/golden successor | 481 passed across four files; 21.963 s; 73 selected pins stable |
| Scoped lint, six original sources and seven current files | Zero errors and no warning growth; the one existing guidance-composition complexity warning remains |
| Separate oncology-convention RED | One failed, 12 unrelated cases skipped; 15.143 s; 73 selected pins stable |
| Affected oncology writing-method/guidance successor | 37 passed across four files; 18.012 s; 73 selected pins stable |
| Oncology successor lint, two affected files | Zero errors and no warning growth; the existing complexity warning remains |

The initial failures identify ten missing writing-method behaviors and two contradictory IA remaining-action behaviors. Current canvas/evidence-claim and exemplar preservation controls passed before correction. The implementation phase's single failure was the existing library invariant: the new revision instructions named two existing tools absent from that skill's tool list. Adding those existing pins corrected the invariant; the separate successors check both the method/library and the selection/relevance behavior affected by that metadata change. No assertions were weakened.

These executions overlap and are not pooled. In particular, the 14-file execution is retained as a failed phase, not relabelled as a fully passing run. [checks.json](checks.json) records each exact phase and its boundaries. [archives.json](archives.json) hashes lossless raw JSON/logs, commands/runners, original and final sources, source pins, the failing intermediate clinical source and baseline/current lint observations. The final selected hashes were rechecked after qualification. Git/publication, production build and the sole full compiler are the root session's separate gates.

A separate final read found that the generic oncology reporting convention still supplied Kaplan–Meier, Cox and a 95% confidence interval without conditioning them on the study records. The delivered-guidance regression failed before correction. One existing convention string now permits those methods only when the retained SAP and analysis outputs specify them and requires the recorded estimator, analysis population, confidence level and interval. It supplies no default method or confidence level. The affected four-file successor and two-file lint check passed. No other runtime owner changed in this follow-up.

The earlier source copies named `final` remain observations of that earlier completed phase. `post-oncology-owned-source.json.gz` identifies the current seven owned source/test files and the two that changed in the follow-up; `oncology-green-source-after.json.gz` is the current 73-file selected snapshot. The older phases, pins and lint results were not overwritten or relabelled.

## Limits

These checks establish instruction delivery and deterministic software contracts. IA provider responses are mocked. They do not establish trained model weights, clinical writing performance, medical-writer certification, scientific approval, production readiness, deployment or agency acceptance. Public references remain unapproved for training and actual model PQ entries remain pending. The required CSR capture/evidence-verification work remains incomplete; this status repair does not authorize a qualification pass.
