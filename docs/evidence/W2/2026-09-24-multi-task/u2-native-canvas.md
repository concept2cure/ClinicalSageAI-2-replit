# U2 — a scanned PDF killed the API task

Launch row: **D1** (production as configured). This is an audit blocker
(`audit-findings.md`, task-resources-health).
Date: 2026-10-01. Branch: `concept2cure-v2`.

## The defect

`package-lock.json` installed three builds of the native `@napi-rs/canvas`
library, and each statically links its own Skia:

| Copy | Version | Who loads it |
|---|---|---|
| `node_modules/@napi-rs/canvas` | 1.0.6 | `server/services/ocr/pdfRasterizer.ts` (the page canvas) |
| `node_modules/pdfjs-dist/node_modules/@napi-rs/canvas` | 0.1.100 | pdfjs: `NodeCanvasFactory` scratch canvases, plus its `ImageData`/`Path2D` polyfills |
| `node_modules/pdf-parse/node_modules/@napi-rs/canvas` | 0.1.80 | pdf-parse's bundled pdfjs. It sets the same globals, and `extractDocumentText` loads it *first* |

So drawing one page mixed native objects from two or three copies. A page that
contains an image (which is what a scan is) corrupts the native heap.

The result is SIGSEGV or SIGABRT. No `uncaughtException` handler sees that, and
no try/catch does either. The API task dies, and every other tenant's request
on it dies with it. A retry lands on the other task (there is no stickiness)
and kills that task too.

`tests/services/ocr-live.test.ts` never caught this. Its "scanned" PDF is drawn
text with no image.

The fix had to be in the dependency tree. Rendering through pdfjs's own
`canvasFactory` would not have been enough: pdf-parse's 0.1.80 globals are
installed first, and pdfjs only polyfills the globals when they are absent.

## The fix

- **`package.json`:** `@napi-rs/canvas` is pinned to `0.1.80`, the one version
  both dependents accept (pdf-parse pins exactly `0.1.80`; pdfjs-dist asks for
  `^0.1.80`). Also added `"overrides": { "@napi-rs/canvas": "$@napi-rs/canvas" }`
  so nothing can nest another copy.
  - The 1.0.6 pin had no reason behind it. It arrived in a whole-file rewrite
    (`901f33bdf`), and nothing in `server/` uses a 1.x API.
- **`package-lock.json`:** the pdfjs-dist nested entries were dropped and
  reinstalled. `npm ls @napi-rs/canvas --all` now shows one copy:

  ```
  +-- @napi-rs/canvas@0.1.80 overridden
  `-- pdf-parse@2.4.5
    +-- @napi-rs/canvas@0.1.80 deduped
    `-- pdfjs-dist@5.4.296
      `-- @napi-rs/canvas@0.1.80 deduped
  ```

  No other package entry in the lockfile changed (diffed package by package).
- **`docs/security/dependency-risk-ledger.json`:** resealed with
  `npm run ci:dependency-risk:reseal`. The finding set is unchanged (2 reviewed
  occurrences), and `ci:dependency-risk` exits 0.

## The guards

- **`tests/services/scanned-pdf-native-canvas.test.ts`:**
  - builds the real case, a page that is one embedded PNG;
  - runs the production entry point `extractDocumentText` in a child process
    (fixture `tests/services/fixtures/extract-pdf-in-child.ts`), where a
    native abort shows up as an exit status;
  - asserts exit 0, method `pdf-ocr`, and that the OCR text contains the
    words drawn into the image.
- **`npm run ci:single-native-canvas`** (+ `:selftest`, wired in `ci.yml`):
  - fails if the lockfile holds anything other than exactly one copy;
  - its self-test includes the pre-fix lockfile's three entries;
  - run against the real pre-fix lockfile (`git show HEAD:package-lock.json`),
    it reports `3 copies — 1.0.6 …; 0.1.80 …; 0.1.100 …`.

## Verified by making it fail

- **Before** (`u2-before.txt`): the child process was killed by a signal, with
  no exit status. The first run got `SIGSEGV` and the recorded run got
  `SIGABRT`. Both are heap corruption; which one depends on the allocation.
- **After** (`u2-after.txt`): the child exits 0, and the OCR text contains
  "certificate of analysis".

Same tree, after the fix:

- `ocr-live.test.ts` and `chat-upload-to-memory.test.ts` pass, 12/12 in total
  with the new test.
- Every other test that renders through pdfjs passes, 82/82:
  - the eSTAR XFA render (`fill-official-pdf.xfa-render.test.ts`);
  - the eCTD leaf renderer and its bookmarks;
  - font-embedding honesty;
  - OCR page offsets;
  - the export renderers.
