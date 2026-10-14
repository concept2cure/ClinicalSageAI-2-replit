# Independent saved-template backend evaluation

Final result: **73 tests passed across two PGlite suites** on the final frozen
implementation, 2026-10-14 19:55 UTC. The three owned test files also passed
strict ESLint with zero errors and zero warnings. These results cover 43
preserved saved-document tests and 30 template-reference tests; they overlap the
root release regression run and must not be added to its count.

The initial behavior probe ran before backend implementation at synchronized
base `269d2c18`. It produced **16 failures and 44 passes**: all 43 existing cases
and one new access-refusal case passed. The failures demonstrated missing
recorded template identity/guidance, accepted continuations after reference
drift, verdicts despite malformed template sources, and missing paged reference
content. They were behavior assertions against executable production code,
without imports of unimplemented helpers. Tests were subsequently split and
their common SQL fixture extracted to retain the existing lint limits.

| Retained run | Actual result | Behavior demonstrated |
| --- | --- | --- |
| [Initial before](backend-initial-before.txt) | 16 failed, 44 passed | Saved identity, limits, guidance and reference drift were not handled. |
| [Missing guidance before](backend-missing-guide-before.txt) | 1 failed, 25 skipped | A templated section with no exact reference returned no explicit gap. |
| [Current rows before](backend-mixed-guide-before.txt) | 2 failed, 26 skipped | Empty lists hid a gap; an empty row alongside real guidance falsely declared one. |
| [Current JSON before](backend-json-guide-before.txt) | 1 failed, 1 passed, 28 skipped | Empty `examples=[]` and `ai_prompts={}` hid a gap; real JSON content remained available. |
| [Final after](backend-after.txt) | 73 passed in 2 files | All preserved and new cases passed after the bounded fixes. |

Log excerpts retain actual failure headings, assertions and runner summaries.
Their headers identify the source log and its SHA-256. Setup chatter and repeated
stack traces are omitted. Original source logs remain under
`/workspace/scratch/template-oversight-*` in this execution workspace.

## What the actual SQL and result checks establish

The renamed FDA 1571 preparation worksheet retains its exact stored template
UUID, source identity, `aiDraftable=false`, original-record limitations and each
section's saved CREATE guidance. Earliest recorded guidance wins over later
CREATE rows and changed current references. Tenant-specific and active global
fallbacks match the exact saved template and section code; same-code references
from another template or tenant do not appear.

Reference text remains separate from authored text. Writing scores, precision
verdicts, accepted-text coverage and section counts stay unchanged when reference
context is added. Long escaped Unicode guidance and document limitations are
reconstructed from ordered parts without omissions or split surrogate pairs;
every serialized tool response stays within 5000 characters. Reference records
over 8 MiB, excessive reference items, malformed lists and conflicting source
identities cannot produce a document verdict.

Source limitations/hash, recorded guidance and current reference changes refuse
continuation without requiring an authored-text timestamp change. Current actor,
project and whole-document access are admitted before template context is read.
Revoked access refuses review. Existing accepted-text, pending-suggestion,
citation-association, withdrawn-source, section-count and content-byte tests
remain intact. Review issues no content writes or model calls.

Missing section guidance now produces an explicit scoped reference gap. Empty
lists and empty JSON containers do not invent availability, while real text or
JSON in a sibling current row prevents a false gap. Legacy documents identify
unrecorded sources honestly; partial historical CREATE identities retain saved
guidance with `identity-only` verification and no inferred source details.
Documents without a stored template ID receive no inferred template or gap.

## Reproduce the current checks

Run from the repository root with its installed dependencies:

```sh
NODE_OPTIONS=--max-old-space-size=4096 node_modules/.bin/vitest run --config vitest.config.ts \
  server/services/ana/__tests__/saved-template-oversight.pglite.test.ts \
  server/services/ana/__tests__/saved-document-critique.pglite.test.ts

node_modules/.bin/eslint --max-warnings=0 \
  server/services/ana/__tests__/saved-template-oversight.pglite.test.ts \
  server/services/ana/__tests__/saved-document-critique.pglite.test.ts \
  server/services/ana/__tests__/_saved-document-critique-fixture.ts
```

The [template-reference cases](../../../../../server/services/ana/__tests__/saved-template-oversight.pglite.test.ts)
and [preserved saved-document cases](../../../../../server/services/ana/__tests__/saved-document-critique.pglite.test.ts)
use the [shared fixture](../../../../../server/services/ana/__tests__/_saved-document-critique-fixture.ts).
The connection injection executes real SQL in isolated PGlite rather than
qualifying live PostgreSQL RLS or concurrent writers. Audit fixture rows are
deliberately mutable for corruption probes; production audit immutability is
covered by the existing migration tests. No live provider, deployed model,
regulatory approval or whole-release qualification is established by this eval.
