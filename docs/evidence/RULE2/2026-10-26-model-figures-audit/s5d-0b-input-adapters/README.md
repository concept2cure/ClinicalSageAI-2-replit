# Rule 2 · S5d-0b: the S5 input adapters join the shared helpers

**Rule:** CLAUDE.md working agreement, "zero duplication", and RULE 3, item 5.
**Plan:** `docs/design/ONE_DESIGN_PLAN.md` package **F1**, after S5d-0 (`../s5d-0-three-valued-helpers/`) and before
the S5d families.
**Date:** 2026-11-09.

## The duplication

S5d-0 gave the three-valued helpers one home. The first S5d review then found the same pattern in the small input
adapters:
- **On trunk:** `listed` ("a", "a and b", "a, b and c"), `oneOfInput` and `textInput` (the `refuseUnlessStated`
  checks for a value from a vocabulary and for non-empty text) were defined in
  `server/services/biomarkers/biomarker-knowledge.ts`. `oneOfInput` was defined again, byte for byte, in
  `server/services/digital-health/digital-health-knowledge.ts`, which the S5b README recorded as a residual ("Small
  adapters").
- **In the S5d plans:** five of the six copy one or more of them again. Two also define a `statedText` reader, in
  two variants. That reader exists in no engine today, so it is not moved here: it lands in the first S5d family
  commit that calls it, with that family's tests (the coordinating session's decision, 2026-11-09).

## What already exists (RULE 3)

- **The home:** `server/services/immunogenicity/immunogenicity-reference.ts`, which since S5d-0 holds the readers,
  the three-valued helpers and the every-answer search, and whose header names it the one home for every S5 engine.
- **Same-named helpers that are not these.** The guard's exception list names each module-level one with its reason:
  `server/services/ana/saved-section-writing-review.ts`'s `listed`, which truncates a list of items for a payload.
- **No text reader to converge.** No S5 engine has a reader of `statedText`'s shape (stated text, unstated when
  omitted, refused otherwise). `digital-health-knowledge.ts`'s `deviceNameInput` is a `refuseUnlessStated` check, not
  a reader. The three governance ledgers' own `statedText` functions (`assumption-registry-service.ts`,
  `decision-record-service.ts`, `governance-boundary-service.ts`) are required or trimmed, refuse with
  `LedgerInputRefusal` or read as null, and are outside S5.
- **Searches run:** `git grep` across `server/services` for module-level `function` and `const`/`let` definitions of
  `listed`, `oneOfInput`, `textInput`, `oneOf`, `requiredText` and `statedText`.

## The change

- `immunogenicity-reference.ts` gains `textInput`, `oneOfInput` and `listed`, exported and moved verbatim from
  `biomarker-knowledge.ts`. The digital-health copy of `oneOfInput` was compared before the move and is identical.
- `biomarker-knowledge.ts` and `digital-health-knowledge.ts` delete their copies and import them. Behaviour is
  unchanged.
- The header of the home lists the adapters with the rest.
- `s5-three-valued-helpers-have-one-home.test.ts` guards all ten names, by name, across `server/services`, with
  the exception above, and pins the three new helpers' behaviour.
- Sizes: biomarkers 95,193 → 94,457 bytes, digital health 99,633 → 99,322, and the home 13,297 → 14,544.

**User-visible:** nothing changes for a user.

## Proof

Run in this session.
- `red/before.txt`: on a private copy of `f75de861e`, 4 of the extended test's 41 cases fail. The guard fails on an
  assertion naming the 4 copies, and "the home defines all ten" on an assertion. The two adapter pins fail because
  the exports do not exist yet. The 37 S5d-0 cases pass.
- `green/after.txt`: 1,389 of 1,389 pass in 47 files, on the working tree: the one-home test (41) and every suite
  that reads the biomarker, digital-health, GCP, GMP, medical-device or immunogenicity engines, their tools or the
  shared readers, each unchanged.
- **Gates:** typecheck (`typecheck-no-regression --incremental`) 0 errors; the ESLint ratchet changes no file's
  warning count.
