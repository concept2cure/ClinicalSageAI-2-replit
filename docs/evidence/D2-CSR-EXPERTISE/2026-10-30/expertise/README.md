# CSR scientific writing expertise

W1 / D2. Contract: `docs/design/CSR_EXPERTISE_IMPROVEMENTS_2026-10-30.md`.

## What already exists

The audit used accepted origin `438287ed1`, not the paused Oct 27 working tree. Existing `csr-e3-guidance.ts` and its plan/results/appendix records hold 119 headings; `csr-e3-writing.ts` and `ana/medical-writing-csr.ts` hold report-wide writing rules, sentence patterns, terminology and per-heading guidance. The builder already uses exact section requirements, retained-table cell reconciliation and provenance, and the registered CSR interview is in `flows/csr-report.ts`. Source/manual/output/review gates from the incoming CSR work remain intact. No new CSR engine, knowledge bank, calculator or editor is introduced.

## Findings and implementation

- Actual job and on-demand prompts now read the existing report-wide expertise through the pure helper. Known study metadata is explicitly whitelisted and quoted at user priority, with source strings treated as data. No sponsor values enter system instructions. This is a prompt-boundary control, not proof that a live model follows every instruction.
- A result heading named by the existing canonical table mapping requires a usable retained result pack; an absent binding, unavailable pack or empty pack returns the existing needs-data template before any model call. Non-table narrative headings remain draftable from recorded metadata. Its digest/source, missing tables and omissions remain in lineage; model is null and cost is 0. The previously possible unsupported qualitative no-AE finding is not accepted through metadata fallback. Positive usable-table reconciliation stays authoritative.
- Canonical title-page, ethics, consent and SAP timing guidance describes only source-supported conduct, including unknown records, waivers, deviations, late approvals and SAP work after unblinding. It does not insert standard compliance history by default.
- Existing sentence patterns now distinguish superiority, noninferiority, equivalence and Bayesian analyses using recorded source decisions and slots, not model-computed statistics or invented margins/thresholds.
- The live interview visits therapeutic-area questions and then robustness questions for either primary result. It distinguishes same-estimand sensitivity, different-estimand supplementary work and exploratory post-hoc work. An analysis not performed requires a rationale, not a fabricated result; an unmet-objective explanation is shown only when that applies.
- Existing nonzero AE-count checks retain their IDs but now produce neutral informational review prompts; no denominator or high-rate conclusion is invented from event presence.

## Verification boundary

Root captured `expertise-red.json`: 26 failures/1 pass across 27 cases before production edits. The initial zero-event control compared an intentionally omitted optional newIssues field with an empty array. That fixture assertion is calibrated to normalize omitted absence and assert the real next node. The optional validation-issue assertion uses the same normalization; no clinical requirement or engine policy was weakened. Root owns all subsequent test/lint/build/compiler/publication jobs and receipts; this worker ran none.

Focused suites: `server/services/__tests__/csr-builder-writing-expertise.test.ts` and `server/services/ana/intelligence-questions/__tests__/csr-scientific-reasoning.test.ts`. They capture both gateway paths and exercise actual registered-flow transitions rather than only inspecting labels. Models are mocked. No live-provider performance, clinical/statistical verification, human acceptance or agency acceptance is inferred from these checks. The existing advisory regulatory-source confidence grades are unchanged.

## Unbound-results follow-up

The first correction stopped an explicit unavailable pack from becoming metadata-only drafting. Independent review then found the same unsupported no-AE finding was still accepted when the pack argument was absent, including on-demand drafting. Root retained two stages of evidence: the initial §12.2-container cases were calibration only because the canonical container is not a model drafting target; the corrected §12.2.1-leaf cases genuinely reproduced AI acceptance without result evidence. The common guard now uses `csrSectionTableKeys`, not a second section list or a broad section-number regex.

Captured-message fixtures now use non-table §9.1/§8/§9.7.1 on both gateway paths. Three positive provenance cases still cover the original results headings §12.6/§2/§12.2.1, with packs produced by `buildCsrAuthoringEvidence`, exact E3 brief assertions and explicit quoted-user evidence assertions. The standalone numerical guard is still exercised on statistical-plan §9.7.1: unsupported planning figures are refused; the actual metadata's planned sample size can be narrated with a SAP placeholder, preserving served-model/token assertions. The old positive model fixture that invented twelve IRB approvals now uses an approval-record placeholder instead. No primitive guard or acceptance assertion was dropped to make missing results appear supported.

Primary-results guidance and the conclusions field now condition confidence/credible intervals, p-values, margins and Bayesian criteria on the recorded SAP method. The registered-flow test checks this wording; no statistic, hypothesis decision or margin is computed by the interview or the model.

## Final fallback review

Independent inspection found that the inherited needs-data template still asserted mild/moderate AE severity, a fixed display threshold and narrative availability. Related templates portrayed planned metadata as conduct or assumed eligibility/unmet need and a frequentist statistical design. Root retained the targeted 21-fail/18-pass receipt before correcting these fallback claims; all39 cases then passed. The two original sample-size controls did not reach the supplied-sample-size branch, so the fixture was strengthened with an actual planned sample size, duration and comparator and explicit metadata-preservation checks; all39 re-passed. See `template-review-findings.json` and `final-qualification-bridge.json`; overlapping runs are not summed.

The robustness node is composed through `csr-report-robustness.ts` into the same registered flow, following existing CMC/SOP flow helpers. Its normalized definition matches the pre-extraction bytes exactly. This keeps the questionnaire under the existing file-size ceiling without removing questions or growing a baseline. Final root receipts qualify the integrated code.
