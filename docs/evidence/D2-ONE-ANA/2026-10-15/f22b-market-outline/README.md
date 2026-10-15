# F22b — a market's own part of the filing, server side (2026-10-15)

Row: D2 (one AnA, one canvas; the filing outline the canvas navigates by).
Work order: docs/design/FILING_SPINE.md F22, part b.

A market added to a project (F22a) is a governed document holding that
market's Module 1 and 3.2.R. This slice makes every server path treat it as
that, by one shared rule (`shared/regulatory/filing-scope.ts`
`isRegionalSectionKey`, which the F22a scaffold now also uses):

| Path | Before | Now |
|---|---|---|
| `GET /api/c2c/documents/:id/outline` | the market pack's whole outline | the market's Module 1 and 3.2.R, plus `gaps`: the pack's mandatory common sections the home filing lacks (computed, never inserted) |
| commit to the filing (`commitSectionToFiling`) | a common code read "no such section", and `M3` (the container kept above 3.2.R) took the text | refused by name before any write |
| `POST /api/authoring/docs` with `c2c_document_id` | ignored | binds the new document to that market document; anything else named is 409 `MARKET_DOCUMENT_NOT_BOUND`, nothing created |
| `POST /api/authoring/sections` in a market copy | created any code | a common code is 409 `WRONG_FILING_SCOPE`, nothing created |

Scope is read through `to_jsonb(d)->>'filing_scope'`, so a database the
20261015e column has not reached reads every document as the home filing and
no statement fails inside the caller's transaction.

## Red, then green

- `red/outline-as-whole-pack.txt`: the outline test with the market branch
  turned off (the pre-F22b behaviour). 2 of 4 fail: scope reads `home`, the gap
  `2.1` is not named.
- `red/commit-without-scope-refusal.txt`: the commit test on the pre-change
  file. `M3` and `2.5` are not refused (2 of 5 fail).
- `red/market-binding-without-scope.txt`: the HTTP test on the pre-change
  binding and create files. 6 of 6 fail.
- `green/*.txt`: the same tests, plus the existing commit, binding, placement
  and program-scope suites they touch.

Typecheck clean; `ci:eslint-ratchet:since HEAD` no change; `ci:launch-scope`,
`ci:launch-scope-api`, `ci:canvas-path`, `ci:internals-in-copy`,
`ci:action-overclaim` pass. HawkScan not run: HAWK_API_KEY is not set here.

The editor side (the market's group in the outline, starting its sections in
its own copy) is the next slice.
