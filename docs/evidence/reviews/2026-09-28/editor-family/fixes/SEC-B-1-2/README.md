# SEC-B-1, SEC-B-2: a section image could send every reader's browser to any API route, or to another site

**Findings:** periodic review 2026-09-28, editor family, security lens. Both
are high and both were confirmed by their verifiers.

## What was wrong

- **SEC-B-1.** The canvas and the read view treated an image as governed when
  its `src` began with `/api/authoring/images/`. A browser removes dot
  segments, raw or `%2e`, before it sends a request. So
  `/api/authoring/images/../../tenant-export/full` was fetched as
  `/api/tenant-export/full`, with the viewer's own credentials, on render, with
  no click.
- **SEC-B-2.** Every other `src`, an external https address or any `data:` URI,
  was displayed live. So every reader's browser contacted a host the content
  chose, and a figure's bytes could change after approval, while the export
  already printed "Figure not exported".
- **Neither was stopped on save.** The section save stored any `<img src>`,
  and the server sanitizer kept it.

## Decision

In a governed section, a figure is exactly one of two things:
- `/api/authoring/images/file_<digits>_<base36>`, the id the upload store
  mints, and nothing more;
- an inline base64 PNG, JPEG or GIF, the types both export branches file.

Anything else is neither fetched nor shown as an image. The read view says:
"This figure is not shown: only an image uploaded to the document can be
displayed or filed. Upload the image to include it."

## The change

- **One rule, in `shared/authoring/figure-refs.ts`,** used by client and server:
  `isGovernedImageRef`, `isInlineFigureImage` and `isFigureSrc`, each compared
  against the whole string.
- **`imageNode.ts`.**
  - The resolver fetches only a governed reference and refuses everything
    else before any request.
  - The schema's `parseHTML` no longer admits a non-figure, so paste,
    `setContent` and `insertContent` cannot bring one in. Stored content that
    holds one fails the fidelity gate and opens in source mode.
  - The node view says the figure must be uploaded.
- **`renderSafeMarkdown.ts` and `AuthoredHtml.tsx`.** Nothing but an inline
  figure stays on a live `src`. A refused one renders as the sentence above.
- **Server.**
  - `sanitizeAuthoringSectionHtml` drops a non-figure `<img>`.
  - `refusedFigures` reads the HTML as a browser does, catching `<image>`,
    uppercase or unquoted `SRC`, and character references.
  - The section PATCH refuses a save that carries a non-figure with 400
    `FIGURE_NOT_UPLOADED`. It names each image by position, writes nothing,
    and never rewrites governed content. The refusal returns before the
    handler takes a database connection.
- **Two editor fixtures** used the unminted id `/api/authoring/images/77`. They
  now use `file_77_a` (`captionsInCanvas.test.tsx`,
  `structuralFidelity.test.ts`).

## What else this could have stopped showing

`external-src-inventory.txt` searches migrations, seeds, templates and fixtures.
None stores an external or non-figure image src; the only hits are test
fixtures and export chrome.

At runtime, a Word import can produce `data:` images of other types (EMF, WMF,
TIFF). Those now open in source mode, and a save is refused until the image is
re-uploaded.

## Shown failing first

- **`red-vitest.txt`:** 72 of 110 new or updated tests fail on the old code, and
  the shared suite cannot load.
  - The traversal src resolved to a displayed `blob:`.
  - `AuthoredHtml` rendered it.
  - The PATCH answered 200.
  - The sanitizer kept it.
- **`green-vitest.txt`:** the six suites pass 149 tests, and 84 neighbouring
  suites pass with the two fixtures updated. The lead re-ran the six suites
  and both fixture files in the shared tree: 183 of 183.
- **`mutants.txt`:** 17 mutants, 16 caught. The one not caught (the hook moved
  to `afterSanitizeAttributes`) is equivalent: a src the URI policy strips
  leaves an img with no src, and that img is removed too. The code comment was
  corrected so it no longer claims the order matters.
- **ESLint:** no warning added (`eslint-before.txt`, `eslint-after.txt`).
  The PATCH handler's existing size and complexity warnings grew but did not
  multiply.
- **`typecheck.txt`:** 0 errors.

## Not done here

- **Export should use the same rule.** `server/export/authoring-images.ts`
  still extracts an id from `/api/authoring/images/<id>/../x` and accepts
  upper-case data types, so what is filed could differ from what is shown.
- **Other write paths still store any img src:** section create, the co-author
  PUT and batch-draft accept. Each should call `refusedFigures` and return the
  same 400.
- **Legacy sections** holding an external image open in source mode, and
  their saves are refused until the image is removed or uploaded. That is
  intended, but authors will meet it.
- **The production CSP** still allows `img-src https:`.
