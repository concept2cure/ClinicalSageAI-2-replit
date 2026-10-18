# Existing authoring creation recovery browser qualification

W1 / D2; contract: [Authoring creation recovery](../../../../../../docs/design/AUTHORING_CREATE_RECOVERY_2026-10-14.md).
This is local browser evidence for the existing editor. All `/api/**` traffic
is explicitly synthetic and intercepted by Playwright. No provider, database,
authorization service or deployment is exercised by this fixture.

The host directly imports the existing `AuthoringCreateExport`, `C2CForm`,
`DocumentWorkbench` and canonical `RichSectionEditor`, with the existing tokens
and styles. It implements no alternate editor or production CSS. The native
Workbench cases begin with an explicitly synthetic saved paragraph and type a
separately labelled unsaved paragraph through the actual editor. Leaving without
saving never requests a PATCH.

The matrix covers 1440 × 1000 desktop and 390 × 844 touch, each light and dark:

- Document and section pending creation: synchronous duplicate click, disabled
  Submit, both outer create controls disabled, Cancel closes the drawer without
  repeating the captured POST.
- A deliberately wrong-scope successful creation receipt becomes an unknown
  outcome. The first explicit recovery GET returns wrong-scope rows and must
  retain the guard; the second returns valid scoped rows and invokes the exact
  host refresh callback. Neither recovery attempt repeats the POST.
- The actual pinned native Workbench creates a document or section while the
  current section has unsaved text. The existing leave decision holds the
  navigation. Cancel preserves the buffer; `Open created …` retries the saved
  receipt; `Leave without saving` permits the exact returned ID to open without
  another POST or an unsolicited save. The document case records the existing
  `editorTarget` / `onNav` handoff boundary rather than emulating the shell router.
  The section case opens the exact new empty section in `RichSectionEditor`.
- A held project switch with a different shell project disables creation and
  issues no mutation.

Each capture records bounds, page overflow, exact native editor count where
applicable, console errors, page exceptions and axe WCAG 2/2.1/2.2 A/AA results.
Recovery notice bounds must lie inside the visible viewport; ancestor clipping
can hide a notice without increasing page scroll width. Axe incomplete rules are
retained per capture and need manual review. This is not a complete accessibility
audit, a persistence proof or a deployed-environment qualification.

## Reproduce

From the repository root, using existing installed evaluation tools:

```bash
export PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/server.mjs
```

The host prints its known PID and binds only `127.0.0.1:5179`, with a strict port.
In another terminal:

```bash
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/browser.mjs
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/import-proof.mjs
node_modules/.bin/eslint docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/browser/*.{mjs,tsx} --max-warnings 0
```

Stop only that host's printed PID afterwards. Chromium is `/usr/bin/chromium`;
Playwright core is `/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`;
axe-core is `/workspace/scratch/editor-ui-tools/node_modules/axe-core/axe.min.js`.
These are local evaluation tools, not new product dependencies.

## Diagnostic failure

The initial touch-light diagnostic correctly failed four notice visibility
assertions. Recovery/created notices were siblings inside the existing horizontal
`ed-doc-actions` row and began beyond the 390 px viewport: unknown notice at
x=406.27 and native created notices at x=418.27. The page had no horizontal
overflow and axe reported no violations, illustrating why explicit notice bounds
were required. The original diagnostic source pins, results and captures remain
under `diagnostic-*` filenames. Final results must be interpreted using their
own source pins and must not be inferred from this diagnostic run.

The first portal candidate passed 16 of 20 cases. Its four empty-section checks
used `innerText === ''`; Chromium supplies a newline for the native empty
paragraph. The editor had opened the exact section and showed zero words. The
fixture now waits for `textContent === ''`. The candidate results and two
representative original capture files remain in `candidate-empty-assert/`.
The canonical `captures/` paths for those candidate stages were replaced by
the final replay; the original candidate's embedded metrics remain diagnostic.

## Final result

[Final source-pinned summary](browser-summary.json) and
[rollup](reports/browser-rollup.json): **20 / 20 cases passed**, 52 captures,
16 explicitly requested creation POSTs, 16 explicitly clicked scoped recovery
reads and eight successful host refresh callbacks. There were no other writes,
unexpected requests, console errors, page exceptions or axe violations.

All four exact document handoffs preserved the returned document and project
IDs. All four exact section cases opened the returned empty section in the
actual native editor after Cancel and receipt retry. Four held-switch cases
issued no POST. All eight asserted native editor viewports were at least
300 × 279 px. Recovery notices were fully within the viewport in all four
display contexts.

Fourteen production-file hashes and eleven executable/fixture-file hashes
match the frozen source. Nine executable fixture files have strict ESLint
results of zero errors and zero warnings. The import proof resolves all twenty
relative imports; all twelve production targets are tracked. The known local
Vite host PID 33028 was stopped after capture; no test host is left running.

Manual image review is recorded in [visual-review.md](visual-review.md).
