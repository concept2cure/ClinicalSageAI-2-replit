# GROBID Integration Decision

Checked upstream docs on 2026-03-31:
- https://grobid.readthedocs.io/
- https://grobid.readthedocs.io/en/latest/Grobid-service/
- https://github.com/kermitt2/grobid

## Required runtime(s)
- Java runtime (service ships as JVM app, commonly Dockerized).
- Node runtime uses HTTP multipart calls to `/api/processFulltextDocument`.

## Docker service required?
- **Recommended** for local/dev due to Java dependencies.
- Can target remote service in production.

## Required env vars
- `GROBID_ENABLED` (default `false`)
- `GROBID_BASE_URL` (e.g. `http://localhost:8070`)

## Expected local dev impact
- Optional extra service memory footprint.
- Only triggered for scholarly/scientific PDFs via classifier heuristic.

## Expected production topology
- Dedicated internal GROBID service pool.
- Access controlled to ingestion workers/API backend.
- No direct writes to governed tables; output normalized by app layer.

## Fit for this repo
- Apply GROBID selectively in literature/evidence ingestion paths when scientific structure is expected.
- Normalize title/authors/abstract/sections/references into existing evidence/literature models.
- Preserve fallback to generic extraction when unavailable.
