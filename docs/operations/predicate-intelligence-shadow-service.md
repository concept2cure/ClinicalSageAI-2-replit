# Predicate-Intelligence shadow service — operations runbook

**Status:** GA-track. **Owner:** Platform Engineering. **Last revised:** 2026-05-01.

The predicate-intelligence shadow service is a Python FastAPI process that
ranks 510(k) predicate candidates, runs SE-matrix diff analysis, and emits
RTF/CRL trigger signals. The Concept2Cure BFF (this repo) does not contain
its source — the BFF proxies to it via `SHADOW_SERVICE_URL`. This runbook
covers how to deploy and operate it for BETA and GA.

## Why a sidecar

The shadow service holds three things the BFF does not:

1. **The FDA predicate universe** — pre-indexed, embedding-augmented copy of
   the open-510(k) catalog (~500K rows). Loading it on every BFF restart is
   not viable.
2. **Deterministic risk-code logic** — the canonical `risk_code_map.py` is a
   stable ABI. The BFF mirrors only the labels. Changes to the map require a
   coordinated bump.
3. **CPU-bound scoring** — SE-matrix diff is O(predicates × dimensions). The
   shadow process pins one core; bursts shouldn't impact BFF latency.

The chosen topology is a **sidecar** (one shadow per BFF replica) for two
reasons:

- **Fault domain alignment.** A bad shadow restart should only affect the
  paired BFF, not a fleet.
- **Network locality.** All traffic stays on `localhost`, so no cross-AZ
  hops, no service-mesh cost, and no per-call mTLS overhead.

A pool topology (one shadow service behind a load balancer for all BFF
replicas) was considered and rejected — the predicate universe is loaded
into memory on each replica anyway, so consolidation saves nothing while
adding a network hop and a service-mesh dependency.

## Service-level objectives

| Metric                              | Objective                  | Source        |
|-------------------------------------|----------------------------|---------------|
| `/predicate/candidates` p99 latency | ≤ 1,200 ms                 | BFF logs      |
| `/predicate/se-matrix` p99 latency  | ≤ 2,500 ms                 | BFF logs      |
| `/predicate/health` 5xx rate        | ≤ 0.5% over 30 days        | Probe history |
| Cold-start universe load            | ≤ 60 s before /ready       | Container log |
| BFF→shadow connection error rate    | ≤ 0.1% per 5 min           | BFF metrics   |

The error budget is explicit. If `/predicate/health` is degraded for more
than 4 hours in a week, BETA design partners are notified by support.

## Configuration (BFF side)

The BFF reads two environment variables. Both are required for the shadow
to be considered "configured":

| Var                   | Purpose                                              |
|-----------------------|------------------------------------------------------|
| `SHADOW_SERVICE_URL`  | Base URL, e.g. `http://localhost:8001` (sidecar) or `http://predicate-intelligence:8001` (separate pod). |
| `REVIEW_ADMIN_TOKEN`  | Service-to-service shared secret. Issued at deploy. |

When either is missing:

- `GET /api/predicate-intelligence/*` returns `503` with detail
  `REVIEW_ADMIN_TOKEN is not set`.
- The new `/api/_ops/predicate-intelligence/ready` endpoint returns 503 and
  Kubernetes will not route traffic to the BFF until configuration lands.

## Health probes

Two probe surfaces exist. The BFF-internal `/api/predicate-intelligence/health`
endpoint is gated behind `authenticateToken` and is not usable as a probe
target. The unauthenticated probes are mounted under `/api/_ops/`:

| Path                                        | Use         | Behavior                                                               |
|---------------------------------------------|-------------|------------------------------------------------------------------------|
| `GET /api/_ops/predicate-intelligence/live` | Liveness    | 200 always (process up, route mounted).                                |
| `GET /api/_ops/predicate-intelligence/ready`| Readiness   | 200 only when `REVIEW_ADMIN_TOKEN` is set AND the shadow `/predicate/health` returns 2xx within 2 s; otherwise 503 with structured `reasons` array. |
| `GET /api/_ops/predicate-intelligence/info` | Diagnostics | Non-secret config snapshot for the ops dashboard.                      |

Recommended k8s probe spec:

```yaml
livenessProbe:
  httpGet:
    path: /api/_ops/predicate-intelligence/live
    port: 3000
  periodSeconds: 30
  timeoutSeconds: 2
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /api/_ops/predicate-intelligence/ready
    port: 3000
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 2
```

For the shadow container itself, the upstream Python service must expose
`GET /predicate/health` on its bound port (default 8001), returning 200
when the predicate universe is loaded and 503 when degraded.

## Sidecar deployment — Kubernetes

A reference manifest lives at `infra/k8s/bff-with-predicate-shadow.yaml`. It
runs both containers in one pod sharing localhost, so the BFF reaches the
shadow on `http://localhost:8001`. See that file for the exact spec.

Notes:

- **Resources.** The shadow's predicate universe is ~700 MB resident; reserve
  `1Gi` requests / `2Gi` limits.
- **Restart policy.** `restartPolicy: Always` for the pod. The shadow's
  `livenessProbe` should be a slow check — a flapping shadow during cold
  start should not pull the entire pod down.
- **Image source.** The shadow image is built from a separate repository
  (`concept2cure/predicate-shadow-service`). The deploy pipeline must pin
  by digest, not tag.

## Sidecar deployment — Docker Compose (development)

```yaml
services:
  predicate-shadow:
    image: concept2cure/predicate-shadow-service:dev
    ports: ["8001:8001"]
    environment:
      ADMIN_TOKEN: dev-token
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8001/predicate/health"]
      interval: 10s
      timeout: 2s
      retries: 5
  bff:
    build: .
    depends_on:
      predicate-shadow:
        condition: service_healthy
    environment:
      SHADOW_SERVICE_URL: http://predicate-shadow:8001
      REVIEW_ADMIN_TOKEN: dev-token
```

## Failure modes

| Symptom                                      | Likely cause                              | Action                                                                           |
|----------------------------------------------|-------------------------------------------|----------------------------------------------------------------------------------|
| `/ready` 503, `reasons: ['REVIEW_ADMIN_TOKEN missing']` | Secret not mounted                        | Check secret manager binding; rolling restart after fix.                         |
| `/ready` 503, `shadow probe timed out`       | Shadow stuck in cold-start universe load  | Wait up to 60 s; if persistent, check shadow logs for index corruption.          |
| `/ready` flaps                               | Shadow OOM under load                     | Inspect shadow memory; raise pod limits or shed traffic via the BFF rate limiter. |
| `/api/predicate-intelligence/*` returns 502  | Shadow restarted mid-call                 | Idempotent endpoints retry from the UI; non-idempotent ones surface to the user. |
| Predicate universe stale                     | Shadow image not rebuilt with new catalog | Trigger `predicate-shadow-service` release; rolling-restart BFF pods.            |

## On-call

Pages from the predicate shadow are routed to the **mdx-platform** rotation.
Run-of-the-day signals: `/ready` flap rate, p99 latency on `/candidates`,
shadow container OOM kills.

## BETA-specific notes

For the limited BETA, only one shadow replica per BFF is deployed (no HA
behind a service mesh). If the shadow is down, predicate-intelligence
endpoints return 503 with explicit `Predicate Intelligence not configured or
stale`; the UI shows a "Predicate ranking unavailable" inline notice and
does not fall back to fixtures (the user explicitly chose against synthetic
fallbacks for BETA).

## GA-graduation checklist

- [ ] Shadow service has its own deploy pipeline, with image-digest pinning.
- [ ] Predicate universe rebuild cadence documented (monthly).
- [ ] Shadow exposes `/metrics` for Prometheus scrape.
- [ ] BFF emits `predicate_shadow_request_duration_seconds` histogram.
- [ ] Shadow disaster-recovery: index can be rebuilt from the FDA open
      510(k) catalog within 24 h.
- [ ] Multi-region failover playbook exists for the predicate universe
      object store.
