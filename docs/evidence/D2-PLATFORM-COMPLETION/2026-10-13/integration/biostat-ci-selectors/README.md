# Biostatistics CI selector repair

Launch workstream: D2 platform completion, existing Biostatistics workbench.

The focused baseline reproduced four failures across the two assigned test
files: the reviewer-risk test selected both Indication fields, and the three
not-computed-reason cases selected multiple Interim look text nodes. These
failures occurred before the original endpoint/result assertions could run.

The reviewer-risk test now locates the existing Statistical defensibility card
and selects its labeled inputs and assessment button within that card. The
interim helper selects the calculator button by its exact title from the
existing calculator registry. No production UI, endpoint, response fixture or
scientific assertion changed. In particular, the request-body checks,
deterministic verdict, absent-H1 reason, computed values, long-method exclusion,
and governed filing assertions remain intact.

Validation used Node 22 and the repository's normal Vitest configuration:

```sh
npx vitest run --config vitest.config.ts \
  client/src/concept2cure/v2/__tests__/biostatWorkbench.test.tsx \
  client/src/concept2cure/v2/__tests__/workbenchRendersNotComputedReason.test.tsx
```

- `baseline-red.txt`: four failures and 86 passes before the selector repair.
- `selectors-green.txt`: 90 passes across two files after the repair; exit 0.
- `baseline-eslint.txt`: original HEAD version has one existing max-lines warning.
- `scoped-eslint.txt`: repaired files have zero errors and the same one warning; exit 0.
- `source-digests.json`: SHA-256 identities of the two verified, frozen test files.

This is test selection evidence, not regulatory qualification or deployment
evidence. No TypeScript/build run, warning baseline update, branch operation,
commit or push was performed in this scoped session.
