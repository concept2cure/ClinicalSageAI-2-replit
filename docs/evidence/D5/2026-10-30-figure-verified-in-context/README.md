# D5: the scientific review verifies a mapped figure where it stands in the saved text (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane. Found by the CSR path sweep's
scientific-review finder and verified by hand. The sweep's verifiers did not
run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The verifier | `server/services/authoring/csr-scientific-review-core.ts` `prepareScientificReviewReceipt` | For each claim, checks the span's hash, that the cell's value stands whole in the span, and that the cell exists in the retained table | "Whole" was judged inside the slice. The screen sends spans exactly the figure's width, so the slice had no neighbours and the rule did no work |
| The screen's rule | `client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts` `figureOccurrences` | Offers a cell only where its value stands in the whole section: outside markup, on number boundaries, with a "%" only for a percentage column | Its own copy, which the server did not share |
| The boundary rule | `shared/authoring/csr-scientific-review.ts` `isExactNumericalDisplayAt` | "190" is not at offset 1 of "1190" | Its comment says "12" is not inside "12.5", but it accepted it: a following "." did not count as continuing the number |

**What it allowed.** A map sent straight to the review route, bypassing the
screen, could bind a retained cell to:
- "190" inside "1190";
- "12" inside "12.5";
- a count before "%" in a column that is not a percentage;
- digits inside an HTML attribute.

The receipt then said the server had verified each one. The route is served
at launch. Doing this needs the assigned, independent reviewer, who also
attests, but the record overstated what was checked. The screen itself
offered "12" inside "12.5".

## What changed

- **`reportedDisplayAt`** (shared) is now the one rule: outside markup
  (`markupRanges`, moved from the screen), on the number boundaries, and a
  following "%" only for a percentage column.
  - The screen offers occurrences by it.
  - The server checks each claim by it, against the whole saved section,
    with the cell's own header, after the cell lookup (`reportedInSpan`).
    The earlier checks are unchanged, and so is their refusal order.
- **`isExactNumericalDisplayAt`:** a "." or "," followed by a digit continues
  a number; one that ends a sentence ("was 12.") does not.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed verifier) | Green |
|---|---|---|
| `csr-claim-in-context.test.ts` (new): 190 in 1190; 12 in 12.5; digits in markup; a count before "%" in a non-% column | 4 accepted | 4 refused (`CSR_EVIDENCE_CLAIM_CHANGED`) |
| A whole figure, and "83.3" reported as "83.3%" in a % column (controls) | pass | pass |
| The shared rule alone, before the boundary fix | — | "12" in "12.5" still accepted (`green.txt` notes it) |
| `scripts/ci/csr-scientific-review/scientific-review.test.mjs` | — | 40/40 |
| 9 files reaching the shared rule, the screen's map and the verifier | — | 94/94 |

## Disclosed

- `shared/authoring/csr-scientific-review.ts`, `csr-scientific-review-core.ts`
  and `csrEvidenceMap.ts` are this lane's files. Only this lane changed them in
  the last 24 hours (`dee4cb686`, `097fb216c`).
