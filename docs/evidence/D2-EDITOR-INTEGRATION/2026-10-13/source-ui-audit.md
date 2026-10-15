# Existing editor source intake — UI consistency evidence

The source UI review used `design-system/HANDOFF.md`, `SKILL.md`, `README.md`
and `colors_and_type.css`, then the current `ui_kits/authoring` implementation.
The kit is present despite the older phase overview in HANDOFF. The matching
shipping patterns are the authoring evidence rows, project-files rail, and
`FileToVaultDialog` / `SendForReviewDialog` data-entry drawers. Scope is D2:
source work enters the existing editor; no editor, navigation surface or
selection store was introduced.

## Findings and corrections

| Finding before correction | Existing pattern used |
| --- | --- |
| The import reason enabled a request with 1–7 characters, omitted the required marker and had no accessible rule description. | Shared governed reason floor/ceiling (8–2000), required field marker, `aria-required` and `aria-describedby`, matching `SendForReviewDialog`. Submission refuses invalid trimmed reasons before a request. |
| Adjacent drawer paragraphs and a raw receipt/list skipped the established notice hierarchy. | Existing `de-gov`, `de-gov-t` and `de-desc` structures, with a quiet saved-copy receipt, source checksum and conversion warnings. |
| The source search scrolled with its results, loading/count/empty used bare body paragraphs, and every record exposed a full selected-detail card with two actions. | Existing `pf-library`, fixed `pf-search` head, scrollable `pf-list`, `pf-count`, canonical loading/empty/error states, and native compact `details` / `summary` entries. Catalogue facts and actions expand; recorded eligibility stays in the summary. Search with no matches offers a clear-search action. |
| Shared source facts forced an inline 11.5px font across ProjectHome and the editor. | Inherited metadata classes: default `sec-sub` in ProjectHome and optional `pf-sel-m` in the source rail. No inline font size remains. Missing catalogue facts remain absent. |
| Persistent original-source disclosure used body paragraphs and a plain-font checksum under a one-line provenance class. | Quiet native provenance disclosure, established description hierarchy, shared monospace checksum and compact conversion-warning treatment. |
| Source drawers outside the editor skipped the editor drawers’ phone close-control and metadata rules. | The same source drawer has a scoped `de-source-import` hook for the control tower’s existing mobile sizing and type rules. |
| Disabled source work actions did not explain their recorded refusal. | One shared availability explanation, with visible recorded status and accessible descriptions in the source rail, and visible reason text beside the ProjectHome / Vault action. The recorded earlier Vault version is treated as non-current. Retained readable text remains available to AnA when original bytes are unavailable. |

Shared CSS was implemented by the control tower in `authoring-v2.css` using
the existing tokens. The source implementation adds only scoped hooks for
notice spacing, checksums/warnings, action reason text and the same mobile
drawer controls. It preserves the one primary drawer action and Lucide icons.

## Verification

`sourceUiRules.test.tsx` adds four meaningful behavior checks:

- Short/overlong reasons cannot send a request; the floor/ceiling is described
  accessibly and the valid floor enables submission.
- Exclusion is in the collapsed summary; expanding the native disclosure shows
  explained disabled work and AnA actions, which cannot issue work requests.
- A retained readable source without original bytes remains available to AnA
  while creating a working copy is refused.
- Clearing an unmatched search restores the project sources and removes the
  search term from the request.

The three scoped suites pass **18/18** checks:

```text
npx vitest run --config vitest.config.ts \
  client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/sourceImportDialog.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/sourceImportScope.test.tsx
```

The existing import/scope suites continue to prove exact document identity,
origin matching, one request during double-clicks, source/project state reset,
ignored late results, and no stale download/navigation after a project change.
Those guards were retained unchanged.

Scoped ESLint reports no errors or warnings for the four source components
and the new test. ProjectHome and Vault retain their HEAD warning counts
(7 and 4 respectively); these changes add no warnings. The warnings were
compared against HEAD through ESLint’s stdin mode with the real filenames.
No disables or warning-baseline changes were introduced.

The tests use jsdom and native disclosure click activation. Browser keyboard,
responsive layout and visual verification remain part of the control tower’s
combined checks; these component tests do not claim browser pixel parity.

## Final conversation context review

The final review found two context regressions in embedded editor asks: a phone
ask lost the saved section after hiding the canvas, and a section B review
before the first send reused the initial section A handoff. The actual
DocumentAuthoring → ConversationThread → saved DocumentCanvas regression
suite failed **2/2** before correction and passed **2/2** afterwards. The phone
case also proves that the hidden editor retains unsaved text, the request
excludes that text, and the ask issues no PATCH. The section replacement case
requires B’s exact saved identity and version. These tests use explicit Enter;
prefilling starts no request. The confirmed save-version overlay now preserves
a newer authoritative record rather than replacing it with an older save.

The migrated five authoring suites pass **60/60**, including model qualification,
frozen/document-view refusals, attributed tracked insertion and paste admission,
safe Markdown, recorded source states and keyboard/focus behavior. The separate
conversation-canvas suite passes **21/21**; its frozen case asserts a disabled
offer with the recorded reason, frozen context and no content mutation. The
empty-section fixture now supplies the real program and section UUIDs required
by the scope guard. No assertions were removed to bypass scope verification.
No unresolved material findings remain in the reviewed handoff, membership,
retry, current-project, source omission, cardless canvas or paste behavior.
