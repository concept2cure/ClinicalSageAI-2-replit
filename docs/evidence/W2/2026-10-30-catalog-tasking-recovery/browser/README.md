# Existing catalog and task-board component browser qualification

## What already exists

`WorkflowCatalog.tsx` and `TaskBoard.tsx` own the product screens and recovery controls. `dataConnect.tsx` owns their live reads, payload processing and shared error controls; `queryClient.ts`/`authToken.ts` own the canonical client transport. The TaskBoard runs inside the actual `AuthProvider` and `QueryClientProvider`. Canonical tokens and current main/V2 styles are loaded directly, including the globally reached `surfaces-v2.css` segmented-control styles. The browser harness adds no product route, alternative reader or provider implementation.

## Boundary and controls

The private scratch Vite harness served actual product components, hooks and transport at loopback port 5197. Its middleware answered only deliberately synthetic catalog, subscription, task-board, project, assignee and viewer-session replies. Each endpoint supports failure, held and successful replies through a separate fixture controller; the board starts with one readable task and an unread schedule store, then returns two tasks on recovery. `harness-server.mjs.gz` retains these exact response controls; `qualified-inputs.json` pins the harness and product files.

This is **component browser qualification**, not a deployed app, real authentication/MFA, native database, authorization or human-testing acceptance run. The TaskBoard uses an explicitly synthetic viewer session reply through the real provider; that reply is not verified by a production authentication boundary. Catalog qualification has no bearer. No external provider or customer data was used. No AnA behavior is exercised here.

## Final results

- `results.json`, `catalog-final.log`: Chromium passed at **1440×1000** and **390×844** (the latter with mobile/touch emulation). Catalog failure → Retry features → held loading → real component adoption of the synthetic feature; subscription failure → Retry subscription details → held loading → Current subscription. Search persists. Each run makes exactly two catalog GETs and two subscription GETs, with no mutation or uncaught error.
- `taskboard-results.json`, `taskboard-final.log`: both widths pass with the actual TaskBoard/providers. A partial, nonempty board remains visible while the failed project list is explicitly retried; the button shows its pending/disabled state, then project choices return. Retrying the incomplete board shows loading, restores the original card plus the previously unread task, and removes the incomplete warning. Each run makes two board GETs, two project GETs and one assignee GET, plus the separate synthetic session GET. No mutations or uncaught errors. Retained-card coverage is specifically during the project retry; the existing board retry uses its loading state.
- Eight captured states per surface cover failure/partial, each held retry and recovery across the two widths. Final desktop and phone failure/recovered screenshots were visually inspected. Page width stays within each viewport, error messages retain usable width, phone actions follow the message, and the phone task header/viewer note stack at readable full width.
- Expected browser console 503 messages correspond to the deliberate fixture refusals. The authoritative final runs have no uncaught exceptions.

## Phone corrections, shown failing first

The initial catalog error panel left only **80.375 px** for its subscription message beside the retry button. `mobile-layout-red.log.gz` records the executable phone-width failure; the exact runner and before screenshot are retained. The existing `workflows-v2.css` now lays out only `.workflow-page` error panels as a phone grid with recovery actions on the next row.

With the complete relevant global styles loaded, the TaskBoard project error body was **131.531 px**, and its description and viewer note were squeezed side by side. `taskboard-mobile-layout-complete-styles-red.log.gz` records all four failing width/stack/action assertions before CSS edits. Only six `.tb`-scoped mobile lines were added in the existing TaskBoard block of `app-v2.css`; no global ErrorState rule or TypeScript behavior changed. Both final width/stack checks now pass. `*-before-layout.png` files retain the observed failures.

## Harness findings and cleanup

The first catalog harness disabled dependency discovery without including `react-dom/client`; the resulting createRoot import failure occurred before component/API execution (`initial-harness-failure.log.gz`). Explicit prebundling corrected the private harness. TaskBoard warm-up encountered optimization/HMR invalid-hook noise during incoming source changes; the final harness pins React dependencies, disables HMR, and mounts the board after the real provider adopts its synthetic viewer. Signed-out permission compatibility is not described as viewer authorization.

An early task-board capture omitted the transitively loaded `surfaces-v2.css`, causing unstyled segmented tabs. That fixture omission was corrected before the authoritative complete-styles layout RED and final runs. Catalog was also rerun with the complete relevant style set. These harness changes altered no product route or authentication control.

Every Chromium instance closed in `finally`. The final Vite process, PID 7401, was stopped before the root compiler gate. Source pinning and artifact archiving are complete; root owns final integration and Git publication.
