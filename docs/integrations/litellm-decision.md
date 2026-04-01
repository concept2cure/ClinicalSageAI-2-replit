# LiteLLM Integration Decision (Session A)

Date checked: 2026-03-31

## Upstream requirement snapshot
- LiteLLM supports a **proxy/gateway mode** exposing OpenAI-format endpoints (e.g., `/chat/completions`) and can run via CLI, pip, or Docker.  
- Proxy mode supports model mapping (`model_list`) and centralized auth/logging/rate limiting/cost controls.

## Required runtime(s)
- Runtime: Python service (or Docker image `berriai/litellm`) running as an internal gateway.
- App runtime: Node.js app continues to call OpenAI-compatible HTTP interface.

## Required env vars
- `LITELLM_ENABLED` (feature flag)
- `LITELLM_BASE_URL` (e.g., `http://litellm:4000`)
- `LITELLM_API_KEY` (if proxy auth enabled)
- `LITELLM_MODEL_MAP_JSON` (optional JSON mapping app model IDs → LiteLLM aliases)
- `LITELLM_TIMEOUT_MS` (optional)

## Docker service needed?
- **Optional but recommended** for local consistency (`litellm` sidecar/service).
- Non-Docker local may point at externally running LiteLLM process.

## Local dev / Codespaces / production fit
- Local: default **disabled**; direct provider mode remains baseline.
- Codespaces: works if exposed internal service URL is provided via env.
- Production: run as internal gateway behind network controls, with project/org tags in metadata.

## Licensing / data handling risk
- OSS stack is acceptable, but request payloads and metadata can include regulated content.
- Must redact sensitive fields before gateway logging and use minimum necessary metadata.

## Recommended integration shape for this repo
- Keep `server/services/aiProviderRouter.ts` as app-facing orchestrator.
- Add `server/services/ai/LiteLLMAdapter.ts` for provider execution delegation.
- Preserve task-aware routing/cost/fallback in Concept2Cure; only execution path switches.
- Keep direct provider fallback path available to prevent hard dependency during rollout.
