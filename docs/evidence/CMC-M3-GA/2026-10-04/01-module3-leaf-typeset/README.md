# A placed Module 3 section is filed as a typeset document, not as markdown

Row **D2** (launch catalog: Submission Center; CMC Module 3 → IND sequence).
Closes hand-off item 17 in `docs/work-orders/README.md` ("the placed section is
filed as markdown text").

## The defect

`place-module3-into-submission.ts` files each approved §3.2 section as a
`coauthor_documents` snapshot whose content is the composition's markdown,
`module3Composer.renderComposedSectionMarkdown`. These are the same bytes as the
governed artifact, and that contract is pinned by the placement's tests.
`leaf-source-resolver.ts` rendered that string with `renderLeafPdf`, a text
renderer. The PDF a reviewer opens therefore printed `## Control of Drug Substance`,
`### Batch Analyses`, and table rows as `| S-2026-006 | drug substance | … |`
with `| --- | --- |` separators (`before-3.2.S.4-page1.png`, a real placed
§3.2.S.4 from the local database).

The validation package path, `orchestrator-real-package.ts`, had the same gap in
another form. It serialised every table to `a  |  b` text lines, because the text
renderer could not draw a table.

## The fix

- **`server/services/ectd/typeset-blocks.ts`** (new) reads the stored markdown
  with `marked`'s lexer, already a production dependency, into headings,
  paragraphs, lists, tables and preformatted blocks.
  - Inline HTML keeps its raw characters, because in CMC prose `<LOQ` and
    `<0.05%` are values, not tags.
  - Entities are decoded once.
  - An escaped `\|` inside a cell stays inside the cell.
- **`server/services/ectd/typeset-leaf-pdf.ts`** (new) lays the blocks out with
  pdf-lib.
  - Headings are bold, and become bookmarks nested under the document bookmark
    on the page where each is drawn.
  - Tables are ruled grids whose header row repeats on every page the table
    continues onto.
  - Column widths keep each column's longest unbreakable piece. Words break at
    `-`, `/` and `=` before they break by character.
  - Type steps down from 9 pt through 8 to 7.5 pt. A table too wide for a portrait
    page is set on landscape pages, together with the heading that introduces it.
    That is how wide impurity and batch tables are presented in Module 3
    (`after-3.2.S.4-page3-landscape-impurities.png`).
  - Output is byte-deterministic, with fixed metadata and epoch dates, so the md5
    in index.xml is stable.
- **`server/services/cmc/module3-placement-marker.ts`** (new) holds the one
  `placedFrom` constant that the writer and the resolver share.
- **`leaf-source-resolver.ts`** typesets a coauthor document only when its
  metadata marks it as a Module 3 placement. Every other leaf still renders
  exactly as before.
- **`orchestrator-real-package.ts`** draws composed sections through the same
  renderer (`composedSectionBlocks`). `serializeTable` and `sectionToContent`
  were used only by this path and its tests, and are deleted.

The stored content does not change, so the "filed leaf and governed artifact are
the same bytes" contract still holds. The hand-off framed HTML storage as a
product decision; reading the markdown as markdown makes that decision
unnecessary.

## Red, then green

`server/services/ectd/__tests__/module3-leaf-typeset.test.ts` drives the real
resolver on PGlite with a real placement snapshot, and reads the PDF back with
pdfjs.

Before the resolver hook:

```
× a placed Module 3 section, through the leaf resolver › files the section as headings, prose and a table — never as markdown
  → expected 'm3.2.S.4.1 Module 3 — 3.2.S.4.1 Speci…' not to match /(^|\s)#{2,}\s/
Tests  1 failed | 7 passed (8)
```

After: 9 / 9. The suite also proves:

- a long stability table repeats its header on every page (140 rows, 3 or more pages);
- a wide table keeps every word;
- a nine-column table turns onto a landscape page with its heading, and the text
  after it returns to portrait;
- bookmarks nest;
- `<LOQ` and `&ge;` survive.

Wider runs: `server/services/ectd/` and `server/services/cmc/` (107 files,
1,289 tests), and 15 orchestrator, package and sign-path files (243 tests), all
green. tsc is clean, and the ESLint ratchet reports no file changed its warning
count.
