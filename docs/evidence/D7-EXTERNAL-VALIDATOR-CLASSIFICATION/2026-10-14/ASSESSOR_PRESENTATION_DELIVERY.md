# Assessor and presentation integration evidence

14 October 2026, canonical branch `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Implements the approved `CONTRACT.md` only. No schema, dependency, provider, model, signature, transmission or branch changes.

## Result

The DB-bound assessor calls the selected adapter's `isConfigured()`, passes its server-owned name/kind to the external gate, and serializes selected/reported identities, raw execution, qualifying execution, known-count marker, factual assessment status and policy enforcement. A selected internal subset is never reported as configured external validation. The four existing gate members and dispatch/freeze/signing composition remain intact.

Canonical external gate views carry an actual status/note independently of policy clearance. Nonblocking failed or invalid external reports show their factual outcome, not Satisfied or Not assessed. An advisory subset execution remains not externally assessed even when raw `ran` is true. Unrun operational diagnostics remain visible, including when another diagnostic row is malformed. A report from another engine is not attributed to the selected subset.

Dispatch Readiness uses factual status for the external card and lead sentence. Its live AnA context includes status, note, known-count marker and selected/reported provenance. Project market rows and the project header retain policy clearance with an explicit advisory failure/invalid caveat, including old responses without a gate breakdown. Legacy clean/unrun views retain their behavior; a legacy positive external error count no longer prints a clean external pass.

## Fail-first evidence

Exact primary command, exit 1, 9 failures and 14 existing passes:

```sh
node node_modules/vitest/vitest.mjs run server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx
```

Output: `assessor-presentation-red-corrected.log`. These fixtures execute the actual DB assessor with a minimal mocked database/structural input and the actual external gate. They do not stand up a database or run a validator process. The earlier `assessor-presentation-red.log` is retained as preliminary evidence: its mock incorrectly supplied an array for numeric `releaseBlockers`; that fixture was corrected before the primary red run. Those preliminary composition failures are not claimed as product defects.

Additional status-first lead regression: `presentation-lead-red.log`, same Dispatch Readiness fixture command, exit 1, 2 failures/3 passes; the external cards already showed the truthful status but the lead still said “external validator clean.” Additional legacy positive-count regression: `presentation-legacy-error-red.log`, same single-file command, exit 1, 1 failure/7 passes.

## Green checks

```sh
node node_modules/vitest/vitest.mjs run server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx
```

`assessor-presentation-green-final.log`: exit 0, **71/71**. Nine assessor fixtures cover selected adapter wiring/config discovery, clean external controls, failed and mismatched advisory reports, invalid count serialization, executed subset/qualification separation, subset/report identity mismatch and malformed unrun diagnostics. Presentation fixtures cover invalid zero placeholders carried into the real AnA surface-context serialization and both canonical/legacy market response shapes. Existing gate/signature tests continue passing.

```sh
node node_modules/vitest/vitest.mjs run client/src/concept2cure/v2/__tests__/dispatchReadinessNamedRules.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessOtherTypes.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessServerGate.test.tsx
```

`assessor-presentation-neighbor-regressions.log`: exit 0, **18/18**. Covers named rule rendering, program/tenant selection, missing/read-failed responses, other application types and authoritative server verdict behavior.

After the final legacy-card helper extraction and current corpus title/ID fixture update, both target lists were rerun together:

```sh
node node_modules/vitest/vitest.mjs run server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts server/services/ectd/__tests__/assess-dispatch-readiness.gates.test.ts client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessNamedRules.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessProgramScope.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessOtherTypes.test.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessServerGate.test.tsx
```

`assessor-presentation-combined-final.log`: exit 0, **89/89** across eight files.

```sh
node node_modules/eslint/bin/eslint.js server/services/ectd/assess-dispatch-readiness.ts server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts client/src/concept2cure/v2/surfaces/programSequence.ts client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx --format json
```

Exit 0, no errors and no new warning instances/functions/categories. `assessor-presentation-lint-comparison.json` retains the before/after comparison: Dispatch Readiness function lines 246→246 and complexity 36→35; assessor function lines 143→137; existing assessor file-size warning grew 503→571. This is not a warning-free lint result.

```sh
node --max-old-space-size=4096 /workspace/scratch/d7-rooted-typecheck.cjs server/services/ectd/assess-dispatch-readiness.ts server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts client/src/concept2cure/v2/surfaces/programSequence.ts client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx client/src/concept2cure/v2/surfaces/ProjectMarkets.tsx client/src/concept2cure/v2/__tests__/dispatchReadinessNotAssessed.test.tsx client/src/concept2cure/v2/__tests__/projectMarkets.test.tsx
```

`assessor-presentation-rooted-typescript.log`: exit 0, **zero selected-scope diagnostics**. The checker (copied here as `assessor-rooted-typecheck.cjs`) uses unchanged repository compiler options, roots its program at these seven files, loads their 3,068 imported/ambient sources, and requests semantic diagnostics for these seven targets plus options/global diagnostics. It does not claim a full repository or full imported-dependency semantic pass. Earlier full-config/all-roots attempt exhausted a 4 GB heap: `assessor-scoped-typescript.log`, exit 134. A subsequent same-method multi-file attempt was interrupted before completion, exit 130, `assessor-presentation-scoped-typescript.log`. Neither is a pass or a reported type regression.

Scoped `git diff --check`: exit 0. Runtime was local Node v24.19.0; no local fixture invokes an external vendor, agency, network or model. Validator-owner and lead QC/corpus evidence are separate.

## Limits

This proves classification, selected-identity wiring and truthful local presentation. It does not authenticate a provider/report, establish a licence, qualify an engine/profile/version, bind validation to exact package bytes, prove tolerant-parser or CLI qualification, or obtain agency acknowledgement. D7 launch acceptance remains a separate row with sponsor/agency evidence obligations.
