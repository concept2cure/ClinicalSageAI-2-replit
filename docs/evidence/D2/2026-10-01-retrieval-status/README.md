# D2 — a failed Data Room retrieval is reported as failed, not as "no sources"

**Row:** D2 (Launch catalog), `docs/LAUNCH_DEFINITION_OF_DONE.md`. **Date:** 2026-10-01.
**Claim:** `docs/work-orders/README.md` §0, session `…01W5zW66wy5szuFwRQYUKmkE`.
Recorded open in `../../D3/2026-09-24-atom-search-tenant-key/` ("Found on the
way", item 2) and `../../D4/2026-09-26-retrieval-floor/`.

## The finding

Three AI generation paths ground their output in the tenant's Data Room:

| Route | What a retrieval failure did |
|---|---|
| `POST /api/concept2cure/ai/edit-section` | caught, logged, answered `provenance.sourcesRetrieved: 0` |
| `POST /api/concept2cure/ai/templates/:id/generate` | caught, logged, answered `metrics.sourcesRetrieved: 0` |
| `POST /api/deep-research/document/generate` | caught once for the whole loop — **every remaining section skipped retrieval** — logged, answered `sectionsWithSources: 0` |

In each, an outage produced exactly the response an empty Data Room produces. A
reviewer reading an AI-edited regulatory section could not tell "the corpus has
nothing relevant" from "we never looked". With the similarity floors enforced
since `0f743698a`, "no sources" became more common, so the distinction mattered
more. Authoring's AI draft already reported the three states inline
(`authoring.router.ts`, `retrievalStatus`).

## The fix

- `server/services/data-room-retrieval.ts` — `retrieveDataRoomEvidence(pool,
  query, { limit, minSemanticScore, projectId? })` runs the session-keyed search
  and never throws: it returns `{ hits, status: 'ok' | 'empty' | 'failed',
  cause }`. `cause` is for the server log only. `RETRIEVAL_STATUS_MESSAGE` is the
  one sentence each status gets, so the routes say it the same way.
- AI section editing and template generation return `retrievalStatus` (and
  `not_requested` when the request names no project, so nothing was attempted)
  plus `retrievalMessage`, and log the cause. The audit row records the status.
- Deep research retrieves per section, each with its own `retrievalStatus`; one
  failure no longer ends retrieval for the rest. The document carries
  `retrievalStatus` (`failed` if any section failed, else `ok` if any found
  evidence, else `empty`), `retrievalMessage`, and
  `metrics.sectionsRetrievalFailed`.
- No response carries the error text (`ci:server-error-leaks`, 09-30 policy):
  the tests assert the outage message never reaches the body.

## Proof

| File | Shows |
|---|---|
| `red/ai-editing-unfixed.txt` | The old router: 8 of 8 fail — no outcome is reported for either route, so a failure and an empty corpus are the same response. |
| `red/deep-research-unfixed.txt` | The old route: 4 of 4 fail, including *one failing section does not end retrieval for the rest*. |
| `red/M1-failure-reported-as-empty.txt` | The helper reporting a failure as `empty` (the old conflation): exactly the two `failed` cases fail, the other six pass. |
| `green/ai-editing.txt` | 8 of 8: `failed` (without the error text), `empty`, `ok`, `not_requested`, for both routes. |
| `green/deep-research.txt` | 4 of 4: all-failed, one-section-failed, empty, ok. |

The helper is real in every case; only the embedding search, the model, the
database and the auth/licence middleware are stubbed. Typecheck 0 errors;
821 test files / 8,228 tests across the route, service, middleware and
schema-contract suites pass; no lint, security-pattern or error-leak change.

## Handed on, not edited

Authoring's AI draft (`authoring.router.ts`, the D2 AnA-authoring lane's file,
edited today) keeps its own inline copy of the three states. Two things for that
lane: move it onto `retrieveDataRoomEvidence` so there is one; and it sends
`retrievalError` — the caught error's text, up to 300 characters — in the
response body, which the 09-30 `ci:server-error-leaks` policy forbids and the
guard does not detect in that shape.
