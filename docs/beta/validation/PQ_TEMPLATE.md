# Performance Qualification (PQ) — Concept2Cure.RI BETA load profile

**Template version:** 1.0 — 2026-05-01.

PQ proves the application sustains expected production load. For a
limited BETA, the load profile is intentionally small (3 design partners,
≤ 10 concurrent named users per tenant). This template is sized
accordingly. A full GA PQ exercises 10× this load and is a separate
engagement.

## Pre-conditions

- [ ] IQ + OQ have been executed and signed.
- [ ] Production-equivalent infrastructure is provisioned (BFF + shadow + DB + queue + cache).
- [ ] Synthetic load tooling configured (k6 / Artillery).

## Load profile

| Parameter                          | Target              |
|------------------------------------|---------------------|
| Concurrent users (per tenant)      | 10                  |
| Tenants exercised                  | 1                   |
| Run duration                       | 60 minutes          |
| Action mix                         | 40% read, 35% authoring write, 15% Q-Sub mutations, 10% AI calls |
| Ramp                               | 1-minute linear ramp from 0 to 10 users |

## Measured SLOs

| Metric                                                      | Target | Observed | P/F |
|-------------------------------------------------------------|--------|----------|-----|
| BFF read p99 latency                                        | ≤ 600 ms |        |     |
| BFF authoring write p99                                     | ≤ 1200 ms |       |     |
| `/api/q-sub` list p99                                        | ≤ 800 ms |        |     |
| `/api/predicate-intelligence/candidates` p99                | ≤ 1500 ms |       |     |
| Predicate-shadow `/predicate/health` 5xx rate              | ≤ 0.1% |        |     |
| BFF 5xx rate                                                | ≤ 0.1% |        |     |
| Database CPU (sustained)                                    | ≤ 70% |        |     |
| BFF memory (per replica)                                    | ≤ 1.5 Gi |       |     |
| Predicate-shadow memory (per pod)                           | ≤ 1.8 Gi |       |     |

## Failure-mode probes (conducted during the run)

| Probe                                                       | Expected                                  | Observed | P/F |
|-------------------------------------------------------------|-------------------------------------------|----------|-----|
| Kill the predicate-shadow container; observe BFF behavior   | `/ready` flips to 503 within 30 s; readiness probe pulls BFF out of LB |        |     |
| Restart predicate-shadow                                     | `/ready` recovers within 90 s             |          |     |
| Block egress to the FDA ESG (simulated)                      | Transmit endpoint returns 502; queue retains payload |     |     |
| Pause the BFF for 3 s (simulated GC pause)                   | No queue items lost                        |          |     |

## Sign-off

| Role            | Name | Signature | Date |
|-----------------|------|-----------|------|
| PQ executed by  |      |           |      |
| QA reviewer     |      |           |      |
| RA reviewer     |      |           |      |
