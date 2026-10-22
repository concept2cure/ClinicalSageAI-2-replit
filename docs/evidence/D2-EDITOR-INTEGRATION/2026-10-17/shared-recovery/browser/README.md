# Shared specialist recovery browser evidence

W1 / D2, 2026-10-17. The authoritative replay is [final/summary.json](final/summary.json),
with request bodies, raw navigation targets and bounds in each `final/*-results.json`.
[rollup.json](rollup.json) summarizes 8/8 passing cases, 20 measured stages and
12 screenshots. Production and fixture SHA-256 pins match before/after capture.

The fixture imports the actual `ReportEngine`, canonical `useAuthoringHandoff`,
both recovery notices, shell project/actor guards and exact-target publisher.
The canonical product styles and tokens render it inside the existing
`page` / `page-inner` classes. No product CSS or dependency was added. Only HTTP
responses and the signed-in synthetic reviewer are fixtures. All API traffic is
intercepted in Playwright; no backend, database, provider or real record is used.

## Results

Each scenario runs at 1440×1000 desktop and 390×844 touch, in light and dark.

- Unknown document: the pending action and another explicit lead click send one
  document POST. A mismatched successful receipt leaves the identity unknown.
  Another create action is blocked. A wrong-project scoped list keeps Check
  available, then a valid explicit all-status project check presents inventory
  and the ownership uncertainty. Neither check writes or navigates. Explicit
  Open working documents publishes no fabricated exact target.
- Confirmed document / unknown section: the first document is retained. A failed
  scoped check keeps the save held. Valid scoped list, exact detail and section
  reads expose Continue saving text and Open document to review. Empty-document
  inspection targets the exact project/document with `sectionCode: null`.
  Changing the result tab before Continue still sends the original section
  payload, after another scoped verification. It creates no second document,
  does not navigate, and does not replay a caller lifecycle action. A separate
  Open saved document targets the original `recommendations` section.

Across all cases: 8 document POSTs, 8 section POSTs (4 initial interrupted writes
and 4 explicit continuations), 20 scoped inventory GETs and 36 authoring GETs.
The other 8 POSTs invoke the synthetic protocol-analysis endpoint to produce the
actual caller's on-screen result. All 12 navigation receipts follow explicit
controls. There are 0 unexpected API requests, console errors or page errors.

The unresolved notice is measured after the actual 8-second toast expires.
All 20 measured stages retain source prose in the real result surface. The page
has no horizontal overflow; each notice fits its viewport without internal
horizontal overflow, and every recovery button fits horizontally. Screenshots
scroll the notice into view; source content below the fold remains scrollable.
The four executable fixture files pass strict ESLint with 0 errors / 0 warnings;
all three JavaScript modules also pass Node syntax checks.

## Visual inspection

Inspected these final captures directly:

- [Desktop dark: checked empty document](final/desktop-dark-partial-checked-empty-document.png)
- [Desktop light: persistent unresolved save](final/desktop-light-unknown-persistent-unresolved.png)
- [Touch light: persistent unresolved save](final/touch-light-unknown-persistent-unresolved.png)
- [Touch light: original text continued](final/touch-light-partial-continued-original-text.png)
- [Touch dark: checked empty document](final/touch-dark-partial-checked-empty-document.png)
- [Touch dark: persistent unresolved save](final/touch-dark-unknown-persistent-unresolved.png)

The notice uses the existing `scaf-note` and `btn ghost` presentation outside the
result toolbar. Text wraps and controls remain inside the content gutter. The
held document title and section code are visible before the continuation action;
the saved notice still names the original document after the result tab changes.

## Reproduce locally

Use the repository's installed dependencies and Node 22. This analyst environment
already provides Chromium at `/usr/bin/chromium` and Playwright Core at
`/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`; these are tool
dependencies, not new product dependencies. Adjust that import/executable path
for another local installation. No credentials or application server are needed.

From the repository root, start the isolated Vite fixture on unused loopback
port 5187:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/shared-recovery/browser/server.mjs
```

In a second terminal:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/shared-recovery/browser/browser.mjs
```

The runner writes `final/` receipts and returns nonzero for a failed assertion or
source drift. Preserve existing receipts before reproducing, since the same
filenames are reused. `--diagnostic` runs the two touch-light scenarios into
`diagnostic/`. Stop the Vite process with Ctrl-C when finished. The original
fixture server was stopped after final capture; port 5187 was then unoccupied.

## Qualifications and initial fixture failures

The two retained preliminary runs are fixture errors, not evidence of a product
regression: `initial-fixture-assumption/` expected an unnormalized editor-target
object, while the canonical publisher supplies `sectionCode` and metadata;
`second-fixture-assumption/` used the wrong case for an existing tab label. The
first preliminary runner also used the wrong toast selector, so its screenshots
do not establish persistence after dismissal. The final runner waits for the
actual `.de-toast` to disappear and asserts semantic target identity while
retaining the complete raw target in its report. No production change was made
for these corrections. Final source pins identify the replayed implementation.

`pre-null-guard/` preserves only the summary and rollup of the first positive
8-case replay. After compiler verification required an explicit null check in
the exact-document reader, the same eight cases were replayed on canonical
`d6a33d3a4` with that correction. The authoritative `final/` receipts and source
pins describe this second positive replay; screenshots and request receipts
were refreshed without expanding the scenarios.

This is one actual specialist caller, not all six caller surfaces or the whole
shell. It records the real `editorTarget` / `onNav` boundary; it does not mount
the shell router or Workbench and does not claim an end-to-end editor reopen.
The fixture intentionally keeps the caller mounted after navigation callbacks
to exercise the separate empty-document inspection and continuation controls.
The synthetic unknown outcomes use mismatched HTTP-success receipts, not real
network loss, HTTP refusal or a committed backend write. Backend reservation,
authorization and duplicate guarantees require their separate test evidence.
No automated accessibility scanner was run; this is not an accessibility audit,
human-review record, provider qualification, deployment or regulatory-readiness
claim. The component-owned ledger's remount/reload/other-tab limits still apply.
