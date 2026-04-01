# AnA Reconciliation Map (Control-Plane Canonicalization)

## Blunt current-state truth
AnA already had serious capabilities across TypeScript and Python, but runtime behavior was fragmented: TypeScript inference produced citations heuristically, Python enterprise citation validation existed but was usually bypassed, and enterprise bridge security posture was permissive (wildcard CORS and demo-grade token handling).

## Canonical AnA paths

- **Canonical runtime path**: `POST /api/ana-cortex-ft/inference` (TypeScript control plane).
- **Canonical routing path**: `ai-gateway.route(taskType=regulatory_review)` via `server/routes/ana-cortex-ft.ts`.
- **Canonical evidence/citation path**: when `oss.ana.enterprise_citation_bridge` is enabled, TypeScript calls Python bridge `POST /api/v2/citations/validate`.
- **Canonical observability path**: Python enterprise bridge emits request/latency metrics and exposes `GET /api/v2/metrics`; TypeScript inference now includes evidence-validation status in response payload.
- **Canonical fallback path**: TypeScript AnA route returns explicit fallback mode with degraded confidence and `provider: none` for evidence validation.
- **Canonical lifecycle/governance path**: model lifecycle in `ana-cortex-ft` staged/canary/live/rollback endpoints + governance policy endpoint.

## Anti-fragmentation decisions

1. Keep TS route as product-facing control plane.
2. Promote Python citation service into the primary evidence discipline path through a feature-flagged bridge.
3. Avoid default-on rewiring: bridge stays behind `oss.ana.enterprise_citation_bridge` for controlled rollout.
4. Harden Python API trust boundaries so TypeScript→Python integration is not a weak link.

## Security hardening summary

- Removed wildcard CORS behavior in enterprise bridge and wired CORS from validated settings.
- Replaced permissive token decoding with HS256 signature validation + issuer/audience/expiry checks.
- Added optional request-signing enforcement (`LUMEN_API_BRIDGE_HMAC_SECRET`) for mutating routes.
- Added explicit role-claim requirement to avoid decorative auth.

## Known remaining gaps

- Python bridge now supports HS256 service JWT (recommended) plus a disabled-by-default static bearer fallback (`LUMEN_API_BRIDGE_ALLOW_STATIC_TOKEN=true`) for controlled migrations; asymmetric signing/rotation policy is still pending.
- Bridge-level metrics are in-memory and need centralized scrape/ship wiring in deployment manifests.
- TypeScript evidence bridging currently synthesizes source payloads from extracted citations; richer source provenance wiring remains TODO.
