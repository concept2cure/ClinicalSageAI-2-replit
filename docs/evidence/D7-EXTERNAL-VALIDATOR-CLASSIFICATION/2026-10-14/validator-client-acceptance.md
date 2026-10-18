# D7 customer acceptance rubric: validator classification

Read-only review, 14 October 2026. This is an independent acceptance specification for the planned fix, not a test result or deployment qualification. No validator/vendor/agency was called, no benchmark was rerun, and no application code was edited.

## Customer-observable improvement

A clean result from the useful, license-free FDA-criteria **subset** must remain a subset result. It must not satisfy a required production **external-validator** gate. Likewise, no report or an unknown/malformed report must not appear verified merely because it contains zero errors.

The existing focused verification demonstrates the classification defect at the resolver/pure-gate seam: the subset can clear the required-production gate through the current `name !== 'noop'` predicate. That probe used deliberately invalid synthetic dossier contents. It does not show that an invalid package reached dispatch or an agency. [Baseline verification](../../../reports/data-room-research-2026-10-14/validator-classification-verification.md).

The planned narrow contract is a trusted, server-selected descriptor `{ name, kind }`, where kind distinguishes `external_engine`, `internal_subset`, `unavailable` and `unknown`. A supplied report cannot classify itself as independent evidence; its validator identity must match the selected descriptor. Required-production handling also checks actual execution, pass state, valid/consistent counts and error findings. Optional/staging checks remain advisory; descriptor/eligibility truth must be distinguishable from “this gate adds no hard blocker.”

## Independent acceptance cases

These cases describe expected behavior at the existing pure gate and the assessor wiring. The implementation owner records which were actually executed and their evidence. A fixture asserting `kind=external_engine` tests classification logic; it does not prove a licensed provider was installed or called.

| Case | Independent fixture | Expected result and client meaning |
|---|---|---|
| A1 — clean subset | Selected `internal_subset`; matching subset report ran, passed and has zero errors; `configured=true`; required production | External requirement remains blocked. Preserve the subset's useful pass/finding details. Message says subset checks passed but required external validation is outstanding. |
| A2 — unavailable | Selected `unavailable`; no report or unrun noop; required production | Block as unavailable/not assessed, not as a clean package and not as a scientific defect. |
| A3 — unknown classification | Selected `unknown`; a superficially clean report and `configured=true`; required production | Block. Unknown engine coverage is not eligibility for external clearance. |
| A4 — clean external report | Trusted selected `external_engine` descriptor; matching engine ID; ran/pass true; well-formed, consistent zero-error findings/counts; required production | This external-classification gate may add no blocker. It does **not** establish authentic provider origin, package/profile qualification, other release gates or agency acceptance. |
| A5 — wrong report identity | Select external engine A; provide clean report naming engine B, subset or noop | Block identity mismatch. Never infer that a clean report is interchangeable with the selected engine's result. |
| A6 — no reliable execution/pass | Selected external; report missing/unrun, or `passed=false` despite zero errors | Block as failed/unassessed/inconsistent as appropriate. Zero error count is not proof of execution or pass. |
| A7 — malformed counts | External report uses negative, fractional, nonfinite or otherwise invalid counts, or invalid report shape | Block without manufacturing a clean result. Keep failure visible; malformed reporting is different from valid content errors. |
| A8 — contradictory findings/counts | External report says zero errors/pass true but contains an error finding, or reported totals disagree with actual findings | Block inconsistency. Do not let the headline overwrite the detailed evidence. |
| A9 — actual external errors | Matching external report ran with consistent error findings/counts and pass false | Block and retain actual severity/rule/leaf details. Wording describes reported validation errors; avoid promising what an agency would decide. |
| A10 — warnings only | Matching external report ran/pass true with consistent zero errors and nonzero warnings | No classification hard block solely from warnings; show and retain warnings. “No error findings” must not become “no findings” or “regulator approved.” Separate human/other gate policy may still require action. |
| A11 — advisory posture | Repeat subset, unavailable and error cases with optional/staging posture | Preserve advisory behavior at this gate, with source/kind/execution/error status visible. No-hard-block is not independent-validation completion. Existing composite rules remain distinct. |
| A12 — integration and scope | Assessor passes selected trusted descriptor; other approval/signature/structural/transport conditions remain unmet | Classification cannot clear the overall release by itself. Preserve all other blockers and current support boundaries. Wiring review/test evidence must establish that the trusted descriptor reaches the gate. |

Reject an acceptance report that tests only a helper with a hand-selected external kind while leaving the production assessor's current non-noop predicate unchanged. Conversely, do not require live agency calls to prove this narrow classification fix. Relevant component fixtures and assessor wiring are the appropriate immediate evidence.

## Wording and remaining evidence boundaries

Acceptable customer language: **“Subset checks passed; required external validation has not been established.”** For a matched external-class report: **“No error findings in this returned external report; other release and qualification requirements remain separate.”** Status should distinguish not run, internal subset, external eligible, errors/warnings and malformed/mismatched report. Use current API/readiness evidence if no UI change ships; do not claim a new visible page was implemented.

This fix does not authenticate the CLI/HTTP provider or imported JSON, bind the report to the exact package hash and complete criteria/profile/engine revision, qualify a regional adapter, prove licensed full coverage, or test a real transport/acknowledgement chain. Those are additional work and validation evidence. An imported report or configured wrapper is not agency approval. The reviewed adapter plan names these boundaries. [Adapter plan](../../../reports/data-room-research-2026-10-14/filing-adapter-plan.md).

The feature is a correctness and trust improvement. Veeva, LORENZ, Weave and other competitors already market validation, publishing or evidence controls; this review establishes no competitive exclusivity and no full global qualified filing capability. [Competitive evidence](../../../reports/data-room-research-2026-10-14/competitors.md).

## Exact connection to the proposed 90-case benchmark

The planned matrix has 15 product/market cells and six variants. The fix most directly strengthens **variant 5: historical filing/rule applicability with explicit supported versus unassessed validation** and its expert criterion “unsupported or unassessed cannot be called verified.” It also improves the clean case's separation of preparation, subset checking, external checking and overall release status. [Benchmark protocol](../../../reports/data-room-research-2026-10-14/moat-benchmark-plan.md).

For the FDA medicine cell, attach two validation receipts to the same test workflow: a clean subset receipt and a matched external-class fixture. Keep scientific content constant. The expected difference is exactly the external requirement decision; the subset's own useful findings should remain intact. Add identity mismatch/malformed/error variants as D7 component acceptance cases, rather than inflate the 90-case client study with repetitive full-dossier tasks.

The fix does **not** improve scientific applicability, denominator correctness, evidence retrieval, permission revocation, computed-span provenance or regional packaging by itself. A changed-package/stale-report test belongs to the later package-binding work; do not credit this classification fix with passing it. The component acceptance result is not evidence that the broader 90-case protocol ran or passed.

## Proposed D7 evidence record

Record the actual commit/diff, test commands and results, selected descriptor/report fields, required/advisory posture, expected/actual decision and preserved findings. Include the baseline probe and a post-fix contrast only if rerun by the implementation owner. Separate mock/component evidence, assessor integration evidence and any future live qualification. Retain every unexecuted case as planned, and explicitly list package/profile/provider/transport qualification as outside this fix.
