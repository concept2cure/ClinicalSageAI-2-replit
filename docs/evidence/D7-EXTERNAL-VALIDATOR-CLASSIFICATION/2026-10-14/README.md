# D7: external-validator classification and truthful advisory results

14 October 2026. Canonical branch `concept2cure-v2`; assessed baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Local continuation of the Data Room enhancement plan. This improves the D7 validation seam; D7's real sponsor/test submission and acknowledgement requirements remain open. No push, deployment, agency/vendor/model call, credential change, schema or production dependency was introduced.

## Outcome

An opt-in internal FDA subset can no longer satisfy a required-production external-validator gate. Real adapters carry explicit server-selected kinds; the gate checks selected/report identity and executed-report coherence. Unknown, internal, unavailable, missing, unrun, inconsistent or mismatched evidence refuses required clearance.

Policy clearance and assessment outcome are distinct. Staging/flag-off remains advisory, but an errored external report stays failed, an invalid report stays invalid, and internal/unrun checks stay not assessed by an external engine. These results reach the canonical assessor, readiness and market views, AnA surface context, deterministic dispatch-QC warnings, pre-transmit check and MCP discovery. Existing structural, Shadow Review, signing and low-level gateway controls retain their own behavior.

Original reports remain unchanged. `errorCountKnown=false` identifies an unknown content-error tally; numeric zero is then a compatibility placeholder and never displayed as a clean finding count. A coherent report from the wrong engine can retain its known supplied count but cannot establish a valid selected-engine assessment.

## Recorded behavior

| Evidence | External assessment | Required production | Advisory policy |
| --- | --- | --- | --- |
| Real internal subset ran clean | not_assessed; raw ran true, qualifyingRun false | Blocks | Does not block; internal-only result disclosed |
| Matching coherent configured external report, clean or warnings only | passed; qualifyingRun true | This gate clears | This gate clears |
| Matching coherent external report with errors | failed; qualifyingRun true, known errors | Blocks | Does not block; failure disclosed |
| External report absent or execution failed | not_assessed; no qualifying run | Blocks | Does not block; absence/execution diagnostic disclosed |
| Report malformed, inconsistent or names another engine | invalid; no qualifying run | Blocks | Does not block; invalidity disclosed |
| Unknown/unavailable selected adapter | not_assessed; no qualifying run | Blocks | Does not block; unknown/absence disclosed |

An external_engine fixture exercises this classification contract. It is not proof of a real licensed or qualified engine. Configuration discovery establishes a path/URL or subset option, not licence, provider identity, execution or profile coverage. MCP explicitly reports discovery as not_run/not_assessed and distinguishes adapter availability from external configuration.

## Contracts and independent reviews

- [Approved contract and caller/count addenda](CONTRACT.md), published before the relevant changes.
- [Validator owner verification](VALIDATOR_OWNER_VERIFICATION.md).
- [Assessor, screens and AnA context verification](ASSESSOR_PRESENTATION_DELIVERY.md).
- [Pre-transmit caller verification](PRE_TRANSMIT_INTEGRATION_VERIFICATION.md).
- [MCP tool discovery verification](mcp-validator-metadata.md).
- [Final independent review](FINAL_INDEPENDENT_REVIEW.md): 34 independently executed runtime/compound/pre-transmit checks; MCP owner fixtures reviewed separately.
- [Customer acceptance rubric](validator-client-acceptance.md) and [regulatory/claim review](validator-qualification-claims.md).
- [Portable real-resolver current regression](../../../reports/data-room-research-2026-10-14/validator-classification-probe.mts) and [current output](../../../reports/data-room-research-2026-10-14/validator-classification-probe-result.json): the subset's own report passes, while required external clearance remains false. The original baseline probe/output are retained here as historical artifacts; their old defective-clearance assertions are not the current regression contract.

## Fail-first and green evidence

Before production edits, the real resolver/subset failed the required-refusal assertion. The initial classification contract suite recorded 39 failed cases, and the count-validity addendum recorded 27 failures/16 controls. These counts are contract-test failures, not counts of distinct production incidents. See validator-classification-node22-red.txt and validator-count-known-node22-red.txt.

Assessor/presentation red evidence includes false external configuration, advisory failures shown as Satisfied, and a later lead sentence still calling an errored report clean. Preliminary fixture limitations and corrected runs are retained in the owner note. QC recorded three missing-caveat failures with twelve controls; pre-transmit recorded nine failures/nineteen controls; MCP discovery and invalid metadata also failed before their fixes. Passing tests alone were not treated as sufficient gate evidence.

The final combined Node 22.23.3 run is **230/230 tests across 15 files**, exit 0, in [final-combined-green.txt](final-combined-green.txt). It covers all four validator suites, the actual DB-bound assessor with controlled database boundaries, canonical gate/signature composition, deterministic QC, affected screens, pre-transmit checks and actual registered MCP tool calls. The neighboring presentation/guard reports were additionally checked by their owners; their exact scopes and runtimes are in the notes. No test executed a licensed validator or agency endpoint.

Scoped TypeScript evidence:

- Validator directory: ordinary scoped `tsc`, exit 0, no diagnostics, exact tsconfig retained.
- Assessor/presentation: zero syntactic/semantic diagnostics on seven owned targets, with repository options and imported sources available. This deliberately does not claim semantic checking of every imported source.
- QC/corpus/pre-transmit/MCP: zero diagnostics on seven selected targets under Node 22, in [qc-callers-target-typecheck.txt](qc-callers-target-typecheck.txt). [Portable checker](owned-target-typecheck.cjs) retains the exact selected-source method.
- Earlier all-root TypeScript attempts exhausted a 4 GB heap or were interrupted. Their logs remain; neither is a pass. No whole-repository typecheck or production build is claimed.

Scoped lint has zero errors and no newly introduced warnings in the final patch. Existing Lorenz parser, assessor/screen, pre-transmit and corpus size/complexity warnings are recorded separately. The MCP tool initially introduced a complexity warning despite ESLint exit 0; comparison to HEAD found it, and a local helper refactor removed it. The eleven MCP cases and `--max-warnings 0` were then rerun successfully. Baseline/current diagnostics and final owner logs are retained.

## Reproduction

From the repository root, using Node 22 and the locked dependencies:

```sh
NODE_OPTIONS='--max-old-space-size=4096' node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/ectd/external-validator/__tests__ server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts server/services/ectd/__tests__/dispatch-gate.test.ts server/services/submission-ai/__tests__/dispatch-qc-deterministic.test.ts client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessNamedRules.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessServerGate.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx server/services/submission-gateways/__tests__/pre-transmit-check.test.ts server/mcp/__tests__/mcp-validation-adapter-metadata.test.ts
node node_modules/tsx/dist/cli.mjs docs/reports/data-room-research-2026-10-14/validator-classification-probe.mts
```

The recorded lead run used `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`; the commands above use the reader's supported Node installation. Dedicated source-specific and independent commands are retained beside their logs. Diff whitespace checks passed. Prior D2 storage changes/evidence are preserved, not silently requalified by these tests.

## Remaining qualification and next work

Provider/report authenticity, usable licensing, pinned engine/criteria/profile coverage, exact-package/report binding, tolerant XML/CLI behavior and actual regulator acknowledgements remain separate D7 work. The qualification runner's existing non-noop-as-external labels also remain an explicit follow-up; this patch does not promote its partial outputs to regional qualification. A clean local report or a fixture cannot establish agency acceptance.

The parallel [D2 processing-recovery handoff](../../D2-PROCESSING-RECOVERY-STUDY/2026-10-14/README.md) reproduced five unresolved processing contracts with three controls using actual service SQL and selected real migrations in embedded PGlite. It proposes the next bounded repair, not a deployed fix. Its opt-in intentionally failing probe is outside normal test collection. No client backlog was repaired.

## Subsequent D2 continuation, 14 October 2026

The bounded [processing-recovery implementation](../../D2-PROCESSING-RECOVERY/2026-10-14/README.md) is now locally verified: 532 focused tests, 21 independent checks and 13 genuine PostgreSQL cases pass. The preparation and its recorded red probe above remain historical evidence against the pinned baseline; they are not the current regression suite and should not be rerun against changed processing code to reproduce the old results. No live client backlog was repaired, and D7 provider/package/agency qualification remains separate.
