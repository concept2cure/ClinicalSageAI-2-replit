# §3.2.S.7 and §3.2.P.8 file the right study's claims, and the data behind them

Row **D2**. From the discovery map's Module 3 mapper
(`p8-reads-drug-substance-stability`, `stability-data-never-filed`). Both
findings were re-read and confirmed in `module3Composer.ts` before fixing.

## The defects

1. **§3.2.P.8 stated the drug substance's study as the product's.** Shelf life,
   storage condition and time points were read with a first-match over every
   stability source, drug-substance studies included. The compile reads sources
   newest first, so recording a drug-substance retest study filed its "-20C" and
   "6 months retest" as the drug product's shelf life. Only the conformance
   verdict filtered to the product. §3.2.S.7 already had the mirror filter.
2. **Recorded stability results were never filed.** Both sections counted the
   recorded pull points and compared them, but no table rendered them. The
   §3.2.P.8 narrative cited "the stability data summarized above". §3.2.S.7's
   only "data" table rendered the register's list of test NAMES as one-cell rows
   under a time-point header. Placement files the composition verbatim, so the
   leaf claimed conformance over data it did not contain. 21 CFR
   312.23(a)(7)(iv)(a)/(b) requires the stability information itself.

## The fix (`server/services/module3Composer.ts`)

- §3.2.P.8 reads its claims from `dpOnly`, the product-scoped studies,
  preferring the side-scoped `drugProductShelfLifeClaim`.
- `stabilityResultsTable` is new. Every recorded pull point on the section's own
  side becomes a row: batch, condition, attribute, time point, result,
  acceptance criterion, and the comparison. Rows are sorted deterministically.
  The comparison is `pointVerdict`, now the single comparator that the
  conformance count also uses, so the narrative's count and the table's column
  cannot disagree.
- §3.2.S.7 draws its time-point matrix only when the parameters carry values,
  and drops the one-cell rows.
- Both narratives name the results table, or say that no results are recorded.
  Neither cites data "summarized above".

## Red, then green

`server/services/__tests__/module3Composer.stability-filed.test.ts` sets up a
drug-product study and a newer drug-substance retest study, each with recorded
results.

- Before the fix: **5 failed of 5**. §3.2.P.8 carried "-20C" and lacked "24
  months"; neither section had a results table; §3.2.S.7 had one-cell rows;
  "summarized above" appeared.
- After: 5/5. With the existing composer suite: 15/15.

Wider run: `server/services/__tests__`, `server/services/cmc`,
`server/api/cmc` and `tests/`, 740 files. Five tests fail, and none is from
this change. One is this lane's uncommitted knowledge-record test. The other
four fail identically on clean trunk:

- `decision-lineage.gate` (2);
- `founder-critical-path-proof` sign-out;
- `scanned-pdf-native-canvas`.

tsc is clean, and the ESLint ratchet shows one warning fewer in
`module3Composer.ts`. Live staff simulation: 118 passed, 0 failed.
