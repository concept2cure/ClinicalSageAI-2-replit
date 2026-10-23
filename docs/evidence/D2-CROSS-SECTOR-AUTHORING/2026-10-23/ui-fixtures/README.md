# Align the existing source assembly UI fixtures

## What already exists

`authoringCurrentRead.ts::authoringCurrentReadPath` already emits document and
section GETs with `?programId=<current program>`. The existing Workbench,
`documentRecordRead.ts`, Project files chooser and assembly controller use
those current reads. These two existing UI fixtures exercise the actual hosts
with synthetic HTTP, including dirty text, current project/account/bearer,
ceremony, uncertain-write recovery and retained AnA candidate guards.

## Fixture correction

`projectFilesAssemblyFlow.test.tsx` had exact unscoped map keys, so current scoped
GETs fell through to an unrelated generic fallback response. Its response seam
now validates the exact current program query before returning the existing
record fixture by pathname. No document/content/access validation was removed.

`workbenchAssemblyBuild.test.tsx` already served current reads by pathname, but
six recovery/late-navigation cases and associated request counters intercepted
only the obsolete unscoped sections URL. They now use one exact scoped endpoint
constant. Pending, lost/malformed response, account/bearer/refresh and ceremony
negative assertions remain intact. No production or shared fixture was edited.

## Actual qualification

- `retained-red-reference.json` identifies the parent's combined failure receipt
  and compressed raw-output hash, with the 15 assigned failing cases and both
  original source pins. These are 9 Project files and 6 Workbench cases; the
  other combined failures belong to separate fixture work.
- `focused-green.json`: 35 passed across the two actual-host suites, exit 0,
  with all 12 before/after test/config/host dependency pins unchanged.
- `lint.json`: both owned files pass `--max-warnings 0`, exit 0.
- `freeze.json` retains final owned pins and the observed qualified dependencies.
  Each execution receipt retains actual argv, UTC time, duration, Node/heap
  selection, exits, source hashes and compressed raw output/hash.

This is fixture alignment for the current scoped API contract, not a product
change or a new human acceptance, native server, provider or agency test.
The earlier independent static production review remains a separate activity;
this follow-up assignment changed only the two explicitly owned test files.
