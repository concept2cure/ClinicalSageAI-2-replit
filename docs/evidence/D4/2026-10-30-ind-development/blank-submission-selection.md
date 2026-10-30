# Complete omitted-filing selection for blank legacy requests

## What already exists

- `server/routes/ana-intelligence.ts` forwards `submissionType` to the shared
  service for both `/api/claude/draft` and `/draft/stream`. An explicit project
  can supply the filing, so a blank selection legitimately reaches that service.
- `draftProductInputs` in `AnaDocumentDraftingService.ts` reads the admitted
  program's recorded application. Its nullish fallback preserved empty and
  whitespace-only strings, incorrectly skipping that application; the prompt's
  raw-request comparison also described whitespace as an explicit disagreement.
- `applyRecordedDraftSubmissionContext` already treats a blank choice as omitted
  for nested batches. The correction completes the shared direct path instead
  of adding another route-specific fallback.
- `recorded-product-drafting-service.pglite.test.ts` already exercises actual
  product admission and recorded Canadian filing resolution with a captured
  gateway. The existing case now covers undefined, empty and whitespace choices.

## Correction and verification

Only blank strings are normalized to omission. Nonblank literal selections stay
unchanged and continue to take precedence; conflict presentation compares the
effective selection, preventing a false disagreement for blank input.

Tests were applied first: exactly two failures (empty and whitespace choices)
and 17 passes (`blank-submission-red.log`). After the minimal shared correction,
all requested tests pass: 19 recorded-service/PGlite, 287 declared-product and
39 batch-submission cases, 345 total (`blank-submission-green.log`). The captured
gateway never calls a provider; these remain context/wiring checks, not model or
scientific qualification.

Scoped lint exits 0 with no errors. Its six existing service warnings are five
unused imports and the pre-existing file-length warning; the changed functions
introduce no warning (`blank-submission-lint.log`). The test file is lint-clean.
`git diff --check` passes. No broad suite, project compiler, build, commit or push
was run by this slice; the lead serializes those checks separately.
