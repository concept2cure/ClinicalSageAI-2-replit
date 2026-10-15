# Confirmed: FDA subset clears the required-production external-validation gate

Verified locally on 2026-10-14 against `concept2cure-v2` HEAD `87b27c897c5d1be20b0527009bcaf425ebbf3af6` with one focused deterministic probe. No application, route or storage files were changed; no database, licensed engine, external API or agency was called.

## Result

With no licensed validator configured and `ECTD_REQUIRE_EVALIDATOR=true`, the real resolver selects `fda-criteria-subset` when `EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true`. A clean subset report, supplied with the exact configuration predicate used by the dispatch assessor, makes `evaluateExternalValidationGate` return `cleared=true` and no blockers in production.

| Condition | Noop control | Subset reproduction |
| --- | --- | --- |
| Licensed LORENZ binary/endpoint configured | No | No |
| Required external validator / environment | true / production | true / production |
| Selected validator | `noop` | `fda-criteria-subset` |
| Report ran | false | true |
| Assessor predicate `validator.name !== 'noop'` | false | true |
| Gate cleared | false | **true** |
| Blocker count | 1 | **0** |

The subset itself emits an explicit informational finding: “Passing it is NOT equivalent to passing the agency (LORENZ) validator.” That information does not prevent this gate from clearing.

## Reproducible evidence

- [Probe](/workspace/scratch/team-validator-classification-probe.mts) imports and calls the real resolver, subset validator, environment flag reader and pure gate. Its assertions passed; process exit code was 0.
- [Exact output](/workspace/scratch/team-validator-classification-probe-result.json).
- The fixture contains three synthetic nonempty filenames (`index.xml`, `util/index-md5.txt`, `m1/us/us-regional.xml`) to satisfy the subset's presence/size/name checks. Its contents are expressly **not a valid eCTD dossier**. This tests validator classification, not dossier conformance.
- The subprocess removes `EVALIDATOR_BINARY` and `EVALIDATOR_ENDPOINT` without reading or printing values, and replaces `fetch` with a throwing function. The noop control proves the required gate can refuse; enabling only the subset flag changes the selection and clears it.

Run from the existing repository with its installed local tooling:

```bash
./node_modules/.bin/tsx /workspace/scratch/team-validator-classification-probe.mts
```

## Source chain

1. [Resolver preference](/workspace/Concept2Cure/server/services/ectd/external-validator/index.ts:25): licensed LORENZ → opt-in subset → noop.
2. [Subset coverage disclaimer](/workspace/Concept2Cure/server/services/ectd/external-validator/fda-criteria-adapter.ts:90) and [actual report](/workspace/Concept2Cure/server/services/ectd/external-validator/fda-criteria-adapter.ts:134): `validator='fda-criteria-subset'`, `ran=true`, `passed=(errorCount===0)`.
3. [Assessor classification](/workspace/Concept2Cure/server/services/ectd/assess-dispatch-readiness.ts:766): `externalConfigured = externalValidator.name !== 'noop'`, passed to the gate with the supplied report and environment/required flag.
4. [Gate decision](/workspace/Concept2Cure/server/services/ectd/external-validator/gate.ts:50): required production checks only configured, ran and error count; it does not establish validator authority/coverage.

## Scope and next acceptance criterion

**Confirmed scope:** resolver + actual subset execution + actual pure external gate, using the exact assessor classification. **Not exercised:** the database-bound full dispatch assessor, freeze/export/signature/transport gates or a production deployment. This is not proof that an invalid dossier can reach an agency or that an actual tenant enabled the fallback.

F0 in [adapter plan](/workspace/scratch/team-filing-adapter-plan.md) should treat this as a verified component-level finding. Preserve the subset as useful advisory/internal evidence, but make an independent-required contract demand declared qualified validator authority, supported profile/coverage and a result bound to the exact package. Golden acceptance: the reproduction above remains a subset pass while independent clearance stays false; a genuine qualified report for the matching package/profile can satisfy the separate requirement. No fix was implemented in this verification.
