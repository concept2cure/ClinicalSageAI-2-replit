# D7 external-validator classification contract

14 October 2026. Control-tower approved implementation boundary for the continued Data Room improvement work. Canonical branch `concept2cure-v2`; baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. This moves the D7 external-validation seam, not D7's sponsor/agency acceptance or overall launch status.

## Invariant

With `ECTD_REQUIRE_EVALIDATOR=true` in production, an internal FDA subset cannot satisfy the external-validator requirement, even when it ran clean or the supplied configuration boolean says true. An unknown/unavailable adapter, missing report, failed execution, invalid report or report from a different selected engine must also refuse required clearance.

Advisory behavior remains nonblocking when enforcement is off or the environment is staging. A nonblocking gate is not a successful validation. Canonical status and existing client views must distinguish an external pass, an external failure, a validation not assessed by an external engine, and an invalid/mismatched report. Internal subset diagnostics remain available.

## Shared API

```ts
type ExternalValidatorKind = 'external_engine' | 'internal_subset' | 'unavailable' | 'unknown';
// ExternalValidator adds readonly kind: ExternalValidatorKind.
// LORENZ adapter: external_engine; FDA subset: internal_subset; noop: unavailable.

// ExternalValidationGateInput adds:
selectedValidator?: { name: string; kind: ExternalValidatorKind };

// ExternalValidationGateResult adds:
validatorKind: ExternalValidatorKind;
selectedValidatorName: string | null;
reportedValidatorName: string | null;
qualifyingRun: boolean;
errorCountKnown: boolean;
assessmentStatus: 'passed' | 'failed' | 'not_assessed' | 'invalid';
enforced: boolean;
```

The report shape remains unchanged. Classification comes from the selected server adapter, never an authority claim read from a submitted report. Missing or unrecognized classification is unknown. Selected/report names must be nonempty exact identities; there is no permissive normalization that turns the subset into an external engine.

`configured` in returned assessment means a configured external-engine path, not that a subset flag is enabled. Configuration discovery checks a path/URL; it is not proof of a licence, actual provider identity or qualified engine/profile. `ran` retains whether the supplied report declares actual execution. `qualifyingRun` means a configured, explicitly external, identity-matched and internally coherent execution, including one that found errors. It does not imply success or independently qualified coverage.

For executed reports, require strict booleans, a finite Date `ranAt`, a nonempty profile, findings with known severities, nonnegative safe-integer counts agreeing with those findings, and `passed === (ran && errorCount === 0)`. Bad metadata or inconsistent pass/counts cannot clear required validation. Preserve the existing unrun failure envelope: its operational error finding with `errorCount=0` is not a fabricated content error. An unrun report never supplies a qualifying run; coherence of executed content counts must not erase that failure diagnostic.

`assessmentStatus` is passed/failed for coherent matched external executions, not_assessed for unavailable/internal/unrun paths, and invalid for malformed or mismatched reports from a selected configured external engine. Required clearance needs a qualifying run with a passed clean report. Advisory outcomes carry the same factual status without policy blockers.

Addendum approved before implementation: `errorCountKnown` is true only for a strictly executed, internally coherent supplied report. Missing, unrun, malformed or inconsistent counts are unknown; the retained numeric `externalErrorCount=0` is then a compatibility placeholder, not an observed clean count. Preserve the original report diagnostics. Known counts do not authenticate the reported engine or package, and a coherent report from the wrong selected engine still has invalid status. API/presentation consumers must use status and the known-count marker rather than rendering an unknown count as zero clean findings.

## Integration and ownership

- Validator owner: `server/services/ectd/external-validator/**`, including meaningful fail-first and compatibility tests. Preserve report/run-failure diagnostics and resolver preference.
- Assessor/presentation owner: `server/services/ectd/assess-dispatch-readiness.ts`, focused assessor tests, and the existing shared client gate type/DispatchReadiness/ProjectMarkets views plus focused existing presentation tests as needed. Carry selected/reported identities and factual status; distinguish advisory failed/invalid outcomes from both Satisfied and Not assessed. Preserve gate membership, signing, freeze and shadow controls.
- Lead: this contract, evidence/index, integration/proof documentation, study/delivery status and final review. No overlapping implementation scopes. Independent agents review the contract, operational claims and customer acceptance; the D2 agent prepares recovery research without app changes.

Caller addendum approved after whole-server discovery: the pre-transmit worker owns `submission-gateways/pre-transmit-check.ts` and its focused tests. Its input carries the optional trusted selected descriptor; no descriptor is not evidence of an external engine. The check's `passed` means the actual validation passed, while overall `cleared` remains enforcement policy; advisory failures/unassessed checks retain warnings. The existing low-level guard's `enforceExternal=false` is unchanged. The tool worker owns `mcp/tools/validation.ts` and its focused tests: identify kind and adapter availability, reserve external-configured for an external adapter, and explicitly state that configuration introspection did not execute or qualify the validator. These are migrations of existing consumers, not new surfaces or integrations.

Client gate view fields are additive: optional `assessmentStatus` and `assessmentNote` for the external gate. Existing `notAssessed` remains for nonblocking external checks that did not qualify as an assessment. Failed/invalid advisory reports use their explicit status/note, not a false Not assessed label. Preserve legacy views without these additive fields. Existing corpus text describes an obligation; render an actual outcome separately and never infer a validation pass from `cleared` alone.

## Acceptance evidence

Observe the current code failing real-resolver clean-subset refusal before edits. Also cover external matched clean/warning/error controls, unavailable/unknown/missing class, mismatched selected/report engine, invalid booleans/counts/severities/date/pass, unrun operational error, advisory failure visibility, raw executed subset versus qualifying external execution, assessor wiring and composed gate/signature behavior. No local test invokes a licensed tool, agency, network or model.

Required suites include validator/severity/parser regressions, focused assessor gate tests, affected presentation tests, scoped TypeScript and lint with comparison to existing warnings. File exact red/green commands and limits here. Preserve the previous D2 storage changes and their completed evidence.

## Explicit qualification boundary

This patch does not authenticate a vendor service/report, establish licences, pin/qualify tool or criteria versions, bind a report to exact package bytes/profile, qualify tolerant XML parsing/CLI execution, or record a real regulator acknowledgement. Those remain separate D7 increments. A fixture's external_engine marker exercises the control contract; it is not proof that a real engine is qualified. No new dependency, schema, surface, credential, scope unlock, signing, transmission, deployment or push is part of this slice.
