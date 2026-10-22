# Actual-plan reporting execution

W1 / D2, Reporting & analytics, `concept2cure-v2`, 2026-10-14. This implements the approved [actual-plan execution contract](../../../../design/REPORTING_ACTUAL_PLAN_EXECUTION.md). A known Free plan ranks below Standard, and selecting another plan for preview cannot authorize a report request. The actual recorded plan and any explicit canonical per-type denial are checked before the run POST. No price, plan choice, capability or server policy is added.

The three existing preview choices still show what their plans include. Available execution uses the actual tier; an explicit canonical denial also remains denied even if the local family rank would permit it. The dispatch guard reads the original catalog row, so a preview's presentation fields cannot overwrite that denial. Legacy rows with omitted entitlement fields retain the existing local fallback, and the declared omitted-resolution-flag compatibility is retained. Explicit unresolved-plan verification remains the first plan refusal.

`canWrite` remains the role decision and `canExecute = canWrite && tierResolved` is preserved. Per-type actual-plan refusal is applied to pack and catalog actions in addition to that decision. The optional catalog reason callback supplies the precise title and note to disabled actions, including document trace. A writing Free user sees a plan requirement rather than a missing-editor or unread-plan claim. Private note/title helpers reuse the same DOM/classes and keep component lint budgets unchanged. There is no stylesheet, icon, selector, shell, module or integration change.

The regional phase's sixteen source pins matched before work started. The fourteen unowned regional source pins still match. Wrong-filing/context notes, reason codes, scope constraints, the regional Availability filter and preview discovery remain intact. Pack scope refusal precedes the actual-plan explanation. Existing bundle PDF/session-guard helper and callback bodies remain byte-identical, as do the role/unresolved/legacy decisions and independent regional availability mapping. Saved history and retained reports remain readable.

## Verification

| Phase | Outcome | Qualification |
| --- | --- | --- |
| Prospective current-source controls | 11 failed, 11 passed; no skips; 3.19 seconds | Actual Free/find/pack/catalog/preview/canonical-denial/document-action gaps failed. Known plans, legacy resolution, unresolved precedence, retained history, existing role behavior, preview choices and wrong-filing/scope controls passed. |
| First implementation regression | 191 passed across 19 files; no failures/skips; 36.61 seconds | Scoped lint found three new component size/complexity warnings. Shared action-note/title helpers and one combined dashboard declaration removed the warning growth without changing DOM or policy. |
| Final source freeze | 191 passed across 19 files; no failures/skips; 37.30 seconds | All existing 169 Insights cases plus 22 new actual-plan controls pass. |
| Final scoped ESLint | 0 errors, 7 existing Insights warnings; 0 warnings in CatalogPanel or the new suite | No warning growth, baseline edit or suppression. |

The new controls include Free default and Standard/Enterprise previews through Find, packs and catalog; a selected document trace; an explicit canonical type denial despite a higher preview; exact wrong-filing and unsupported-scope reasons; known Standard/Professional/Enterprise execution; legacy omitted resolution; explicit verification failure; Free retained-history read; view-only known-entitled behavior; and exactly the same three preview choices.

Canonical final invocation under Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/insights*.test.tsx
```

[The inventory](test-inventory.json) records all 191 cases. [The manifest](source-and-artifact-manifest.json) pins 24 source/test/dependency/design files, the preimplementation regional snapshot, the artifacts, and 66 prior regional/UI evidence files without rewriting them. Five raw logs are retained losslessly in deterministic gzip archives. Readable logs normalize terminal blank lines and printer-added trailing whitespace; raw/readable bytes/digests, normalization and archive round-trip checks are recorded.

## Qualification

These are client execution/discovery checks against bounded API responses. Canonical server access, entitlement and filing admission remain authoritative; a client guard does not replace them. This evidence does not establish native tenant isolation, compiler completion, a real browser/mobile rendering, complete PDF/seal/audit verification, scientific or clinical qualification, dossier completeness or deployment.

Earlier regional, retained-PDF and browser records remain historical evidence for their exact source pins. They were not relabeled for this Free-plan change. This slice ran no compiler, native database, provider, index, commit or push operation. Heavy slot 2 was released after final tests/lint, and source is frozen for the control tower's integration gates and publication.
