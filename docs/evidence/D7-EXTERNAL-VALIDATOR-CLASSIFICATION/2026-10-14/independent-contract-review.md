# D7 independent external-validator contract review

Reviewed 14 October 2026 at HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Read-only reviewer: no implementation, prior storage/test files, dependencies, credentials, licensed validator, agency, database or transmission changes. New files here are evidence and this review only. Coordination: filing_code_audit owns adapter/gate proposal; ana_code_audit owns assessor/caller integration; root publishes the approved contract before application changes.

## Decision

Approve the bounded proposal to classify the trusted selected adapter and require a coherent successful external-engine report in required production mode. Preserve advisory release policy and the subset's useful diagnostics. Approval is conditional on separating factual assessment outcome from policy clearance: an actually-run failing report cannot be presented as “not assessed” or “Satisfied.”

This closes a classification/coherence defect. It does not qualify a licensed engine installation, validate the XML parser against real engine output, authenticate an imported report or bind a result to a package/profile/version. Release evidence must state those remaining limits explicitly.

## Verified component evidence

[Independent baseline probe](independent-contract-baseline.mts) calls the current pure gate and parsers using synthetic in-memory reports. [Recorded output](independent-contract-baseline.json) includes SHA-256 hashes of the inspected gate/types/adapter/resolver files. The local probe exited 0. This is component behavior, not a claim that a full dispatch or production transmission occurred.

Observed required-production clearance for: a clean internal-subset report, an unknown validator name, `ran: 'false'`, `passed:false` with zero errors, negative/NaN counts, an error finding with declared zero errors, and unknown finding severity. The current gate reads truthy ran and caller-provided errorCount; it does not verify engine identity, passed or finding/count consistency. A fractional count produces a blocker but is printed as a fractional number of agency errors, which is not a valid finding tally.

Observed advisory clearance for a genuine-shaped external report with one error in flag-unset production and required staging. This is intended current enforcement behavior. However, `externalNotAssessed` returns nothing whenever ran=true and the frontend renders every cleared gate without that note as “Satisfied.” The canonical external rule says the report carries no errors, so the fact label contradicts the report. Separately, that rule's rationale currently says an error always blocks when a report is on file, whereas the implemented opt-in production policy says advisory errors do not block.

XML parser observations: an unrelated XML envelope yields zero findings; `fatal` and `blocker` normalize to info. JSON already rejects unknown envelopes/severities, but parsing a recognized empty findings array still proves only format/count interpretation, not engine authenticity. These parser limitations remain outside the bounded class fix unless root separately authorizes their contract and fixtures.

## Required semantic separation

| Field/fact | Honest meaning | What it must not imply |
| --- | --- | --- |
| selected adapter kind | Trusted resolver-side classification: external_engine, internal_subset, unavailable or unknown | A report's self-declared authority, coverage or qualification |
| configured | External adapter configuration predicate currently satisfied | Binary executed, license verified, endpoint healthy, correct profile or package checked |
| available internal subset | Opt-in local subset can execute; expose separately with kind/name | Licensed external validator configured |
| raw ran | Strict boolean execution claim from supplied report; retain diagnostics | A qualifying external report or pass |
| coherent report | Strict booleans, known finding severities, valid nonnegative safe integer counts and matching tallies for completed runs | Authenticity, complete engine coverage or package identity |
| qualifyingRun | Document the exact contract: selected external identity matches report and completed-run report is valid; if it additionally requires pass, name that explicitly | Operational or regulatory qualification, or proof an actual failed run never ran |
| passed/assessment status | Coherent executed external assessment has no error; failed/unrun/invalid/subset states remain explicit | Agency acceptance or scientific/regulatory approval |
| cleared | This policy gate adds no blockers under the active environment/required flag | The assessment passed |
| count | Findings actually counted under known severity mapping; unknown/unrun counts are not clean package evidence | Zero findings means a check ran; operational failure is a content error tally |

`LorenzEValidatorAdapter.isConfigured()` currently tests presence/access for a path or merely recognizes an HTTP URL; it does not establish executable capability, a license or health. Types/copy saying “licensed engine is configured” should be understood as selected commercial adapter configuration, not qualification evidence. The subset's isConfigured is its opt-in flag. Returning external-only configured=false with kind=internal_subset makes this distinction inspectable.

## Bounded contract acceptance

- Classification comes from trusted adapter/resolver code. Missing selected identity means unknown; no fallback to `name !== 'noop'` or report-supplied kind.
- Required production clearance needs configured external_engine, exact selected/report engine-name match, strict `ran === true`, strict `passed === true`, known-severity findings, nonnegative safe counts, tally coherence and zero content errors. `passed === true` with a nonzero tally, or `passed === false` with zero completed-run errors, is incoherent and cannot clear.
- Keep the report type compatible and preserve raw findings/diagnostics. A ran=false run-failure report currently contains `EVALIDATOR-RUN-FAILED` severity=error but errorCount=0 intentionally counts no package-content errors. Do not erase that diagnostic or turn it into a content finding; completed-run tally coherence is a different check. Required mode still refuses the unrun result.
- Warning-only coherent external runs may pass the current error-only requirement; retain warningCount and findings. This is not authority to suppress warnings from review.
- Optional production/staging remain advisory: no new dispatch blockers from this change. Report invalid/unavailable/internal-subset/failed states honestly beside the unchanged clearance verdict. Never replace invalid diagnostic data with a fabricated clean count.
- Use additive assessment status/note in canonical gate views or another explicit factual verdict. `notAssessed` is appropriate for an absent qualifying external assessment (e.g. only subset ran); actual external failure needs “Failed; advisory, does not block under current policy.” A generic notAssessed predicate based only on successful qualifyingRun would be misleading for executed failures.
- Keep the dispatch-QC item “External ... gate clear” tied to policy clearance if that is the intended item, but show factual validator assessment separately. Pre-transmit currently uses `passed: extGate.cleared`; its check field also needs qualification or copy distinguishing policy clearance from validator pass. Do not silently change the existing gate posture to make UI booleans convenient.
- Correct canonical rule rationale/enforcement copy to reflect existing opt-in production policy rather than changing policy to match overbroad prose. Remove assertions that a validator proves agency intake acceptance; a successful validator result is bounded evidence.

## Adversarial acceptance matrix

Green cases are proposed assertions for the approved implementation, not already-passing tests. Use pure gate fixtures first, then the real assessor's resolver wiring and canonical view/QC/pre-transmit serialization.

| ID | Case | Required production | Advisory display/diagnostics |
| --- | --- | --- | --- |
| D7-01 | Selected internal_subset, clean subset report, ran/passed true | Refuse; external configured=false; classification explicit | No new blocker; retain subset notice/findings; external assessment not assessed |
| D7-02 | Selected unavailable/noop, no report | Refuse | Gate clear under existing policy; not assessed, never passed |
| D7-03 | selectedValidator omitted/unknown even if configured=true and report looks clean | Refuse unknown authority | Unknown classification; no fabricated qualification |
| D7-04 | Selected external A with report.validator B, including subset name | Refuse identity mismatch | Preserve reported name and mismatch diagnostic; never a successful external assessment |
| D7-05 | `ran` or `passed` string/number/null | Refuse malformed report | Invalid assessment; no truthiness conversion into pass |
| D7-06 | Negative, fractional, NaN, infinity, unsafe or string counts | Refuse invalid counts | Preserve explicit invalid-count diagnostic; do not label a number of agency findings as authoritative |
| D7-07 | Known error row but errorCount=0; warning tally mismatch; passed=true with errorCount>0 | Refuse incoherent report | Retain counts/findings and incoherence; not Satisfied |
| D7-08 | ran=true, passed=false, errorCount=0, findings=[] | Refuse incoherent/failed result | Failed/invalid rather than clean or not-run |
| D7-09 | Unknown/missing finding severity or nonarray findings | Refuse unreadable semantics | Invalid assessment; original diagnostics retained |
| D7-10 | Matching trusted external identity, strict completed run, zero errors, one warning, passed=true | Clear under bounded current contract | Passed with warning displayed; qualification/package binding not claimed |
| D7-11 | Coherent external error report, optional production or required staging | Existing no-blocker advisory policy preserved | Assessment failed + exact count; no-errors canonical rule must not say Satisfied; no new policy blockers |
| D7-12 | ran=false run failure + operational error diagnostic + content count0 | Refuse unrun | Diagnostic retained; no zero-content-errors pass and no accidental tally rewrite |
| D7-13 | Adapter resolver/configuration fails or changes during assessment | Required failure/unknown, no weaker fallback classification | Configuration unknown/failure explicit; no fabricated no-engine/clean fact |
| D7-14 | Caller omits new selected identity in pre-transmit/MCP/assessor integration | Required fail closed rather than backward-compatible bypass | Compatible advisory behavior with unknown classification; configuration-only tools explicitly say they did not run validation |

A mocked test engine may be classified external_engine only through a test-side trusted descriptor; the report's validator='stub' alone is not authority. Existing tests with inconsistent synthetic counts must be repaired deliberately, not loosen the validator to keep those fixtures green.

## Remaining qualification, separately scoped

1. **Real engine/version/profile evidence:** known licensed installation, executable/endpoint health, applicable eCTD generation and region profile, criteria release/version and approved real sample corpus. The seam supports only fda/ema/pmda today; a label does not add coverage.
2. **Parser conformance:** actual vendor JSON/XML envelopes, summary findings, severity taxonomy and complete-run marker; unfamiliar XML must not become zero findings. CLI timeout/abnormal exit/report completeness and HTTP timeout/response limits also need qualified handling.
3. **Exact package receipt:** package digest/manifest, compilation/sequence/organization, emitted file versions, profile/criteria version, run ID/time, report hash, outcome and stale-package invalidation. Gate identity matching alone does not bind report to package bytes.
4. **Import authenticity:** report import records report hash, importer and compilation relationship but forcibly names lorenz-evalidator after interpreting arbitrary JSON findings. That is an auditable import assertion, not verified engine provenance. Do not promote it into automatic qualifying execution without an explicit acceptance/authenticity contract.
5. **Lifecycle/transport evidence:** apply accepted package-bound report to real full assessor/freeze/signature/export/transmit path; prove version changes invalidate clearance and transport accepts only the authorized package. This review executed none of those operations.

## Evidence and release statement

For the bounded change preserve baseline component output, new contract tests, assessor wiring/view/QC/pre-transmit tests, code/file hashes and exact statuses/counts for subset/unknown/malformed/advisory failures. Record passing deterministic suites separately from licensed-engine PQ and package-bound receipt qualification, which are not supplied here.

Honest completion wording: “Required production external-validation gates now refuse internal-subset, unknown/mismatched and incoherent reports. Advisory outcomes remain visible without changing release policy. Licensed engine/profile qualification and exact-package report binding remain pending.” Do not say “agency validation implemented,” “all external reports authenticated,” or “filing accepted.”
