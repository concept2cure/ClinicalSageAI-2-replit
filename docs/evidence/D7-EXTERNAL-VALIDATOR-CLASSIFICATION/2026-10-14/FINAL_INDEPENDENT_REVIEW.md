# Final independent review — bounded D7 classification slice

14 October 2026. **No blockers remain within the approved contract after the caller, malformed-diagnostic and legacy-display fixes.** This is an independent review of the current local patch, not deployment, licensed-engine qualification or agency acceptance.

This reviewer edited evidence/scratch files only. Application changes belong to the implementation owners. The [contract](CONTRACT.md) governs the result. HEAD and SHA-256 hashes of the reviewed production files are recorded in [source manifest](independent-final-source-manifest.json); no listed source file changed during the final verification. Independent execution used Node **v24.19.0** and installed local tooling, including Vitest **4.1.7**. Owner Node 22 results are separate evidence.

## Independently executed results

| Check | Result | Actual scope |
| --- | --- | --- |
| [22 runtime cases](independent-runtime-green.json) | 22 passed, 0 failed; exit 0 | Real pure gate with malformed configuration/identity/class/profile/date/findings/count values and coherent advisory-failure controls |
| [4 compound tests](independent-integration-green.log) | 4 passed; exit 0 | Real assessor helper and gate-view construction with DB mocked: malformed unrun findings, subset/report identity attribution, unknown error tally propagation, coherent failed advisory + legacy gate metadata |
| [8 pre-transmit cases](independent-pretransmit-green.json) | 8 passed, 0 failed; exit 0 | Real pure wrapper: trusted identity forwarding, warning-only pass, missing/mismatched identity refusal, malformed-count unknown status, subset error diagnostics, staging advisory failure and low-level opt-out |

The final gate refactor and `errorCountKnown` contract changed the runtime code after the earlier review. One final run of each portable retained check established the current-patch results above. [Earlier runtime red output](independent-runtime-red.json) preserves the 0/22 pre-contract result; the [original baseline probe/output](independent-contract-baseline.mts) and [baseline JSON](independent-contract-baseline.json) separately preserve component behavior and original file hashes. The four compound and eight wrapper checks are acceptance checks; no red result is claimed for them.

Run from repository root using the already installed tools; no provider or agency is contacted:

```bash
./node_modules/.bin/tsx docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/independent-runtime-review.mts
./node_modules/.bin/vitest run --config docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/independent-integration.config.mts
./node_modules/.bin/tsx docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/independent-pretransmit-review.mts
```

Retained scripts use repository-relative imports; the compound config derives paths from its own `import.meta.url`. They require no unique fixture directories and perform no cleanup or application writes. Runtime/wrapper probes replace fetch with a throwing function. The compound check mocks DB access and does not execute a licensed adapter or gateway. Output redirection in the original run only wrote the named evidence result/log files.

## Findings resolved and reviewed

- Required production clearance needs a trusted configured external-engine selection, exact report identity and coherent completed run/pass/count metadata. Subset, unknown, mismatched and malformed reports refuse. Raw execution and a qualifying external execution remain distinct.
- `errorCountKnown` prevents a compatibility numeric zero from becoming a claimed clean tally. Executed subset error diagnostics remain available. Unrun operational failure diagnostics are retained and safely extracted from malformed row lists.
- A coherent external report with errors has qualifyingRun=true and assessmentStatus=failed, while advisory clearance stays true. The assessor, canonical client views, market summaries and QC caveats keep assessment status separate from release policy.
- Selected subset versus another reported engine no longer produces a sentence falsely attributing that engine's execution to the subset.
- The legacy client response path now uses positive reported errors to show failed assessment rather than “clean” or “Satisfied,” while retaining legacy clean/unrun behavior. This reviewer inspected the corrected production code and owner fixtures; the independent compound suite checks legacy gate metadata compatibility, not browser rendering.
- Pre-transmit forwards the trusted descriptor and makes its check.passed reflect an actual successful assessment. Non-passed advisory checks carry a warning without changing blockers or clearance. Downstream guard code enforces pre.cleared rather than checks.every, preserving the existing advisory release policy. No wire call was tested.
- MCP configuration discovery exposes adapter kind/availability, external-only configuration and explicit not_run/not_assessed execution/qualification. Unknown kind and nonboolean availability normalize conservatively. It preserves the existing structural result and read scope, and makes no validation-run claim from discovery.

## Reviewed owner evidence, not independently re-executed

The MCP owner's [11-case green log](mcp-validator-green.txt), [metadata verification](mcp-validator-metadata.md), production diff and actual registered-tool fixtures were reviewed. Those **11 cases were executed by the owner**, not by this reviewer. They cover subset/external/noop discovery, name-versus-kind authority, unavailable/configuration errors, malformed kind/availability, unchanged structural result and read-scope denial; the validate spy remains uncalled. The caller diff check returned exit 0.

Owner validator/assessor/presentation/QC/lint/typecheck evidence in this directory is complementary. This review does not relabel those suites as independently executed or claim full application/browser coverage from the local component checks.

## Explicit remaining boundary

No real vendor installation, licence, criteria/profile/tool version or complete region coverage was qualified. No report was authenticated or bound to exact package bytes. Tolerant XML parsing, CLI timeout/completeness and the qualification runner's residual partial-validation labels remain separate increments. No live database-bound complete sequence lifecycle, signature, export, transport, deployment, sponsor test submission or agency acknowledgement was exercised here.

Completion claim supported by this evidence: **the bounded classification/coherence and caller-reporting defects are corrected locally and pass the stated independent contract checks; regulatory filing qualification and acceptance remain pending separate evidence.**

## Post-refactor review

After the independent executions above, only `server/mcp/tools/validation.ts` changed among the nine recorded production files. The owner extracted discovery, strict kind/availability normalization, metadata and summary into a private same-file `validationAdapterDiscovery()` helper to remove a new complexity warning. Independent code inspection confirms the same operations, exceptions, output fields/copy and execution order: the registered tool still performs structural validation first, then awaits discovery; read scope, report classification and explicit no-run/no-qualification semantics are unchanged. No blocker was found. The source manifest records the previous and updated MCP hashes and confirms the other eight hashes are unchanged.

The owner's post-refactor [11-case green result](mcp-validator-refactor-green.txt) and [strict lint result](mcp-validator-refactor-lint.txt) were reviewed; both commands exited 0. They were not independently executed by this reviewer. The unchanged 22 runtime, four compound and eight wrapper checks were not rerun for this unrelated helper extraction. This addendum supersedes the earlier MCP source hash only; it adds no engine/profile/package qualification or new production evidence.
