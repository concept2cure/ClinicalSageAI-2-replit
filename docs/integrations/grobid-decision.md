# GROBID Integration Decision

## Upstream references checked
- GROBID service API and runtime docs: https://grobid.readthedocs.io/en/latest/Grobid-service/
- GROBID deployment/runtime notes: https://grobid.readthedocs.io/en/latest/Install-Grobid/
- Official image/source: https://github.com/kermitt2/grobid

## Required runtime(s)
- Java service runtime (GROBID service process).
- HTTP API exposed (default port 8070 in container).

## Docker required?
- **Local dev:** recommended for reproducible model/runtime behavior.
- **Production:** can be containerized service or managed deployment.

## Required env vars
- `GROBID_ENABLED`
- `GROBID_BASE_URL`
- `GROBID_TIMEOUT_MS` (optional)

## Local dev impact
- Only used for selected scholarly/scientific PDFs.
- Fallback extraction remains available if disabled or unreachable.

## Expected production topology
- Internal GROBID service dedicated to scientific PDF parsing.
- Ingestion orchestrator routes eligible docs to GROBID and normalizes outputs.

## Fit for this repo
- Reuse existing GROBID client; expand from citation-only usage to literature ingestion path.
- Persist references/structure into governed evidence/literature objects.
