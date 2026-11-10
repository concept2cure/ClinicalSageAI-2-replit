# Rule 2 · S5d-0: the S5 three-valued helpers have one home

**Rule:** CLAUDE.md working agreement, "zero duplication", and RULE 3, item 5.
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1**, before the S5d families (`../design.md`, S5a–S5d).
**Date:** 2026-11-09.

## The duplication

The S5 slices keep an unstated fact unstated with two sets of small helpers:
- **The three-valued AND and OR**, `unstated`, `anyOf` and `allOf`. S5c defined them twice, identically, in
  `server/services/gcp-operations/gcp-operations-knowledge.ts` and
  `server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts`. S5b gave
  `server/services/medical-device/medical-device-knowledge.ts` a third `unstated`, the same predicate as a `const`
  arrow. The guard below found that one by name.
- **The "every answer" search**, `everyAnswer`, `conclusions` and `decidingFacts`, with `uniqueStrings`. S5b
  defined it in `server/services/biomarkers/biomarker-knowledge.ts`, unexported. Its S5d plans would have copied it
  into the post-approval and regulatory-strategy engines, because nothing exported it.

## What already exists (RULE 3)

- **The home:** `server/services/immunogenicity/immunogenicity-reference.ts` already holds the shared stated-input
  readers that every S5 engine imports: `statedBoolean`, `booleanInputStates`, `statedNumber` and `statedOneOf`. Its
  header calls them "the stated-input helpers". The engine `immunogenicity-knowledge.ts` re-exports named items
  only, so the new exports reach no other module and collide with nothing.
- **Other helpers with these names, which are not these and are not touched.** The guard's exception list names
  each module-level one with its reason:
  - `server/services/research-compliance/compliance-checklist.ts`: `anyOf`/`allOf` over its own `Condition` type;
  - `server/services/study-design/external-control-plan.ts`: `unstated(elements)`, which lists a plan's unstated
    elements as text;
  - `server/services/study-design/master-protocol.ts`: `unstated(scope, name)`, which builds a not-stated protocol
    element.

  Function-local variables named `unstated` (in the biomarker, dose-optimization, RWE, eCTD, electrical-safety,
  DCT and comparability code, and the executor) are local names, not module helpers. The guard reads module scope
  only. `server/services/precedent/device-lenses.ts` enumerates `[true, false]` for its own lens grid.
- **Searches run:** `git grep` across `server/services` for `function` and `const`/`let` definitions of each of the
  seven names, for `function (everyCompletion|completions|answersFor)`, and for `[true, false]`.

## The change

- `immunogenicity-reference.ts` gains `unstated`, `anyOf`, `allOf`, `uniqueStrings`, `everyAnswer`, `conclusions`
  and `decidingFacts`, exported and moved verbatim. The GCP and GMP blocks were compared before the move and are
  identical.
- `biomarker-knowledge.ts`, `gcp-operations-knowledge.ts`, `gmp-quality-systems-knowledge.ts` and
  `medical-device-knowledge.ts` delete their copies and import them. Their behaviour is unchanged.
- The shared file's header now says it is the one home of these helpers for every S5 engine, not only
  immunogenicity's, and that they are imported from it, never copied or moved back.
- Sizes: biomarkers 96,703 → 95,193 bytes, GCP 99,120 → 98,440, GMP 99,524 → 98,846, medical device
  99,816 → 99,752, and the shared file 9,918 → 13,297.
- `s5-three-valued-helpers-have-one-home.test.ts` (`server/services/immunogenicity/__tests__/`) holds the line:
  - **The guard** reads every non-test module under `server/services`. It fails on any module-level definition of
    one of the seven names, by name (a function or a `const`/`let` binding, whatever its signature), outside the
    home and the exception list. It also fails if an exception goes stale.
  - **The truth tables** are written out: `unstated` over omitted, null and stated values; `anyOf` and `allOf` over
    every pair of true, false, omitted and null (32 cases), and over no facts.
  - **The search:** `uniqueStrings`, `everyAnswer`, `conclusions` and `decidingFacts` on small cases.
- The S5d families import these helpers instead of copying them.

**User-visible:** nothing changes for a user. One definition now holds what an unstated fact means across the S5
engines.

## Proof

Run in this session.
- `red/before.txt`: on a private copy of `6ce440208` (trunk before this change), the guard fails on an assertion
  naming 11 module-level copies: 4 in biomarkers, 3 each in GCP and GMP, and the medical-device `unstated`. The
  behaviour pins fail only because the shared exports do not exist yet. For a verbatim move, they are not the
  behaviour proof; the engines' own suites are.
- `green/after.txt`: 1,375 of 1,375 pass in 46 files, on the working tree. That is the one-home test (39) and every
  suite that reads the biomarker, GCP, GMP, medical-device or immunogenicity engines, their tools or the shared
  readers, each unchanged.
- **Gates:** typecheck (`typecheck-no-regression --incremental`) 0 errors; the ESLint ratchet changes no file's
  warning count, and the new test has none.
