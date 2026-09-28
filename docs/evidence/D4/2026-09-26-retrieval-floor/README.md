# D4 — a retrieval floor is applied where it is configured, and recorded only when it was

**Row:** D4 (Validation package), `docs/LAUNCH_DEFINITION_OF_DONE.md` — filed
beside `docs/evidence/D4/2026-09-24-atom-search/`, the retrieval defect this one
sat behind. **Date:** 2026-09-26. **Claim:**
`docs/work-orders/README.md` §0, session `…01W5zW66wy5szuFwRQYUKmkE`.
**Database:** PostgreSQL 16 + pgvector, provisioned from empty by
`scripts/db/provision-test-db.sh` (1236 base tables); the runtime connects as
`app_service` (not superuser, no BYPASSRLS) with `RLS_ENFORCE=on`.

**Decision:** the founder's, 2026-09-26 — precision first. Enforce the
configured floors as documented; an answer or draft with nothing above the floor
reports that honestly rather than citing weak evidence. The floors stay
configurable (`EVIDENCE_ASK_THRESHOLD`, `ANA_RETRIEVAL_THRESHOLD`, the per-request
`threshold` on evidence-ask).

## The finding

`enhancedEmbeddingService.searchHybrid(query, limit, semanticWeight, key, project)`
took its ranking weight third. Six callers passed their similarity *threshold*
there:

| Caller | Threshold passed as the weight | Recorded as a floor |
|---|---|---|
| `evidence-ask.ts` | 0.6 default, or the request's `threshold` | `ai_retrieval_runs.threshold`, `retrievalMeta.threshold` |
| `chat/send-message.ts` | `ANA_RETRIEVAL_THRESHOLD` (0.7) | `ai_retrieval_runs.threshold` |
| `c2c/ai-editing.ts` — edit section | 0.65 | `ai_retrieval_runs.threshold` |
| `c2c/ai-editing.ts` — template generation | 0.65 | — |
| `authoring.router.ts` — AI draft | 0.65 | — |
| `deep-research.ts` | 0.65 | — |

Nothing filtered on the threshold, so every top-k atom was admissible however
weakly it matched. It was cited as `[SRC-n]`, and in three routes it was written
to `ai_retrieval_chunks` under a run that recorded a floor it had not applied.
`evidence-ask` documents that it "refuses (no generation) when zero sources
clear the threshold"; it refused only when there were no results at all.

The RAG pipeline and the cortex search pass 0.7 as a weight on purpose (the
pipeline applies its own threshold to the combined score) and are unchanged in
behavior.

## The contract

`tests/db/retrieval-floor.dbtest.ts` mounts the real evidence-ask router inside
tenant A's request scope, with two atoms: one at cosine 0.9 to the query and one
at 0.3. Only the query embedding and the model call are stubbed.

| # | Case | Unfixed | Fixed |
|---|---|---|---|
| 1 | the floor is what excludes the weak atom (service) | — (new API) | pass |
| 2 | an atom below the default floor (0.6) is not admissible evidence | **fail** — the 0.3 atom is served | pass |
| 3 | a question nothing clears (floor 0.95) is refused; the model is not called | **fail** — served, answered | pass |
| 4 | every chunk recorded under a run clears the threshold that run records | **fail** — *"recorded under threshold 0.6: expected 0.30000001192092896 to be ≥ 0.6"* | pass |

| File | Shows |
|---|---|
| `red/unfixed.txt` | The old code: cases 2–4 fail, each on the weak atom. |
| `red/M1-floor-accepted-not-applied.txt` | The fix with the floor accepted but not applied: all four fail. |
| `green/fixed.txt` | The fix: 27 of 27 across this contract and the four tenant-key contracts that also call `searchHybrid` (atom-search-tenant-key, D4 atom-search, D3 cortex, D3 pipeline). |

## The fix

- `searchHybrid(query, options)` takes named options — `limit`,
  `organizationUuid`, `projectId`, `semanticWeight` (a ranking weight, default
  0.7), `minSemanticScore` (a floor on cosine similarity). A threshold can no
  longer land in the weight's place.
- With a floor, the service fetches three times the limit before filtering:
  `search_atoms_hybrid` ranks by the combined score, so an atom below the floor
  can outrank one above it, and filtering only the top `limit` would drop
  evidence that qualifies. A keyword-only match has no semantic score and does
  not clear a positive floor.
- The six callers pass their threshold as `minSemanticScore`, so the value each
  records in `ai_retrieval_runs.threshold` is the floor that ran.

## What this changes for a user

Fewer citations, and more "nothing cleared the threshold". Authoring's AI draft
reports `retrievalStatus: 'empty'` when nothing clears 0.65; evidence-ask answers
422 `NO_ADMISSIBLE_EVIDENCE`. Whether 0.6–0.7 is the right floor for
`text-embedding-3-small` on real submission content is not measured here — it
needs a calibration run on a tenant's corpus, and each floor is an environment
variable or constant precisely so it can be tuned.

## Not fixed here

AI editing and deep research still show a failed retrieval the same way as an
empty one (recorded in `docs/evidence/D3/2026-09-24-atom-search-tenant-key/`).
With floors enforced, "empty" becomes more common there, which makes that
distinction matter more.
