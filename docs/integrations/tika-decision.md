# Apache Tika Integration Decision

## Upstream references checked
- Tika Server endpoint/reference docs: https://cwiki.apache.org/confluence/display/TIKA/TikaServer
- Tika 2.x API docs: https://tika.apache.org/2.9.2/api/
- Docker image (runtime packaging): https://hub.docker.com/r/apache/tika

## Required runtime(s)
- Java runtime packaged in `apache/tika` image.
- HTTP service expected for Node-side integration.

## Docker required?
- **Local dev:** recommended (simple, isolated).
- **Production:** optional; may run as standalone service/pod.

## Required env vars
- `TIKA_ENABLED` (feature gate)
- `TIKA_BASE_URL` (default `http://localhost:9998`)
- `TIKA_TIMEOUT_MS` (optional request timeout)

## Local dev impact
- Optional service start only when ingestion-spine profile is enabled.
- Existing parsing remains fallback path when Tika disabled/unavailable.

## Expected production topology
- Dedicated Tika service behind internal network.
- App calls Tika for broad extraction normalization before domain-specific parsing.

## Fit for this repo
- Promote existing Tika client + intake pipeline path to be the canonical broad extractor.
- Keep Docling/Unstructured fallback and preserve current persistence contracts.
