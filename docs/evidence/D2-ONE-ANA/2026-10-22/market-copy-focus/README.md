# Focus after a market's editing copy opens (2026-10-22)

Row: D2. Left open by the accessibility lens on F22b (`…/2026-10-15/f22b-market-outline/`): after "Create editing copy", the pressed button is gone, and focus dropped to the page.

## What already exists

- `useCreateMarketCopy` (`client/src/concept2cure/v2/editor/FilingMarkets.tsx`) creates the copy and opens it through the workbench's `openPulledDocument`.
- The outline pane's title, `.ed-tree-t` in `DocumentWorkbench.tsx`, already names the open document.

Nothing new is drawn. The title takes `tabIndex={-1}`, so it is focusable by script only, and the hook moves focus there once the copy has opened.

- `red/focus-lost.txt`: the extended `filingOutlinePerMarket` test on the pre-change files. Focus is not on the opened document.
- `green/focus-on-opened.txt`: that test, the start-section test and every editor test (59 files, 720 tests).

Typecheck clean; the ratchet shows no change. `ci:design-system`, `ci:undefined-css-classes` and `ci:canvas-path` pass. HawkScan not run: HAWK_API_KEY is not set.
