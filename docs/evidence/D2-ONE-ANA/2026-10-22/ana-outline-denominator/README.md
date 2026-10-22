# AnA's outline read states the readiness figure's own denominator (2026-10-22)

Row: D2. The F23 hand-on "Denominators shown beside the figure" (`docs/evidence/D2-ONE-ANA/2026-10-22/f23-one-dossier-read/README.md`). Owner named there: "the AnA and editor lanes".

## What already exists

- **The rule.** Since F23 (8/9), readiness leaves out a heading that holds other sections and has not been worked. The rule lives in one place:
  - `c2c_document_counted_readiness()` in `migrations/20260528_phase9_document_schema.sql`;
  - the same rule in TypeScript, `countedSectionSql` and `markCountedSections` in `server/services/c2c/section-content.ts`, already used by `dossier-read.ts`;
  - the complete statuses, `C2C_SECTION_COMPLETE_STATUSES` in the same file.
- **AnA.** `read_governed_document` in `server/services/ana/AnaToolExecutor.ts` returned the document's `readiness` together with "Outline with N sections", N counting every row. A model narrating the two together reads "R% of N sections" over the wrong N. The handler was last changed on 2026-10-07, so this edit does not meet the other lanes working elsewhere in the file.
- **The editor.** The tree header in `DocumentWorkbench.tsx` says "N sections". The outline reply carries `readiness`, but no editor file draws it: `grep -rn readiness client/src/concept2cure/v2/editor` finds only type fields in `useFilingOutline.ts`. No figure sits beside that count, so the editor half of the hand-on does not apply, and nothing there changed.

## What changed (AnA completes its read with the existing rule)

- Each outline row carries `counted`, from `markCountedSections`.
- The message states the figure in its own terms, for example: "Outline with 6 sections; readiness 40% counts 5 of them (2 approved or locked). 1 heading not yet worked is not counted." The model narrates these numbers; it does not divide.
- No new rule, query or status list: the handler imports the existing ones.

## Red, then green

- `red/every-row-counted.txt`: the new PGlite test, in which the database trigger computes readiness (40%), run against the handler as it was. No row is marked counted, and the message counts all 6.
- `green/outline-denominator.txt`:
  - this test;
  - `ana-launch-scope`;
  - the readiness suites: `document-readiness-counts-leaves`, `dossier-read` and the `c2c-section-completion` contract.

  37 of 37 pass.

Typecheck clean; the ratchet shows no change. `ci:internals-in-copy`, `ci:sql-interpolation` and `ci:launch-scope` pass. HawkScan not run: HAWK_API_KEY is not set.
