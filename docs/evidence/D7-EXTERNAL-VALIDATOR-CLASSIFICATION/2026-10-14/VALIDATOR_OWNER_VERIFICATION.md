# D7 validator owner — implementation and focused proof

14 October 2026. Baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`; canonical branch `concept2cure-v2`. Owned application scope: `server/services/ectd/external-validator/**`. Assessor, client, route/storage, signature and shadow integration remain with their named owners. No new dependency, API/agency/provider call, credential inspection, migration, branch, commit or push.

## Implemented contract

- Real adapters carry `external_engine`, `internal_subset` or `unavailable`; missing/unrecognized selected classification becomes `unknown` in the gate.
- Required production clearance refuses subset/unavailable/unknown paths, missing/unrun reports, exact identity mismatch and incoherent executed reports. A misleading `configured=true` cannot qualify a subset.
- Executed report coherence checks strict booleans, finite Date, nonempty profile, safe nonnegative integer counts, known finding severity, canonical severity tally and consistent pass result. Report shape stays unchanged; the gate does not mutate supplied diagnostics.
- `ran` retains the report's strict execution declaration. `qualifyingRun` distinguishes a configured matching coherent external execution from an internal subset and includes external executions that found errors. `assessmentStatus` preserves passed/failed/not_assessed/invalid independently of policy.
- Advisory staging/flag-off remains nonblocking while failed/invalid status stays visible. Current subset pass and its notice remain in the raw report; the external obligation remains not_assessed.
- `errorCountKnown=false` marks numeric zero as a compatibility placeholder, not an observed clean tally, for missing/unrun/incoherent reports. Coherent mismatched reports can retain known supplied counts while identity status remains invalid.
- Existing unrun operational error envelope retains its error finding with zero content-error count. No execution failure is turned into invented content error counts.
- Owned runtime comments now distinguish configuration discovery from licence/provider/profile qualification and engine success from agency acceptance. XML/CLI parsing/execution behavior was not expanded.

## Fail first

Before production edits, the new actual-resolver test selected the FDA subset, ran its real local structural checks and observed required clearance incorrectly return true. All 39 initial contract cases failed on baseline. The Node 22 proof is [validator-classification-node22-red.txt](validator-classification-node22-red.txt); [default-runtime red](validator-classification-red.txt) also records the earlier Node 24 run. These are assertion failures, not loader/startup failures.

The approved count-validity addendum was also tested before its production change: [validator-count-known-node22-red.txt](validator-count-known-node22-red.txt), 27 failures and 16 passes. The legacy scoped regression run identified three old tests relying on missing selection/uncorroborated fixture tallies: [before compatibility](validator-regressions-before-compatibility.txt). Their valid external controls now supply the selected descriptor and independent coherent findings/counts rather than weakening the new contract.

## Final scoped verification

Node 22.23.3 at `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`; installed locked repository dependencies used. Commands from repository root:

```bash
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/ectd/external-validator/__tests__
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/typescript/bin/tsc --project docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/tsconfig.validator-scope.json
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/eslint/bin/eslint.js server/services/ectd/external-validator
git diff --check -- server/services/ectd/external-validator
```

- [75/75 tests, four suites, exit 0](validator-regressions-node22-green.txt): 43 classification/authority/policy/count cases plus existing subset and severity/parser/resolver regressions. Local synthetic external descriptors exercise the contract; no licensed tool actually ran. Fetch is replaced with a throwing local stub in resolver/run-failure cases.
- [Scoped TypeScript, exit 0](validator-tsc-node22.txt), using [exact scope config](tsconfig.validator-scope.json).
- [Scoped ESLint, exit 0](validator-eslint-node22.txt): zero errors and two existing complexity warnings in the unchanged Lorenz parser functions. [HEAD baseline](validator-eslint-node22-baseline.txt) shows the same two complexity values. No new warning remains; gate helpers reuse canonical `tallyFindings`.
- Diff whitespace check passed. These checks do not certify other owners' changes or the full application.

## Qualification still owed

This component fix does not authenticate the external service or imported report, establish a licence, pin/qualify criteria or a regional profile, bind the report to exact package bytes, qualify tolerant XML parsing or CLI invocation, nor obtain an agency acknowledgement. `external_engine` describes the selected integration path. `qualifyingRun` describes this control contract, not independent regulatory qualification. Separate qualification-runner wording using non-noop as “external” was handed to the lead; that file is outside this owner's application scope.
