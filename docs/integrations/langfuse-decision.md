# Langfuse Integration Decision (Session A)

Date checked: 2026-03-31

## Upstream requirement snapshot
- Langfuse self-hosting supports Docker/VM/Kubernetes and production deployments typically include Web + Worker + Postgres + ClickHouse + Redis/Valkey.
- Optional licensed features exist; self-host operators retain infra/security responsibility.

## Required runtime(s)
- Langfuse service stack (cloud or self-host).
- Node.js server sends traces/observations via SDK or API wrapper.

## Required env vars
- `LANGFUSE_ENABLED`
- `LANGFUSE_BASE_URL`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_MASK_SENSITIVE` (optional, default true)

## Docker service needed?
- Not required if using Langfuse Cloud.
- Required if self-hosting locally (compose profile with Postgres/ClickHouse/Redis).

## Local dev / Codespaces / production fit
- Local: disabled by default; optional remote Langfuse endpoint.
- Codespaces: enable via secure env secrets + remote endpoint.
- Production: prefer managed/self-hosted hardened deployment with retention and access policies.

## Licensing / data handling risk
- Traces can include prompt/response data; must apply redaction and selective logging.
- Region/data-processing constraints apply for regulated environments; avoid secret capture.

## Recommended integration shape for this repo
- Add centralized wrapper under `server/services/observability/`.
- Instrument `aiProviderRouter` for request start/end, provider selection, fallback, and artifact linkage metadata.
- Keep route-level code thin by emitting from orchestration layer only.
