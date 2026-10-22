# F01 — Quality controls connect to canonical Authoring

Workstream W3/W4; launch rows D2/D5. Contract: [qms-contract.md](qms-contract.md).

The Quality register now completes the document workflow through real API
calls. New and library-template controls collect a program, title, document
type, optional number and stated reason. A shell-selected program is
preselected only after it appears in the live program list. The list is paged
until all choices are read, and failures remain errors. Creation opens the
returned document's editing copy. An unbound legacy draft instead asks the
user to choose its program/template and bind explicitly.

Opening a row reads its editor binding and mounts the existing
`DocumentWorkbench`, pinned to the returned Authoring document and program.
It uses the canonical section editor, reason-for-change, save, permissions and
unsaved-work decision. Quality holds its tabs while the editor is open and
forwards host navigation. No second editor or editable content store was added.
The register adapter now retains the authoring binding and program metadata.

Send for review and Revise collect a stated reason and call the guarded PATCH
and revision routes. Approval and retirement continue through the shared
electronic-signature ceremony, covered by the existing signing regressions.
History reads immutable signed snapshots and renders saved sections through
Authoring's read-only `AuthoredHtml` renderer. A history failure does not claim
there are no signed versions.

Evidence:

- [Initial red run](qms-ui-red.txt): the eight workflow regressions failed on
  the original chat-prompt controls before implementation.
- [Combined green run](qms-ui-green.txt): 9 files, 66 tests passed across all
  Quality tests and the existing `anaDrivesWave4` surface-action tests.
- [Actual workbench integration](qms-ui-workbench.txt): 3 tests passed using the
  real TipTap workbench. An empty template section is authored, saved by the
  canonical section PATCH with its reason, and read after remount. A current
  version denied edit permission renders a noneditable canvas and disabled
  Save. Back holds unsaved text until the canonical leave decision completes.
- [Scoped ESLint](qms-ui-lint.txt): exit 0, no errors; size/complexity warnings
  in the large register/shell and setup form remain visible.

Commands used Node 22.23.3:

```sh
/workspace/audit/node-v22.23.3-linux-x64/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/quality/__tests__ client/src/concept2cure/v2/__tests__/anaDrivesWave4.test.tsx
/workspace/audit/node-v22.23.3-linux-x64/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts client/src/concept2cure/quality/__tests__/ControlledDocumentWorkbench.integration.test.tsx
```

The first existing-review-test run expected an immediate reasonless PATCH and
failed two assertions ([output](qms-ui-existing.txt)). Those tests were updated
to state the review reason required by the published contract; the combined
green run includes them. Signing expectations were not weakened.

Limits: component tests use mocked HTTP responses, including stateful saved
section responses. They prove client wiring and actual editor behavior, not
database transactions, RLS, live-browser layout or deployment. Backend QMS
PGlite evidence is recorded by the lead. Application-wide TypeScript checking
also belongs to the lead. No server/v2 source edits, network calls,
installations, dependencies or commits were made in this UI scope.
