# AnA RI Kernel Beta Launch Checklist

Date: 2026-03-25

## Core Runtime
- [x] Kernel router integrated in `ana-ri`, `chat`, and `cortex-unified`
- [x] Goal planner generation + replanning hooks
- [x] Persisted plan runs + step transitions + execute-next

## Safety & Governance
- [x] Tool arg sanitization + name allowlist + bounded chaining
- [x] Structured protocol events (`proposal`, `critique`, `evidence_request`, `decision`)
- [x] Kernel Decision Records (KDR) and policy outcomes persisted

## Observability
- [x] Kernel metrics endpoint (`/api/ana-ri/kernel/metrics`)
- [x] Plan event endpoint (`/api/ana-ri/plan/:planRunId/events`)
- [x] Beta readiness endpoint (`/api/ana-ri/kernel/readiness`)

## Launch Gates (Suggested)
- [ ] Add integration tests for `/api/ana-ri/plan*` endpoints
- [ ] Add alerting on kernel readiness status downgrade
- [ ] Add dashboard for KDR success rate + plan completion + quality score trend

