# Canonical integration: existing editor browser replay

W1 / D2, 2026-10-17. [final/summary.json](final/summary.json) records **9/9
passing cases**, 25 measured stages and 23 screenshots. [rollup.json](rollup.json)
summarizes requests and the supplemental mobile-wheel check. Full request
bodies, exact saved rows, candidates, acceptance payloads and bounds are retained
in each `final/*-results.json`.

This replay combines the assembly implementation with canonical `accf8c6ba`,
including the current explicit document-edit refusal. `testedHead` records the
checkout revision during capture; the SHA-256 pins identify the integrated
working-tree candidate
actually rendered. Production pins matched before and after capture and again
at cleanup. This is separate from the earlier
[historical browser replay](../../browser/README.md), which remains unchanged.

`pre-nav-refactor-positive/` retains only the preceding positive summary and
rollup before a behavior-preserving navigation-state refactor removed a lint
warning. The authoritative `final/` receipts and mobile-wheel proof were
refreshed by replaying the same nine cases and wheel probe on the final bytes.

## Scope and results

The fixture mounts the actual `DocumentWorkbench`, its assembly controller,
`AuthoringAiDraft`, `RichSectionEditor`, `AuthProvider`, and canonical product
styles/tokens inside the existing `dcv-workbench` container. The signed-in
account and all HTTP replies are synthetic. The eight original workflows are
unchanged; their document-detail fixtures now explicitly grant edit access.

At 1440×1000 desktop and 390×844 touch, in light and dark:

- **Without AnA:** template selection reads the outline without writing. Explicit
  preview/build first adds one selected missing section, then the whole missing
  structure. Original section identity, HTML, counters and index are preserved.
  The appended rows remain empty, their scientific-content gaps are visible,
  and no generation or acceptance request occurs.
- **With AnA:** one structural commit is followed by two sequential section-draft
  requests, with a maximum of one generation in flight. Both candidates remain
  unsaved for individual review in the existing panel. Edited body and stated
  reason survive switching to the other candidate and back. One explicit Accept
  carries the exact candidate/section identity, edited text and reason; the other
  candidate stays unaccepted and existing text remains unchanged.

One additional touch-light case supplies the canonical refusal:

> Editing needs an editing role in this organization. Your current organization access is read-only.

The assembly disclosure shows that exact server reason. Template selection,
preview, build and AnA selection are disabled. The editor bridge reports
`editable: false`, original saved content is retained, and no authoring mutation
is sent. This tests the client response to the canonical refusal; the HTTP
fixture does not establish real membership or write authorization.

Across nine cases: **20 previews, 12 structural commits, 8 generation requests
and 4 explicit acceptances**. There are zero unexpected requests, console errors,
page errors or navigation callbacks. At every measured stage one canonical rich
editor remains mounted. The page, assembly and review panel have no horizontal
overflow, and every assembly control fits horizontally. The roster includes a
long existing built-in template label to retain the intrinsic-width check.

## Mobile scrolling and visual inspection

[mobile-height-final/measurement.json](mobile-height-final/measurement.json)
replays manual wheel input on the integrated candidate, with frozen layout
sources. Two 200px wheel steps bring the last queued Review control into view
through the existing `ed-doc-scroll` area. After opening that candidate, further
wheel input reaches both the existing review heading and the canonical rich
editor. No additional scroll pane or product stylesheet is introduced.
Automatic scrolling to the review panel is not claimed; the existing section
switch resets the editor scroll position.

Inspected these captures directly:

- [Touch light: canonical read-only refusal](final/touch-light-read-only-read-only-build-disabled.png)
- [Desktop dark: retained edited review](final/desktop-dark-ana-first-review-edited.png)
- [Touch dark: single-section preview](final/touch-dark-deterministic-single-section-preview.png)
- [Touch light: queued Review controls reached by wheel](mobile-height-final/after-wheel.png)

Notices and prose wrap in the existing reading measure. Longer forms remain
scrollable; viewport captures show portions of them. The build disclosure stays
outside the horizontally scrolling toolbar, inside the editor's established
scroll body. Existing header actions and oversight remain visible above it.

## Reproduction and cleanup

Use repository dependencies and Node 22. This environment provides Chromium at
`/usr/bin/chromium` and Playwright Core at
`/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`; adjust those
tool paths for another local installation. No product dependency, credentials,
application server, database or provider is needed.

From the repository root, start the isolated Vite fixture:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser/server.mjs
```

Then run the nine cases and supplemental manual-wheel probe in another terminal:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser/browser.mjs
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/canonical-integration/browser/height-probe.mjs --final
```

The runners overwrite `final/` and `mobile-height-final/`; preserve existing
receipts first. `--diagnostic` limits the main runner to the two touch-light
editable workflows. The server disables source watching to avoid hot reload
during capture; restart it after source changes. Stop it with Ctrl-C when done.
[cleanup.json](cleanup.json) records that the original browser runners closed,
the owned server stopped and loopback port 5189 refused connections.

[fixture-validation.json](fixture-validation.json) records strict ESLint on all
five executable fixture files, with zero errors/warnings, plus Node syntax checks
for all four JavaScript modules. Commands, exit codes and exact output hashes
are retained. No production files were edited; no Git staging, commit or rebase
command was run by this replay.

These are actual editor components in a bounded embedded host, without the full
shell or conversation thread. Synthetic HTTP receipts do not qualify backend
authorization, transaction atomicity, persistence, source-catalogue/Vault intake,
source lineage or a live AnA provider. Those require separate evidence. No
automated accessibility scanner was run. This replay is not a human-review
record, accessibility audit, deployment or regulatory-readiness claim, and
component-owned guards do not promise idempotency across reloads or tabs.
