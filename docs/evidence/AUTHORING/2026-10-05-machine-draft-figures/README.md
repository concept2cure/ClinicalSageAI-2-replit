# A model's image is never a figure, and the XML export files what the others file

**Finding:** item 18 on `docs/work-orders/README.md` (2026-10-04, unclaimed).
It came from the figure rule's refute-review, round 3
(`docs/evidence/reviews/2026-09-28/editor-family/fixes/SEC-B-1-2-followons/r3/`),
which handed on O2 and O3 unchanged.
**Rows:** D2 (launch catalog: Authoring) and D5 (what a filed document carries).
**Date:** 2026-10-05.

## O2: the from-draft path kept a model's images as figures

`POST /api/authoring/docs/from-draft` with `provenance.source = 'ana'` (a
machine draft) sanitized each section with the editor's allowlist. That
allowlist keeps an image whose src is a figure: an inline PNG, JPEG or GIF, or a
governed reference to an upload. So it stored:

- a model's inline PNG, as a figure;
- a model-written reference to someone else's existing upload, as a figure the
  model never placed;
- `<p></p>` for a section that held only a non-figure image, which the eCTD
  resolver reads as content and would file as a blank leaf.

**Change.** `sanitizeMachineDraftSectionHtml` (`authoring-html-sanitizer.ts`)
applies the same allowlist with no `<img>` at all. A section left with no letter
and no digit is stored as `""`, so the resolver reports a gap. This is the
generation door's rule (D4 in the review). `createDocumentFromDraft` uses it
for machine drafts only. An import or a seed keeps its figures, because a
person placed them.

## O3: the XML export printed raw content

The XML export wrote each section's stored HTML verbatim inside CDATA. An older
section's external image URL (`https://collector.example/p.png?d=…`) or WebP
payload therefore appeared in the exported file, though the DOCX and PDF refuse
both and print `[Figure not exported: …]`.

**Change.** `xmlSectionContent` (`authoring-export.ts`) replaces every image the
other formats would not file with the same placeholder, named by the same
`unfiledFigureLabel`. A figure is kept as written. A section whose images a
browser and the export read differently files none of them, as in DOCX and PDF.
`authoring-images.ts` is only imported, not edited: another lane changed it
within the last 24 hours.

## Proof

| Case | Before | After |
| --- | --- | --- |
| Machine draft: inline PNG, governed reference and image in `<pre>` are not stored | **fail** | pass |
| Machine draft: an image-only section is stored `""` | **fail**: `<p><img …></p>` | pass |
| Imported draft keeps its governed figure (control) | pass | pass |
| XML: an external image URL is not in the file; its placeholder is | **fail** | pass |
| XML: a WebP payload is not printed | **fail** | pass |
| XML: a governed reference and an inline PNG are kept (control) | pass | pass |

- `red/before.txt` (from-draft) and `red/xml-before.txt` (export): each red run
  has trunk's version of the one source file under test.
- `green/after.txt`: 49 + 3 pass.
- `green/related.txt`: every suite that reads section HTML through the shared
  parser, the image resolver, the leaf renderer or the figure references,
  481/481. The authoring export and from-draft suites, 90/90, also pass.
- ESLint: no warning added. `tsc`: clean.
