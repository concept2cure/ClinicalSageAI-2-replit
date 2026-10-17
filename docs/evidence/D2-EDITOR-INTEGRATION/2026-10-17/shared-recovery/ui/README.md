# Shared recovery controls in the existing document hosts

W1 / D2, canonical `concept2cure-v2`, initial source `bfec9be6b`.
Implements the UI portion of
[the approved contract](../../../../../design/AUTHORING_SHARED_RECOVERY_2026-10-17.md).
No CSS, dialog, surface, editor, dependency or endpoint was added.

`AuthoringRecoveryNotice` extracts the existing native creation notice's
`scaf-note`, status/alert semantics and `btn ghost` controls.
`AuthoringCreateExport` uses that presentation with its existing messages,
button labels, callbacks and workbench notice placement. The specialist wrapper
uses the same presentation for explicit Check, Continue and Open actions.

All six caller modules use the shared controller and retain a stable
`saveToAuthoring = handoff.save` alias. Biostatistics Open and Attach share one
creation lane. Calculator and PV insertion use the controller's synchronous
admission rather than a React busy state as a lock. Existing local writer refs
and state were removed; CMC correspondence retains its separate lifecycle
operation guard while updating the question after a new confirmed save.
Reusing a confirmed CMC draft does not replay that update.

The notices sit beside source results, outside horizontal action toolbars:
Biostatistics and Reporting below their answer lead; CMC change before its
result; CMC quality between the document action bar and page; correspondence
below the card header; calculator and PV below insertion controls. Source
results remain visible during checks and continuation. Scoped inventory is
shown only when the document identity is unknown. It explicitly states that
the list cannot identify which request created a document. A known document
gets document-specific Check, Continue and inspection actions instead.

## Actual verification

- [RED](red.txt): **2 failures, 0 passes** on unchanged production. Reporting
  had no actionable persistent check control after a lost response, and a retry
  after a confirmed document plus refused section created another document.
  The two-case suite subsequently expanded to five cases.
- [Final run](green-final.txt): **112/112 pass across three files**: five new
  Reporting UI cases, 81 existing native creation/recovery cases and 26 existing
  native creation/export cases. The new cases verify inventory with explicit
  uncertainty, failed-check blocking, source preservation, section-only
  continuation and a separate exact saved-document open. Checks never navigate
  or write; continuation never creates another document.
- [Final lint](lint-final.json): **0 errors**, with each existing surface's
  warning count unchanged (**39 total**). Both new presentation files, the new
  test file and native create/export surface have no warnings and pass
  [strict lint](lint-new-and-native.txt).
- [Source manifests](source-pins-before.json) and
  [final source manifests](source-pins-after.json) match for 16 source/test files.
  Fifteen pins were recorded before the final run; the shared ledger's pin was
  added while that run was active. Root owns the final integrated verification.

The first green run passed 109/109 before the three additional UI cases.
The expanded five-case run also passed. Initial lint exposed a new wrapper
complexity warning and one additional CMC handler complexity warning; extracting
small presentation/navigation helpers removed both without suppressions or
baseline changes. Candidate receipts remain visible. Existing native test
diagnostics, including React act warnings, remain in the stored output.
[Receipt storage metadata](receipt-storage.json) preserves captured raw and
stored hashes; text normalization changes only trailing whitespace at EOF.

Only HTTP responses are synthetic. The tests use actual Reporting controls,
canonical writer, session/project guards and editor target channel. Native
recovery exercises the actual existing controls and forms. This is not browser,
SQL, provider-backed AnA, independent human-review, deployment or agency evidence.
The component-owned recovery ledger does not survive remount, reload or another
tab and does not establish backend idempotency.

## Existing notice assertions

Root's first related six-file regression completed with 98 passes and 12
failures. All failures were in `openInEditorHandoff.test.tsx`: an unscoped text
lookup now matched both the persistent recovery notice and transient toast.
The exact messages were present in both places; no production defect was
established. Eight direct assertions and the shared four-case no-project
helper now specifically select `.scaf-note[role="alert"]`. The same two positive
lookups in `cmcCorrCrossLinks.test.tsx` received that selector. No payload,
zero-write, navigation or retained-source assertion was removed or weakened.

[The affected two-file run](legacy-notice-regression.txt) passes **43/43**,
and [strict lint](legacy-notice-lint-result.json) exits zero with no warnings.
[The supplemental summary](legacy-notice-summary.json) pins those test files;
root retains the complete initial regression receipt separately. No production
source changed for this alignment.

Reproduce with the existing Node 22 toolchain and installed dependencies:

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run \
  client/src/concept2cure/v2/__tests__/specialistHandoffRecoveryUi.test.tsx \
  client/src/concept2cure/v2/__tests__/authoringCreationRecovery.test.tsx \
  client/src/concept2cure/v2/__tests__/authoringCreateExport.test.tsx
```
