# OPA Integration Decision (Session A)

Date checked: 2026-03-31

## Upstream requirement snapshot
- OPA is designed as an external PDP with common deployment patterns: sidecar/agent or centralized service.
- App integrations typically call REST API (`POST /v1/data/<path>`) with an `input` object and read `result`.
- Sidecar pattern is recommended for low-latency and network fault tolerance in app workloads.

## Required runtime(s)
- OPA runtime (binary/container) with policy bundle loading.
- Node app policy client to evaluate decisions.

## Required env vars
- `OPA_ENABLED`
- `OPA_BASE_URL`
- `OPA_POLICY_PATH` (e.g., `concept2cure/allow`)
- `OPA_MODE` (`observe` or `enforce`)
- `OPA_TIMEOUT_MS`

## Docker service needed?
- Optional for local; recommended for reproducible policy testing.
- Non-Docker environments can target remote OPA endpoint.

## Local dev / Codespaces / production fit
- Local: observe mode default, enforce off by default.
- Codespaces: either local sidecar or remote PDP URL.
- Production: enforce selected critical actions with fail-closed semantics.

## Licensing / data handling risk
- OPA OSS license is permissive; risk is policy drift and incomplete input context.
- Policy decision logs must avoid sensitive payload leakage.

## Recommended integration shape for this repo
- Add centralized client + middleware under `server/services/policy/`.
- Start with compute execution + external tool gate endpoints + Part 11 signature/evidence endpoints in observe mode.
- Promote to enforce mode by feature flag once policy outcomes are validated.
