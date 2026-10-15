# D7 assessor classification integration proposal

Read-only review at HEAD 87b27c897c5d1be20b0527009bcaf425ebbf3af6. Application edits await the root's published contract. Owned prospective scope: `server/services/ectd/assess-dispatch-readiness.ts` and focused tests only. Validator types/adapters/gate, pre-transmit/qualification consumers and UI are separate owners.

## Current defect path

- Assessor line 766 resolves the selected validator; line 767 declares every name other than noop externally configured. The FDA criteria subset's actual name is fda-criteria-subset (`external-validator/fda-criteria-adapter.ts:148`), so internal checks can qualify as an external engine.
- Gate call lines 768–773 supplies configured/report/environment but no selected engine identity. A supplied report from another named engine can be treated as the selected external engine's result.
- `externalNotAssessed` at line 219 tests only raw `ran`. A successfully executed internal subset returns no unassessed note, and `dispatchGateViews` puts the no-errors rule beside `cleared: true`. Existing UI at DispatchReadiness.tsx:87–95 then prints “Satisfied.”
- Returned metadata at assessor lines 872–878 has no selected/report identity or classification; raw ran/configured can therefore overstate external coverage even outside required production.
- The report is passed only by internal/server callers. Most sequence assessment callers pass no external report; this integration must continue to report “not assessed” for those advisory installations and continue fail-closed when required.

## Proposed bounded integration

1. Add one exported assessor helper, tentatively `assessExternalValidationReport`, used by the real DB-bound assessor. Inputs: selected ExternalValidator object, supplied report/null, production/staging environment, required flag. The helper calls `isConfigured()` and feeds the **same** name+kind selection to the real external gate. It never invokes `.validate()`, does not load package bytes and does not query the database.
2. `configured` means selected.kind===external_engine AND selected.isConfigured(); internal_subset availability is represented by kind, not external configured=true. Missing or unknown kind is not inferred from a friendly name.
3. Pass `selectedValidator:{name,kind}` to the shared gate. Require exact report.validator match at the gate, along with validated report shape/counts/pass coherence. The helper delegates that logic, not a second checker.
4. Return the current assessment fields plus additive provenance: selected identity, kind, reported identity, qualifyingRun, and configured/ran/cleared/counts from the gate. Keep raw `ran` meaning supplied report execution; use `qualifyingRun` for the external-check coverage claim and checklist note.
5. Make `externalNotAssessed` operate on qualifying external execution. A ran internal subset must say the internal subset ran but no qualifying external-engine report exists. No-op, absent, unknown, mismatched and invalid reports remain external-not-assessed in advisory mode; required production gates block.
6. Reuse the existing canonical `dispatchGateViews` note placement: external `notAssessed` only when its policy gate is cleared. Blocked production rows retain real blockers. Structural, Shadow Review and signature gates remain untouched.
7. No package/profile identity claim is added. The existing report shape cannot bind sequence/package digest or regulator profile version. This slice binds classification and selected/report engine identity only.

## Advisory failure caveat for the shared contract

A coherent matching external report can execute and fail while advisory policy remains nonblocking. This is assessed-with-errors, **not** not-assessed. The existing canonical row currently prints Satisfied when cleared=true and notAssessed absent. Do not solve it by lying that the check did not run or coercing gate.cleared=false (which changes enforcement). Prefer a separate factual external assessment status/note surfaced by the canonical UI. Root must explicitly allocate that interface/UI change or record it as a residual. `qualifyingRun` should mean a valid matching external execution, separate from passed-clean status; required production still needs both.

## Focused fixture, without full DB setup

Use the actual exported assessor helper and real `evaluateExternalValidationGate`, plus `dispatchGateViews` with neutral structural/Shadow/signature parts. Mock only the selected adapter object's configuration check (or use the actual resolver under a restored, explicitly controlled test environment). Supply a real-shape clean internal subset report:

```text
selected: { name: fda-criteria-subset, kind: internal_subset, isConfigured: true }
report: { validator: fda-criteria-subset, ran: true, findings: [subset notice info],
          errorCount: 0, warningCount: 0, passed: true }
```

Required production must block with configured=false and qualifyingRun=false while raw ran=true. Advisory must remain cleared but its canonical external row has notAssessed explaining internal subset coverage. JSON serialization must preserve selected/reported identity and kind. A companion positive uses a configured external_engine named lorenz-evalidator with a matching coherent clean report and must clear without an unassessed note. A mismatch companion supplies fda-criteria-subset report to selected lorenz-evalidator and must fail required production. Add a same-name unknown-kind case so the fixture cannot pass by hardcoding names.

This is meaningful integration coverage: changing only gate internals is not enough if the assessor still sends name!=noop or raw ran to the canonical note. The test observes the actual helper result and actual checklist construction, not a source-string assertion or a replica of the classification expression.

## Evidence and validation

After approval: evidence under `docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/`, including baseline refusal/failing fixture, passing fixture, targeted neighboring gate suite, and a scoped type/lint result. Use a behavior mutant reverting classification/identity input or raw-ran note to prove the integration test catches the defect. No models, providers, package validation executables, database migrations, branches or commits are needed.
