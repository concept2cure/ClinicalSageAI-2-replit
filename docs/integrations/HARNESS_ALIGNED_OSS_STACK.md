# HARNESS-ALIGNED OSS STACK

Date: 2026-04-01  
Scope: LiteLLM, Langfuse, OPA, OpenTelemetry, Tika, GROBID, OpenSearch, Temporal bridge

## Purpose

These integrations are support systems for the governed customer-shaped harness, not alternate product architectures.

## Feature flags and env gates

| Integration | Primary control surface | Behavior when disabled |
|---|---|---|
| LiteLLM | `LiteLLMAdapter.isEnabled()` (`server/services/ai/LiteLLMAdapter.ts`) | AI provider router uses direct provider calls |
| Langfuse | `LangfuseService.isEnabled()` (`server/services/observability/langfuseService.ts`) | Events no-op |
| OPA | `OPA_ENABLED`, `OPA_MODE` (`server/services/policy/opaClient.ts`) and `OSS_POLICY_OPA_DECISIONS` (`server/config/ossStackFeatureFlags.ts`) | Decisions allow-by-default with disabled reason |
| OpenTelemetry | `OTEL_ENABLED` gate in `initializeOpenTelemetry()` (`server/services/telemetry/opentelemetry.ts`) | No tracing exporter initialized |
| Tika | `isTikaEnabled()` (`server/services/ingestion/tikaClient.ts`) | Extraction path returns `null`; pipeline continues |
| GROBID | `GROBID_ENABLED` + base URL (`server/services/literature/grobidClient.ts`) | Scholarly parsing path skipped |
| OpenSearch | `isOpenSearchEnabled()` (`server/services/search/opensearchClient.ts`) | Index/query adapters no-op or fallback |
| Temporal bridge | `isTemporalEnabled()` (`server/services/workflow/temporalBridge.ts`) | Local fallback workflow path |

## Canonical OSS feature-flag keys

Registry file: `server/config/ossStackFeatureFlags.ts`

- `oss.ingestion.tika_enabled` -> `OSS_INGESTION_TIKA_ENABLED`
- `oss.ingestion.grobid_enabled` -> `OSS_INGESTION_GROBID_ENABLED`
- `oss.retrieval.opensearch_enabled` -> `OSS_RETRIEVAL_OPENSEARCH_ENABLED`
- `oss.policy.opa_decisions` -> `OSS_POLICY_OPA_DECISIONS`
- `oss.obs.langfuse_enabled` -> `OSS_OBS_LANGFUSE_ENABLED`
- `oss.workflow.temporal_enabled` -> `OSS_WORKFLOW_TEMPORAL_ENABLED`

## Harness alignment requirements

1. None of the above may create a second document authority.
2. Governed contract validation and governed artifact consequence remain canonical.
3. Observability/policy can enrich traceability and enforcement but cannot bypass the harness.
4. Ingestion/search/workflow adapters must feed governed document loops.

## Current alignment status

- AI routing integrations are subordinate to route/service level governed contract enforcement.
- Telemetry and policy are env-gated and non-fatal by design.
- Session-B integrations are feature-gated and degrade gracefully.
- Gaps remain where some artifact-producing routes outside primary concept2cure loops are not yet wired to `resolveGovernedContext` (tracked in entrypoint truth table).
