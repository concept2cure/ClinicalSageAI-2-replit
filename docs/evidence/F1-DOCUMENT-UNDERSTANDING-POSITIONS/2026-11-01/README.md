# Document understanding states no position it never measured — 2026-11-01

Package **F1** (repairs: a defect in shipped behaviour; no screen, mount or table added).
Gap analysis: `docs/design/AI_PLATFORM_BLUEPRINT_GAP_2026-10-25.md`, capability 1.

## What was wrong

`/api/document-understanding/*` (`server/routes/document-understanding.ts`) reads a document's text.
It never sees a page's layout. Every element still came back with a bounding box: `x 72`,
`y = reading order × 20`, `468 × 14`. Every table cell came back at `x = column × 100`,
`y = row × 20`, and every form field's label box at 40% of the line's width. A caller drawing
those boxes would draw a layout the document does not have. That breaks the working agreement's
"never fabricate".

## What already exists

- **The route's 2026-09-10 correction.** It removed the five machine-learning models the route
  advertised and never ran, and its header says so. It left the coordinates.
- **The honesty contract test** (`server/routes/__tests__/document-understanding-honesty.contract.test.ts`).
  It pins the 2026-09-10 correction and the tenant file boundary.
- **R1's inventory** (`docs/evidence/DESIGN/R1/2026-11-01-inventory/inventory.json`). It lists the
  route's six paths with no screen calling them (`prod: unmapped`).

## What changed

Every `bbox` (element, table, cell, form field) and `labelBbox` is now `null`, typed
`BoundingBox | null`. That is the shape a measured position would take if a layout reader ever
supplies one. Each element, table and form field states its `page` on its own, because the text
does carry the page. The outline reads that page. The header note says why.

## Proof

- **Red:** `red/invented-box-on-unchanged-route.txt`, the new contract case against the unchanged
  route (`expected { x: 72, y: 0, width: 468, … } to be null`).
- **Green:** `green-summary.txt`, the honesty contract and error-containment suites, 30/30.

## Not done

No screen calls the route (R1). Reaching it, or retiring it, is R1's or the founder's call. This
change only makes what it answers true.
