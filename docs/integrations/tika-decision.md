# Apache Tika Integration Decision

Checked upstream docs on 2026-03-31:
- https://tika.apache.org/
- https://hub.docker.com/r/apache/tika
- https://cwiki.apache.org/confluence/display/TIKA/TikaServer

## Required runtime(s)
- Java runtime inside Tika container (or JVM if running jar directly).
- Node runtime in this repo uses HTTP calls only.

## Docker service required?
- **Recommended for local/dev**: yes (stable and isolated).
- **Not strictly required**: remote/shared Tika endpoint also works.

## Required env vars
- `TIKA_ENABLED` (default `false`)
- `TIKA_BASE_URL` (e.g. `http://localhost:9998`)
- Optional: `TIKA_TIMEOUT_MS`, `TIKA_OCR_LANGUAGE`

## Expected local dev impact
- One extra optional service if enabled.
- Slightly higher latency per upload for parse+metadata extraction.
- Fallback parser remains active when unavailable.

## Expected production topology
- Tika as separate stateless service behind internal network.
- Horizontal scale by running multiple replicas behind a service endpoint.
- No direct DB access from Tika.

## Fit for this repo
- Use Tika as broad extraction normalizer in existing upload flows (`knowledge-base`, `evidence-management`, imported evidence) without creating new API domains.
- Persist normalized output in existing evidence/artifact contracts.
- Keep route-level fallback and non-fatal parser degradation.
