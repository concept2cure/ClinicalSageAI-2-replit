# Manual review of final local browser captures

The source-pinned final replay passed all 20 cases. I inspected these images
directly, in addition to automated notice bounds and viewport checks:

- `captures/desktop-light-unknown-document-pending.png`: the existing drawer
  shows “Creating document…”, disabled Submit and the existing Cancel action.
  The text is readable and the footer controls remain inside the viewport.
- `captures/touch-light-unknown-document-unconfirmed.png`: the full uncertain
  outcome message and `Check working documents` action are visible below the
  header, at x=0 with a width of 390 px.
- `captures/touch-dark-unknown-section-failed-scoped-read.png`: the failed-read
  message explicitly keeps creation unconfirmed; its complete text and retry
  action remain visible with the existing dark tokens.
- `captures/touch-dark-native-document-exact-document-handoff.png`: the native
  editor retains its synthetic unsaved paragraph until the explicit leave
  decision. The confirmed receipt action stays visible. The test records the
  exact editorTarget/navigation boundary; the fixture does not emulate the
  shell router or claim a deployed document reopen.
- `captures/desktop-dark-native-section-created-leave-held.png`: the existing
  unsaved-work decision gives Cancel, Leave without saving, and Save and
  continue. The case chooses Cancel, then retries the confirmed receipt, then
  deliberately chooses Leave without saving. No PATCH occurs.
- `captures/touch-light-native-section-exact-created-section.png`: the exact
  returned section code appears in the breadcrumb, the native editor contains
  no authored text, and the receipt action remains visible above it. The actual
  editor placeholder is readable. The measured viewport is 300 × 279 px.

The original pre-portal touch diagnostic showed the uncertainty/created notes
outside the visible horizontal toolbar, despite no page overflow or axe
violation. The final portal uses the existing notice style below the header;
no production CSS changed. Final desktop and touch notices fit horizontally and
vertically without scrolling the toolbar.

Axe returned zero violations. It retained three incomplete-rule families:
`aria-prohibited-attr`, `color-contrast` and `label-content-name-mismatch`.
These include native editor toolbar and Radix wrapper nodes. The screenshots
show readable text and familiar editor controls, but this limited inspection
does not resolve every incomplete accessibility finding or replace a complete
manual keyboard/screen-reader audit.

All API data is explicitly synthetic. These checks qualify the existing local
client workflow and callback wiring; persistence, server authorization, RLS,
model behavior, deployment and regulatory readiness are outside this browser
fixture's claim.
