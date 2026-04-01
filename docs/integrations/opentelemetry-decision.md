# OpenTelemetry Integration Decision (Session A)

Date checked: 2026-03-31

## Upstream requirement snapshot
- OpenTelemetry JS supports Node auto-instrumentation with `@opentelemetry/sdk-node` and `@opentelemetry/auto-instrumentations-node`.
- Node 20+ is compatible with current JS SDK guidance.
- OTLP exporter over HTTP is standard for collector pipelines.

## Required runtime(s)
- Node.js OTel SDK inside application process.
- Optional external collector (OTLP endpoint).

## Required env vars
- `OTEL_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (optional)
- `OTEL_EXPORTER_OTLP_HEADERS` (optional)
- `OTEL_TRACES_SAMPLER` / `OTEL_TRACES_SAMPLER_ARG` (optional)

## Docker service needed?
- Optional (collector service) for local trace visualization/export.
- Not required when disabled or when exporting to remote collector.

## Local dev / Codespaces / production fit
- Local: default disabled; startup must continue without collector.
- Codespaces: exporter can target remote collector endpoint.
- Production: enabled with controlled sampling and resource attributes.

## Licensing / data handling risk
- OTel itself is OSS; risk is telemetry payload content/volume.
- Must avoid recording PHI/PII in span attributes and keep cardinality bounded.

## Recommended integration shape for this repo
- Add dedicated bootstrap module loaded early in `server/index.ts`.
- Prefer auto-instrumentation for Express/HTTP/PG and add focused manual spans in AI gateway/router.
- Keep Sentry intact; OTel augments request graphing and correlation.
