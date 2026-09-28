# D6 — a grantable API scope is an enforced one, proven by calling it

**Row:** D6 Security posture. **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.

## 1. What was wrong

`server/routes/__tests__/public-api-documents.test.ts` carried the public API's
only check that "every grantable scope is required by a real endpoint". It read
the endpoint list **from `/docs`** and compared it with the scope list **from
`/docs`**: the API's description of itself, checked against the API's
description of itself. Two defects it could not see:

- a route that stopped requiring its scope — `/docs` still lists the scope;
- a path `/docs` lists that no route serves — `/docs` still lists it.

`documents:read` was once exactly the first kind of claim (grantable and
advertised while nothing required it), which is why the test existed. It would
not have caught its own case recurring on any other endpoint.

Found by the 2026-09-24 re-verification of this session's earlier work.

## 2. What changed

The test now **calls** every endpoint `/docs` lists (`:id` filled with a UUID):

1. `/docs`' advertised scopes equal `API_KEY_SCOPES` (shared/schema/api-keys.ts),
   and each is listed against at least one endpoint;
2. a key holding **every scope but the endpoint's own** gets 403, and the 403
   names that scope (`required` from the router's guard or `missing` from the
   fleet-wide one) — so a quota or tenant-state 403 cannot pass for it;
3. a key holding **only** that scope is not refused, and reaches a route —
   an unmatched path is Express's HTML 404, a route's own 404 is JSON with a code.

No route code changed; this is a test that now fails on the case it exists for.

## 3. Proof — the mutants, against the old test and the new

| Mutant | Old test | New test |
|---|---|---|
| 1. `/csr/search` loses `requireScope('csr:read')` | `red/mutant-1-old-test.txt` — **17 of 17 pass** | `red/mutant-1-new-test.txt` — fails: *GET /api/v1/csr/search served a key without csr:read: expected 500 to be 403* |
| 2. `/trial-design/suggest` served at `/trial-design/suggestions` (listed path unserved) | `red/mutant-2-old-test.txt` — **17 of 17 pass** | `red/mutant-2-new-test.txt` — fails on both: 404 not 403, and *listed but no route serves it* |

`green/public-api-documents.txt`: the real router, 20 of 20 (19 at §3, plus §5's two cases, less the one `processingStatus=NOPE` input case it replaces).

## 4. Not done here

- `/health` reports `endpoints: 7` as a literal; the test pins it to the length
  of `/docs`' list, which is the claim a caller reads. It is not derived.

## 5. Same class, same day — a filter that could not select anything

`/api/v1/documents` reported `processingStatus` on every document and offered it
as a filter over six values. The column it read, `vault.documents.processing_status`,
is never advanced off its `PENDING` default: ingest extracts and indexes inside the
upload request, records the outcome in the catalog tier, and writes `PENDING`
here on every write. So every document read `PENDING` — waiting for work that had
already run or already failed — and `?processingStatus=INDEXED` returned no rows.
`routes/mdx-vault.ts` had reached the same conclusion on 2026-09-19 and stopped
reporting it; this read model, written two days earlier, never caught up.

The test that "proved" the field was the fixture: it seeded `INDEXED` and
`FAILED` directly and asserted them back.

Now the field is not in the read model, and the parameter is **refused by name**
(`400 UNSUPPORTED_PARAMETER`). Ignoring it would be worse than the old
behaviour: a client asking for `INDEXED` would get the whole cabinet. No
consumer existed to break — the key-only path is not reachable until F-32 — and
nothing else imports the read model.

| | |
|---|---|
| `red/processing-status.txt` | Old code, new tests: 3 fail — `?processingStatus=INDEXED` answered 200; `/docs` advertises the filter; the summary carries the field. |
| `green/processing-status.txt` | 35 of 35 (route + PGlite read model). |

