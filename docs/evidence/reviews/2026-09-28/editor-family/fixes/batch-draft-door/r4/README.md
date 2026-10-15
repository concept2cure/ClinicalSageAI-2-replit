# Round 4: the refute-review of round 3

Periodic review 2026-09-28, editor family, the batch-draft accept. An
independent refute-review of round 3 (at 283fe08c4) found eleven defects. Its
report, which quotes each probe's output, is `review-probes/REPORT.md`, with
paths redacted. The probe scripts are not kept: they import the exported tree
the reviewer ran them against, which the repository does not hold, so they
cannot run here (the pre-push untracked-imports gate refuses them). Each
finding is answered below, red first.

The rule, as decided: AnA is credited with a clause only when every reader of
the saved content shows the words of AnA's turn record for it. Where readers
can disagree, the clause is not compared and stays the saver's.

| Finding | What was wrong | The fix | Pinned by |
|---|---|---|---|
| D2 | The lineage removed `<b"…">`, `<b/…>`, `<b,…>`, `<i(…)>` and `<u=…>` as tags. The leaf and the export print them. | A tag is removed only when a browser and node-html-parser read it alike: a strict name and strict attributes. Any other `<` a browser may read as markup opens the not-compared region. | `machine-attribution-readers` "D2 …", with a 6,000-token property: where the lineage compares, both parsers show the same text, and nothing removed is shown. Route "D2 …" ×2. |
| D5 | An `<img alt>` passed the figure rule, and the leaf printed the alt inside a credited clause. | A clause holding an image is not compared, even when AnA's record has the same image. | Unit "D5 …" (strengthened after a surviving mutant, below); route "D5 …". |
| D1 | `<pre>` was raw text to node-html-parser. | Closed in the readers by 737c4e67c (parseSectionHtml). The lineage no longer credits the tag's attribute words either (D4). | Route "D1 …" and "D1 is also closed in the readers since 737c4e67c". |
| D4 | The editor's source mode shows every character, and the lineage removed attribute words with their tag. | A tag is removed only when each attribute is one the editor writes, with a value it writes: text-align, table widths, cell spans, the comment anchor. Content that opens in source mode is read as plain text, through the editor's own test, now shared (`shared/authoring/source-mode.ts`). | Unit "D4 …"; route "D4 …" ×2; `shared/authoring/__tests__/source-mode.test.ts`. |
| D3 | `<template>` and `<head>` hid words from the leaf in a credited clause. | template, head, svg, math and comments open the not-compared region, with the raw-text elements. | Unit "D3 …"; route "D3 …". |
| D6 | The export prints footnotes, citation numbers and locators, and cross-reference labels in place of the text. The editor paints citation markers. | A clause overlapping an element a reader prints something for is not compared, up to the element's end tag. That is an image, or alt, title, data-note, data-cite, data-cite-locator, data-xref, data-author-name, start and the like. | Unit "D6 …", including elements whose words run into a later clause; route "D6 …". |
| D7 | `2<b>4</b>` compared as "2 4". Every reader shows "24". | Inline tags read as nothing and block tags as a space, on both sides. | Unit "D7 …". |
| D8 | The verifier's markdown reading dropped every `*`, so "5*10 mg/kg" verified "510 mg/kg". | Only paired emphasis, list markers that start a line, and thematic breaks are dropped. An escaped asterisk or pipe reads as the character. | Unit "D8 …"; route "D8 …". |
| C2 (a) | The clause splitter cut inside `<p style="text-align: justify">`, so an honest draft was not credited. | The batch-draft accept and the authoring save split the content with its tags masked (`clauseSpans`, lineage-gate.ts). | Route "C2 … inline style" and "… one clause". |
| C2 (b) | The region rule ran on plain text. A "<style guide>" mention dropped all later credit, new or carried forward. | The region applies only to HTML content. In plain text every character is compared. | Unit "C2(b) …" ×4, carry-forward included; route "C2 … XML example". |
| C2, the weaker case | `<LLOQ … >3×ULN` across two clauses was not credited. | Fixed by the same rule: plain text is compared character for character. | Unit and route "LLOQ". |
| AUTH | `MACHINE_AUTHOR_IDS[authorId]` was read by truthiness, so "constructor" passed. The verifier took the author from the request. | The vocabulary is a frozen null-prototype object, read with `Object.hasOwn`. A verified claim names `ANA_MACHINE_AUTHOR_ID`. | `accepted-machine-text` "drops …" ×6 and "… inherits nothing"; route "AUTH" ×2. |
| DUP | The same claim sent three times credited three repeats of a sentence the record holds once. | The verifier says how many times its records hold a text (`occurrencesInRecords`). The lineage credits no more than that, counting the clauses it carries forward and accepts again. | Unit "DUP"; route "DUP" ×3: repeated claims, overlapping claims, the same draft accepted twice. |
| FIG | `<template><img>` passed the figure rule. | Closed at HEAD by 737c4e67c (the "read-differently" refusal). | Route "FIG …", green at HEAD and now. |
| Own | Found in this round's own code: the `< sup` pattern was quadratic in a run of white space (30 s for 100,000 spaces). | One run of white space, then an optional `/` and a second run. | Unit "linear time …" ×8. |

D1 to D7 reach the authoring AI-draft accept too, through the same lineage. The
unit block "the authoring AI-draft accept … reaches the same rules" runs each
case on that door's path (detectSpans, then the machine pass with the draft as
generated). It is red against HEAD's code (`red-aidraft-door.txt`).

## Proof

- Red, against HEAD's code: `red-unit.txt`, `red-integration.txt`,
  `red-aidraft-door.txt`. Found while fixing, and red first too:
  `red-dup-reaccept.txt` (the same draft accepted twice) and
  `red-linear-time.txt`.
- Green: `green-unit.txt` (4 files, 133 tests), `green-integration.txt`
  (3 files, 73 tests).
- Related suites: `related.txt`. Server: 99 of 100 files, 1,237 of 1,238
  tests. The one failure is not this change's: it fails at HEAD the same way
  (see below). Client editor suites: 38 of 38 files, 435 tests.
- Mutants: `mutants/summary.txt`, 22 of 22 killed against the final code, one
  file each. D5-image survived the first run
  (`mutants/D5-image-survived-first.txt`): its test used an image with an alt,
  which another rule already catches. The test now also covers an image with no
  alt, and kills it.
- `lint.txt`: the same 10 warnings as HEAD, none new; the new files have none.
- `tsc.txt`: no type errors in any touched file (a narrow program, described
  in the file).
- `review-probes/REPORT.md`: the reviewer's report, with each probe's output.

This round supersedes the lane README's "Not done here" premise that attribute
text is hidden from every reader that parses HTML (refuted by D4).

## Not done

- The authoring AI-draft accept keeps its unmasked split. Its quote pass
  splits the content in source-attribution.ts, outside this change, and its
  remainder must be the same clauses. There, a style's ": " still cuts its tag,
  and both halves stay the saver's. That fails closed.
- Table foster parenting is not modelled. A browser moves text that sits in a
  table outside any cell to before the table; node-html-parser leaves it in
  place. Neither the editor nor an honest draft writes such text.
- A clause carried forward from another turn record counts against this
  save's records. That can under-credit, never over-credit.
- Formatting is still not attributed, as in round 3 (a strike over AnA's
  words). Numbers a reader generates (list markers, caption numbers) are not
  compared either; a list's `start` is, because it changes them.
- In the authoring save the accepted text is the editor's plain text. Clauses
  holding a link, a citation, an image or a pending suggestion now stay the
  saver's.
- In HTML content, a `<` followed by a letter that is not a tag (for example
  "ALT<ULN") opens the not-compared region: the readers disagree on it.
- Outside this lane: `server/routes/__tests__/batch-draft-accept.test.ts`
  fails at HEAD. It expects `versionReplacedCoauthorContent(queryableFromDrizzle(rdb), {`,
  and the route has called it with `client` since 283fe08c4.
