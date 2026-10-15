# SEC-B-1/2 follow-ons, round 3: the figure rule's refute-review, answered

On 2026-10-04 an agent told to refute `e93ee0387` reviewed it at the merge
`25740b97c`. The commit applies the section figure rule to create, AI
drafting and export. Its probes and their outputs are in `review-probes/`, as
returned; it changed no repository file. Its verdict was **defect found**:

- six defects in the commit's scope, one of them high and introduced by the
  commit;
- a high in another door.

Each is answered below, red first and then green. One mutant per fix is in
`mutants/`: 11 of 11 are killed.

## In scope

| ID | Finding | Fix |
|---|---|---|
| D1 high, introduced | `<img src=A SRC=B>`: a browser keeps the first of two duplicated attributes and the export's parser the last. The canvas showed A and the export filed B. Before the commit the export failed closed. | **The two readers must agree.** `imageReadingsDiffer` (`authoring-html-sanitizer.ts`) compares the export parser's image list with a browser's, in order. A section where they differ files none of its images, and those sources are filed for no other section either. The save, create, template and batch-accept doors refuse it, saying why. |
| D2 medium | A figure inside `<pre>` printed its base64 payload into the leaf, PDF and Word file, and `<code>` printed its tags, because node-html-parser reads `<pre>` as raw text. | **One parse configuration**, `server/export/section-html-parse.ts`, reads `<pre>` as markup. The export, the leaf and the agreement check all use it. The leaf's `pre` case walks its children verbatim and names figures. |
| D3 medium | A figure a browser builds no image from (inside a bogus comment, `<textarea>`, `<xmp>` or `<template>`) was still filed, and a governed reference was loaded. | The agreement rule of D1. Such a section files nothing, and the loader is not called. |
| D4 low | A model body of only a zero-width space, a soft hyphen or a word joiner was stored as `<p>…</p>`, which the eCTD resolver reads as content. | A body is stored only when it holds a letter or a digit. |
| D5 low, introduced | `refusedKind` read any 40 characters after `data:` as a type, so a typeless data URI printed 40 characters of its payload. | A type is `type/subtype` followed by `;` or `,`; otherwise "inline data". |
| D6 low | The create doors stored an external image the check never saw: one in a `<template>`, a comment or a `<textarea>`, a `srcset`, a `<source>`, or an SVG `<image>`. | The hidden cases are refused by D1's agreement rule. A `srcset`, a `<source>` and an SVG `<image>` whose URL is not a figure are refused by name. |

Two smaller points are not changed. The export trims a src where the save
does not; both refuse a padded src, so they only word it differently. Older
content holding `<image>` outside SVG is read as `<img>` by a browser.

## Another door

**O1 high.** The CMC Module 3 placement stores the composed markdown in
`coauthor_documents.content`. Its tests pin the same bytes as the governed
artifact, by design. The leaf renderer parsed every string as HTML, so
"Impurity B was <LOQ in all 3 batches; assay was within limits (>98.0%)" was
filed as "Impurity B was 98.0%).". The section editor and the authoring export
read a string with no known tag as plain text.

The leaf now opens stored content as the editor does (`asStoredHtml` in
`leaf-pdf-renderer.ts`, through the shared `looksLikeHtml`). This fixes the
whole class, not only this door, and keeps the placement's "same bytes". The
placement still files markdown syntax as text ("##", "|"), as before. A
structured HTML rendering of Module 3 for the leaf is a product decision for
that lane, handed on.

O2 (the from-draft path keeps a model's inline PNG and a model-written
governed reference as figures) and O3 (the XML export writes raw content in
CDATA) are handed on, unchanged.

## Proof

- Red then green, per fix: `red-export.txt`/`green-export.txt` (D1, D3, D5),
  `red-sanitizer.txt`/`green-sanitizer.txt` (the doors), `red-pre.txt`/
  `green-pre.txt` (D2), `red-generation.txt`/`green-generation.txt` (D4),
  `red-o1.txt`/`green-o1.txt` (O1: the placement's text read back out of the
  rendered PDF with pdfjs).
- `related.txt`: every suite that reads section HTML (115 files, 1,442
  tests). `leaf-related-run.txt`: every suite downstream of the leaf renderer
  (29 files, 435 tests: IND documents, package orchestration, placement,
  assembly).
- `mutants/summary.txt`: 11 of 11 killed. The one first survivor compared
  the two image lists as sets. It is killed by a table whose cell-less image
  a browser moves before the table
  (`mutants/M-agreement-ignores-order-after-pin.txt`).
- `lint.txt`: no new warnings. `tsc.txt`: clean.

Self-reviewed in this lane after the independent review above.
