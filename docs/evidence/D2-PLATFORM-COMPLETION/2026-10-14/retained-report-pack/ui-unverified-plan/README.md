# Unverified reporting plan controls

W1 / D2, Reporting & analytics, `concept2cure-v2`, 2026-10-14. An explicit unresolved overview plan now withholds report generation and says **the plan could not be verified**. The client does not substitute its fallback tier's upgrade or role explanation for that verification failure. This bounded change follows the canonical backend's explicit flag, preserves the existing omitted-flag compatibility, and leaves retained report reads and library navigation available.

`canWrite` remains the editor-role decision. `canExecute = canWrite && tierResolved` drives catalog and dashboard run availability, using the existing `data?.tierResolved !== false` computation. Report dispatch and the generation-bearing find handler refuse explicit false before any run POST. Find and report suggestion controls disable, packs remain browsable with verification reasons, and computed catalog rows become unavailable with the same reason. The no-program catalog also receives the notice. The underlying supported computation, source facts and actual scope are retained; plan unavailability is not described as an absent engine. Known/legacy generation, view-only role behavior, retained history, exports and signed finalization remain covered by existing regressions.

One canonical verification sentence is reused. A private card helper retains the same DOM and existing classes, keeping the dashboard within its lint function-size limit. No stylesheet, icon, persona, module, shell or external integration changed. The existing bundle PDF download helper and session-guarded export callback compare byte-identically with this phase's baseline.

## Verification

| Phase | Result | Qualification |
| --- | --- | --- |
| Initial prospective test preparation | 9 failed; 3 original notice cases intentionally skipped | New tests had inaccurate heading/report-container locators in addition to the six real missing controls. Retained raw as test-preparation evidence. |
| Second prospective test preparation | 7 failed, 2 passed; 3 intentionally skipped | Six actual missing controls; one retained-history Open locator still needed correction. |
| Corrected prospective baseline | 6 failed, 3 passed; 3 intentionally skipped; 3.38 seconds | Production unchanged. Actual missing Find, dispatch, portfolio-copy, pack, catalog and no-program catalog controls failed. Known Standard, omitted-flag execution and retained-history controls passed. |
| First implementation regression | 161 passed in 17 files; no failures/skips; 40.48 seconds | Lint found one new dashboard function-size warning. The new card markup was extracted without changing its DOM/styles. |
| Final source freeze | 161 passed in 17 files; no failures/skips; 30.77 seconds | Every Insights TSX suite, including the existing 55-case report/export/session group and nine new plan controls. |
| Final scoped ESLint | 0 errors, 7 existing Insights warnings; 0 test warnings | No warning growth, suppression or baseline edit. |

The existing three notice/compatibility cases remain: explicit false names no plan, true adds no warning, and an omitted flag retains its declared compatibility. The explicit-false notice assertion now checks the precise verification wording. The new controls test unavailable generation despite a writing role, handler refusal when Enter reaches it, avoidance of an invented portfolio upgrade, readable but non-runnable packs, catalog generation with and without a lead program, two known/legacy generation positives, and reading a retained report from history with no run POST.

Canonical final invocation under Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/insights*.test.tsx
```

[The 161-case inventory](test-inventory.json) records the exact cases/files. The [manifest](source-and-artifact-manifest.json) pins 22 relevant source/test/dependency files, the baseline and artifacts, and all 33 earlier UI evidence files without rewriting them. Seven raw logs are preserved losslessly as deterministic gzip archives. Readable logs normalize terminal blank lines and printer-added trailing spaces/tabs; the raw archives are unchanged. Raw/readable byte counts, digests, normalization details and verified decompression are recorded.

## Scope and release qualification

This fixes explicit unresolved-plan generation. The separately observed known-Free local rank mismatch remains assigned to the next authorized increment; this phase does not claim it is corrected. Canonical server admission remains authoritative. The omitted-flag client compatibility is deliberately retained under the control tower's instruction; the current canonical backend emits the explicit boolean flag.

The tests use bounded API responses. This phase does not supply native server policy, complete PDF/seal/audit verification, real browser/mobile rendering, scientific or clinical qualification, dossier completeness or deployment evidence. Earlier PDF/browser records remain historical evidence for their original source pins; they were not rerun or relabeled for this source change. No compiler, provider, native-database, index, commit or push operation was performed by this UI slice. The control tower owns the sole compiler and release gates. Later sequential regional/Free work must preserve these execution and session/export guards and rebase on this freeze.
