# UI handoff — Citation verification (for Claude Design)

A real citation-verification capability is now live on the backend. This hands
off the **client-facing surface** for the design system to build. The backend
verifies that cited references actually exist against **PubMed (NCBI)** and
**CrossRef** — replacing the prior client-side mock that asserted existence with
`Math.random()`.

## What exists (backend, shipped)

- Service: `server/services/citation-verification-service.ts`
- Route: `server/routes/citations.ts`, mounted auth-gated at **`/api/citations`**
  by `server/bootstrap/register-clinical-intel-routes.ts`.
- Resolution order per citation: PMID → CrossRef DOI → title match (PubMed then
  CrossRef, with a 0.8 similarity threshold).

## API contract

`POST /api/citations/verify` (requires auth; send the bearer token + `x-organization-id`
the same way other `/api/*` calls do via `apiRequest`).

Request body:
```json
{
  "citations": [
    { "id": "ref-1", "doi": "10.1038/171737a0" },
    { "id": "ref-2", "pmid": "14907713" },
    { "id": "ref-3", "title": "Molecular structure of nucleic acids ..." },
    { "id": "ref-4", "raw": "Watson & Crick, Nature 1953. PMID: 14907713" }
  ]
}
```
- Each citation needs at least one of: `raw`, `title`, `doi`, `pmid` (also accepts
  `authors`, `journal`, `year`). Max 50 citations per request. `id` is echoed back
  so you can correlate results to your reference list.

Response (`200`):
```json
{
  "data": {
    "results": [
      {
        "id": "ref-1",
        "status": "verified",
        "exists": true,
        "confidence": 1,
        "retracted": false,
        "discrepancies": ["Cited year 1999 does not match the record's year 1953."],
        "match": {
          "source": "crossref",
          "title": "...", "authors": "...", "journal": "Nature",
          "year": 1953, "doi": "10.1038/171737a0",
          "url": "https://doi.org/10.1038/171737a0",
          "publicationTypes": ["Journal Article"],
          "retracted": false
        },
        "detail": "Verified by DOI ... in CrossRef. Cited year 1999 does not match the record's year 1953.",
        "checkedAt": "2026-05-25T..."
      }
    ],
    "summary": { "total": 1, "verified": 1, "notFound": 0, "unverifiable": 0, "error": 0 }
  }
}
```

### `status` / `exists` — render each honestly (do not collapse to a boolean)

| status | exists | Meaning | Suggested UI treatment |
|---|---|---|---|
| `verified` | `true` | Found in PubMed/CrossRef | Confirmed state; link `match.url`; show matched title/journal/year |
| `not_found` | `false` | Searched, no confident match | Warning state; if `match` present, offer it as "did you mean?" with `confidence` |
| `unverifiable` | `null` | No DOI/PMID/sufficient title to check | Neutral/"can't verify" state — **not** an error, **not** a pass |
| `error` | `null` | Upstream API failed | Transient error state; offer retry; never show as verified or failed |

`400` is returned for malformed bodies; `500` only on an unexpected server fault.

### `retracted` and `discrepancies` — the high-value reviewer signals

A reference can *exist* and still be a problem. Surface these even on `verified` results:

- **`retracted: true`** — the matched publication is marked **RETRACTED** in PubMed.
  Citing it is a scientific-integrity defect. Render as a **critical** state
  ("Retracted — do not cite") regardless of `status`; this should be the most
  prominent signal in the list and should feed any "blockers" count.
- **`discrepancies: string[]`** — the reference exists but the *citation is
  inaccurate*: e.g. a wrong year, or a DOI/PMID that resolves to a **different
  article** than the cited title. Render as a **review/amber** state with the
  discrepancy text shown inline so the writer can correct it. A verified citation
  with discrepancies is not "all clear".
- `match.publicationTypes` can be shown as metadata (e.g. "Review", "Clinical Trial").

Recommended visual precedence per row: **retracted (critical) > not_found (warning) >
discrepancies (review) > error (transient) > unverifiable (neutral) > clean verified (confirmed)**.

## What to build (UI)

1. A citation/reference panel in the CER / regulatory-writing surface that calls
   `POST /api/citations/verify` (via React Query mutation, using `apiRequest`) for
   the document's reference list and renders per-citation status with the four
   states above.
2. Use the design system's calm states — confirmed / warning / neutral / error —
   per the table; never invent a number. Show `match.url` as the source link and
   surface `confidence` only for non-exact (title) matches.
3. Empty/loading/error states per the motion + microcopy rules.

## Notes / constraints

- External calls require outbound network access to `eutils.ncbi.nlm.nih.gov`
  and `api.crossref.org` (production already reaches NCBI for literature search).
- Optional env: `PUBMED_API_KEY` (higher NCBI rate limit) and
  `CROSSREF_CONTACT_EMAIL` (CrossRef "polite pool").
- Backend caps each request at 50 citations and verifies with bounded
  concurrency; for large reference lists, page the requests from the UI.
