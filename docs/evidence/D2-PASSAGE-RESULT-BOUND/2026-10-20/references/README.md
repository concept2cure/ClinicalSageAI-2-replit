# Exact passage references under serialization pressure

## What already exists

- `server/services/ana/document-passage-tools.ts` registers the actual handler,
  formats exact context references, fits context text then hit text then whole
  lowest-ranked passages, and carries coverage/ranking/omission guidance. Its
  baseline fitter keeps one oversized passage and cannot bound oversized query
  echoes or diagnostic reasons.
- `server/services/ana/__tests__/document-passage-tools-budget.test.ts` already
  checks ordinary rank-prefix, staged text omission and exact retained locators.
  This proof extends those observable invariants across mixed Unicode, escaping,
  markup and oversized envelope fields rather than replacing the fitter.
- `server/services/ana/draft-source-identity.ts` creates exact context identities
  used by the fixtures. Retrieval and source admission remain their existing
  services; this suite does not claim to qualify them through synthetic I/O.
- The parent `CONTRACT.md` records the current-code/deleted-history search,
  approved completion and separate aggregate-round limitation.

## Frozen proof

The suite uses actual `registerDocumentPassageHandlers` and its actual shared
error wrapper. Only catalog scope/service and canonical retrieval are synthetic
boundaries. It imports existing exports, so no missing-module failure is used.
Every fixture is recursively frozen, compared before/after the call, and uses
the actual context hash helper. The independent oracle checks delivered rank
prefix, exact title/locator/IDs/hash/numeric hit and context spans, unchanged
context identity/chunk range/clipping, exact delivered text and relative hit
coordinates. It does not reconstruct the fitting algorithm.

Baseline on unchanged production: **4 intended failures, 5 passing controls,
9 tests; exit 1**. All four failures are serialized-size assertions:

- long escaped query: response echo overwhelms the envelope;
- huge indexing diagnostic: repeated reason text overwhelms the envelope;
- oversized highest-ranked title, including a short raw string whose JSON
  escapes expand past the bound: the final locator remains too large.

Passing controls retain exact ranked references across quotes/backslashes,
control characters, Japanese/emoji and markup, and keep a genuine miss distinct
with unknown outside-index coverage. The original full trimmed query and admitted
scope object are verified at the canonical adapter boundary in every case.

`baseline-command.json` records exact argv, Node version/environment overrides,
timestamps and before/after hashes for all 17 root-selected baseline inputs plus
the owned test. All 18 were unchanged. `baseline-red.txt` is unmodified output.
Canonical Node22 Vitest uses one worker, no parallel files and a 4 GiB heap.
Scoped ESLint `--max-warnings=0` passes; its exact command/raw output are retained.

No production or legacy test edits, Git mutations, compiler, provider or live
database calls were performed. This proof concerns the registered handler body;
it does not establish every aggregate tool-round handoff, framing overhead,
retrieval relevance, native source admission or language recognition accuracy.
