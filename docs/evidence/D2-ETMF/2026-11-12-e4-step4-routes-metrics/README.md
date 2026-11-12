# eTMF convergence E4, step 4: the second store's routes and metrics go

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes `server/routes/etmf.routes.ts`,
which is now the only trial master file router. Build plan: `docs/design/ETMF_CONVERGENCE_E4_PLAN_2026-11-10.md` §6
step 4. Founder decisions P-74 and P-124.

## What already exists, and what is left

After steps 1 to 3, nothing in the product called the second store's eight routes:

- the report pack reads the deployed store (`d7ebbb034a`);
- so do AnA's reads (`76185b6434`);
- AnA's four writes retired and its filing re-pointed (`1c08a054a9`);
- no client file ever called them (plan §1.1).

They shared `/api/etmf` with the deployed store's router through a gateway router. Their metrics counted creations in
a store no deploy creates.

## What changed

- **Deleted:**
  - `server/routes/etmf.ts`, the eight routes over `tmf_files` and `tmf_artifacts`;
  - `server/services/etmf-metrics.ts`, whose counters had no consumer outside its own file;
  - `server/routes/__tests__/etmf-error-containment.test.ts`, which was that router's own suite.
- **`server/bootstrap/register-inline-routes.ts`:** `/api/etmf` mounts the one router, with one auth pass. The stale
  comment about a former second mount is removed, and `express` is a type-only import.
- **`server/startup/inline-endpoints.ts`:** the eTMF block of `/api/metrics` is removed.
- **`research-security-metrics.ts` and `effort-metrics.ts`:** their headers point to `lifecycle-metrics.ts` for the
  metrics convention.
- **Two baselines shrink by hand**, one entry each and never regenerated:
  - `scripts/ci/tenant-resolvers-baseline.json` (count 173 → 172);
  - `docs/reports/requestdb-coverage-baseline.json` (its two lists).
- **`server/__tests__/routes/smoke.test.ts`:** pinned the gateway's text; it now pins the one mount.
- **`etmf-one-store.routes.test.ts`:** mounts `/api/etmf` exactly as the bootstrap's eTMF block imports it. The second
  store's eight paths are not served, and the deployed store's still answer.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Against the mount as it stood: 8 of 10 fail. The deleted router's own `GET /files/:id/completeness` already answered 404 for a missing file, so that case passes either way |
| `02-green.txt` | 10 pass; every eTMF route and service suite (172); the bootstrap's and metrics endpoint's suites, with the one smoke case that times out on HEAD too named; the typecheck (0 errors); the gates, the strict requestDb audit and the lint ratchet |

## Next (plan §6)

Step 5: the second store's service, verdict, schema and migration go, and `etmf-logic.ts` keeps only the classifier.
