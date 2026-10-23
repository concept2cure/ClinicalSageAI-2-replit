# D2 / WO06 — New document template search

Bounded frontend continuation on `concept2cure-v2`, based on
`990a687c6eb31adb1becfa58d91fc9d2932f23ed`. This supports D2; it does not close
the full launch or demo acceptance row.

The existing New document drawer now searches the templates already returned by
`GET /api/authoring/templates`. It retains a native select, blank-document option,
existing form validation, template placement/guidance and the selected project.
Filtering never changes the selected template: an excluded selection remains in
an explicitly labeled group. Clear restores browsing and input focus; counts name
only loaded templates when the shared catalog failed. Loading, empty catalog,
zero matches, partial-catalog failure and complete read failure remain distinct.

Search reads the endpoint's existing name/title/template_name, description,
template_type, category, regions, module, entryId, kind, authoringMode,
originalFormat, families, limitations and filingContext fields. This shape was
checked against `server/routes/authoring.router.ts` and its builtin projection.
No new API, catalog, dependency, model approval or authority is introduced.
The create request still contains title, module, optional original template_id
and the existing client_program_id.

The approved small C2CForm extension permits a custom control for an existing
field. Returning undefined uses the original renderer; derived fields, values,
required validation and accessibility descriptions remain owned by C2CForm.
The picker uses existing `de-*`/`btn ghost` styles and spacing tokens.

## Verification

Node v22.22.0, heap ceiling 4096 MB; Vitest v4.1.7. Synthetic transport, real
drawer/form controls. No app, provider or database operation was performed.

- RED before implementation: **26 failed, 1 passed**, two new suites, exit 1.
  Failures expose absent search/count/status UI and absent custom rendering;
  the unchanged native-select case passes. Baseline owned files and tests are
  pinned by `red-source.sha256`.
- GREEN after implementation: **136 passed**, five suites, exit 0 (21.45 s).
  Includes the two new suites and existing authoringCreationRecovery,
  authoringCreateExport and c2cFormA11y regressions. `green.log` is the full log.
- Targeted ESLint: exit 0, zero errors; two structural warnings in C2CForm
  (function length and complexity), recorded in `lint.log`.
- Owned-source whitespace check passed. The initial five-file candidate was hashed
  before GREEN and verified unchanged afterward using `green-source.sha256`.
  This is a bounded source freeze; other coordinated work remains in progress.

The new cases cover returned title/metadata search, trimming/case handling,
browsing/count/clear, no matches, retained selected-template ID/module/project,
preparation placement, unchanged blank payload, reopen reset, keyboard typing,
clear activation, native selection, focus trap/restoration, loading, real empty
catalog, HTTP/network/malformed failure, partial reads and custom-field validation.

Reproduce GREEN from the repository root:

```sh
/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin/node --max-old-space-size=4096 node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/v2/__tests__/authoringTemplateSearch.test.tsx client/src/concept2cure/v2/__tests__/c2cFormCustomField.test.tsx client/src/concept2cure/v2/__tests__/authoringCreationRecovery.test.tsx client/src/concept2cure/v2/__tests__/authoringCreateExport.test.tsx client/src/concept2cure/v2/__tests__/c2cFormA11y.test.tsx
```

`red.log.gz` is deterministic gzip (`gzip -n`) of the full 989,292-byte RED log.
`red-log-decoded.sha256` records the hash and original decoded path (`red.log`);
the uncompressed file is intentionally omitted. Decode to that path before
using `sha256sum --check`, or compare `gzip -dc red.log.gz | sha256sum` with
the recorded digest. Historical sealed evidence was not changed.

## Narrow-input follow-up

Static CSS review found that the drawer is `min(520px,94vw)` wide, with 40px of
horizontal body padding. The search input inherits `.de-input { width:100% }`
beside Clear in a flex row. Its automatic minimum width could prevent it from
shrinking into the remaining space at a 320px viewport. The input alone now has
`minWidth:0` and `flex:1`, retaining existing styles/tokens and native controls.
No browser or computed-layout measurement was available.

The label still follows existing name → title → Template ID priority. The real
endpoint aliases template_name as name for persisted rows and supplies name/title
for builtins; template_name is also indexed for search. No label-priority change
or additional catalog contract was introduced.

After this one-line style change, **29 tests passed in three suites** (8.22 s):
both new suites and c2cFormA11y. The initial RED and 136-test GREEN remain recorded
against their original source pins. `narrow-input-green.log` records the follow-up
run; **`narrow-input-source.sha256` is the current bounded source freeze** and was
verified unchanged after that run. `narrow-input-source-verification.log` records
that check. This does not establish visual acceptance at 320px or on touch.

## Remaining acceptance

The lead still owns compiler/build/global lint and release gates on reconciled,
frozen repository sources. Actual authenticated app acceptance is unverified:
open the existing New document drawer in the intended runtime, browse/search its
real returned metadata using keyboard and touch, select and create in the chosen
project, then verify the persisted document and seeded sections. JSDOM checks do
not establish native operating-system select-arrow behavior, responsive visual
layout, hosted catalog availability or browser/server acceptance. Governed
drafting, authorized model/source traces and edit/save/reopen/review acceptance
remain separate open workstreams.
