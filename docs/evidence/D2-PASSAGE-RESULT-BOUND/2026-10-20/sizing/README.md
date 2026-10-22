# Registered passage-handler sizing — frozen baseline proof

## What already exists

`server/services/ana/document-passage-tools.ts` already registers the passage
search handler, uses the shared organization/actor preamble and canonical scope,
renders coverage/ranking honestly, and fits passages through context-text,
hit-text and whole-passage reductions. Its existing budget is 7,500 serialized
UTF-16 code units. It retains a final passage even when its metadata cannot fit;
query echoes and diagnostic reason text are not bounded.

`document-passage-tools-budget.test.ts` already qualifies ordinary ranked-prefix
fitting and preserved source fields. The parent contract completes that fitter;
this suite neither imports a proposed helper nor edits the existing budget suite.

## Frozen baseline

Production baseline: `4282257ac3da9b1c5d15b8e7db6c7599f2388f28`.
Approved root contract: `aef0f66cc`, with wording/consumer amendment `b49aaec71`.
The sizing rules exercised here are unchanged by that amendment.

Actual registered handler with its real shared preamble; catalog/retrieval and
database I/O are synthetic seams. This proves response sizing and preservation,
not database policy, source authority, relevance, provider behavior or aggregate
multi-tool-round delivery.

Node 22.23.3, canonical `vitest.config.ts`, one worker, no parallel files,
4 GiB heap. `baseline-command.json` records exact argv/environment, timestamps,
test bytes and 19 unchanged baseline inputs before/after execution.
`baseline-red.txt` is unmodified combined output.

Result: **18 intended failures, 6 passing controls, 24 tests**, exit 1. No
fixture/import/setup/timeout errors. Failures are serialized overflow or absent
contract omission flags, not missing APIs:

- Oversized/plain, escaped-control, escaped-quote and Japanese/astral query
  echoes, hits and misses; the full trimmed query still reaches retrieval.
- The exact serialized 1,000/1,001-character query and diagnostic boundaries.
- Oversized diagnostic strings retain coverage counters and unfiled-upload
  unknown/more flags, explicitly omit reasons and do not mutate frozen input.
- Impossible highest-ranked title/locator/section metadata and combined pressure
  omit matched passages intact without reporting a genuine miss or reranking.
- Passing controls preserve ordinary misses, exact passage fields, query wording,
  unknown coverage and highest-ranked text before lower-ranked text is omitted.

Scoped ESLint with `--max-warnings=0` exits 0. Exact command/raw output are kept.
`frozen-test.json` binds the final test bytes and counts. The evidence manifest
binds these files except itself. No production edits, Git mutations, compiler,
live database, OCR or provider calls were performed by this owner.
