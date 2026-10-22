# Existing editor assembly browser evidence

W1 / D2, 2026-10-17. [final/summary.json](final/summary.json) is the
authoritative frozen replay; [rollup.json](rollup.json) summarizes 8/8 passing
cases, 24 measured stages and 22 screenshots. Full request bodies, saved rows,
draft candidates, acceptance payloads and bounds are retained in each
`final/*-results.json`. Production SHA-256 pins match before and after capture.

The fixture mounts the actual `DocumentWorkbench`, its canonical assembly
controller, `AuthoringAiDraft`, `RichSectionEditor`, `AuthProvider` and product
styles/tokens in the existing `dcv-workbench` container. Only HTTP responses and
the synthetic signed-in account are fixtures. All API traffic is intercepted in
Playwright; no database, backend, provider or real record is contacted. No
product dependency or CSS was added by this browser fixture.

## Results

Both workflows run at 1440×1000 desktop and 390×844 touch, in light and dark.

- **Without AnA:** choosing the template loads its outline without writing.
  Explicit preview and build first select one missing section, then the entire
  document. The same document retains its original section ID, HTML, counters
  and stored index; missing sections are empty and ordered after it. The plan
  names missing scientific content. No generation or acceptance request occurs.
- **With AnA:** the exact document is assembled once. Two empty sections are
  drafted sequentially, with a measured maximum of one generation in flight.
  Both candidates remain unsaved. Review opens the existing draft panel, edits
  and reason survive switching to the other queued section and back, and no
  acceptance occurs until the explicit Accept control is pressed. That one
  acceptance carries the exact section ID, candidate ID, edited body and stated
  reason. The other candidate remains unaccepted and existing text is preserved.

Across these eight cases: 20 preview requests, 12 structural commits, 8 generation
requests and 4 explicit acceptance requests. There are zero unexpected API
requests, console errors, page errors or navigation callbacks. One canonical
rich editor remains mounted at every measured stage. Build notices sit outside
the horizontally scrolling toolbar; the page, assembly and review panels have
no horizontal overflow, and all assembly controls fit horizontally.

The roster includes the actual longest built-in template label, copied from
the canonical resolver, to exercise select intrinsic width. The chosen template
and its three stability rows are synthetic organization records. This does not
test the backend applicability of that separate built-in template.

## Mobile layout findings and remedies

[mobile-intrinsic-red/measurement.json](mobile-intrinsic-red/measurement.json)
and its screenshot preserve an actual pre-fix finding: the long built-in option
forced a 686px options grid inside 366px of available width. Assembly scroll
width was 698px in a 390px viewport, clipping prose and a Review control. The
product remedy constrains the existing form controls and grid children and
reuses existing wrapping button classes; it adds no stylesheet.

[mobile-height-diagnostic/measurement.json](mobile-height-diagnostic/measurement.json)
records the second actual finding. A 947px disclosure sat outside the editor's
scroll body in an 844px bounded canvas. Both Review controls were below the
viewport; wheel input moved no ancestor. Programmatic Playwright scrolling
would have hidden that limitation. The product remedy moves the disclosure
inside the existing `ed-doc-scroll` content, preserving fixed editor actions
and oversight. There is no additional nested scroll pane.

[mobile-height-final/measurement.json](mobile-height-final/measurement.json)
is the frozen positive replay of that manual-wheel check. Two 200px wheel
steps bring the last Review control into view through the existing editor
scroll area. After explicitly opening that candidate, further wheel input
reaches the review heading and the canonical rich editor. The existing section
switch resets the scroll position, so automatic focus/scrolling to the panel is
not claimed. The main eight-case replay measures presentation and uses normal
Playwright locator actions; this separate receipt supplies manual-wheel proof.

Inspected these captures directly:

- [Desktop light: deterministic build and preserved text](final/desktop-light-deterministic-deterministic-built.png)
- [Desktop dark: edited existing review panel](final/desktop-dark-ana-first-review-edited.png)
- [Touch dark: single-section preview](final/touch-dark-deterministic-single-section-preview.png)
- [Touch light: retained-candidate notice](final/touch-light-ana-two-candidates-ready.png)
- [Touch light: queued Review controls reached by wheel](mobile-height-final/after-wheel.png)
- [Touch light: review heading reached by wheel](mobile-height-final/review-heading-after-wheel.png)
- [Touch light: canonical rich editor reached by wheel](mobile-height-final/native-editor-after-wheel.png)

Text and controls wrap within the existing reading measure. Screenshots show
viewport-sized portions of longer scrollable forms; content outside the image
remains reachable through the editor's existing scroll area.

## Reproduce locally

Use installed repository dependencies and Node 22. This analyst environment
provides Chromium at `/usr/bin/chromium` and Playwright Core at
`/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`. These are tool
dependencies, not product dependencies. Adjust those paths for another local
installation. No credentials, provider, database or application server is needed.

From the repository root, start the isolated loopback Vite fixture:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/browser/server.mjs
```

In another terminal, run the eight-case replay and the supplemental wheel probe:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/browser/browser.mjs
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/assembly-build/browser/height-probe.mjs --final
```

The runners overwrite `final/` and `mobile-height-final/`; preserve retained
receipts before reproducing. `--diagnostic` on the main runner limits the replay
to the two touch-light workflows. The fixture disables source watching to
prevent hot reload from invalidating a running case; restart it after any source
edit. Stop the Vite server with Ctrl-C when finished. The original browser and
server were stopped after capture; [cleanup.json](cleanup.json) records the
loopback port check.

[fixture-validation.json](fixture-validation.json) records strict ESLint across
the five executable fixture files, with zero errors/warnings, plus Node syntax
checks for all four JavaScript modules. Commands, exit codes and exact captured
output hashes are retained.

## Qualified preliminary receipts and boundaries

`initial-live-source-fixture/` and `second-label-fixture/` are fixture failures,
not product regressions: the first ran while Vite hot reload reset the disclosure;
both used an exact label query that included native select-option text. The
final runner selects the accessible combobox role. The initial option wait also
incorrectly required a native option to be visible instead of attached.
`pre-width-fix-diagnostic/` retains the real overflow finding and one separate
fixture selector error (`preview` incorrectly matched the string `review`).
`post-width-history-fixture/` shows deterministic success and the completed AnA
flow before an unconfigured existing history GET caused the final request check
to fail. The endpoint is configured in the final fixture. None of these fixture
corrections required product changes.

`post-scroll-focus-assumption/` preserves a completed wheel capture whose last
assertion overclaimed automatic panel focus. Its measurements already showed
manual access to the rich editor. The final probe directly verifies manual
access to both the heading and editor, without that assumption.

`pre-reference-context-positive/` retains only the positive summary and rollup
before the final source refinements for normalized section selection and fenced
template-reference context. The authoritative `final/` receipts, screenshots
and source pins were refreshed by replaying the same eight cases after those
changes. No additional browser scenario was introduced. The separate manual-wheel
receipt remains pinned to its original capture; its three layout files
(`DocumentWorkbench`, `AuthoringAssemblyBuild` and the authoring stylesheet)
were unchanged by these transport/controller refinements.

This is the existing editor in a bounded embedded host, without the full shell
or conversation thread. HTTP fixtures supply exact receipts; they do not prove
backend authorization, transaction atomicity, persistence, lineage or live
provider behavior. Provider refusal and dirty-work/context races are covered
by the separate component/HTTP/transaction evidence, not additional browser
cases here. No automated accessibility scanner was run. These receipts are not
a human-review record, accessibility audit, deployment or regulatory-readiness
claim. Component-owned guards do not promise idempotency across reloads or tabs.
