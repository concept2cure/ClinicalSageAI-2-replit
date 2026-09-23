# Stored module-enforcement mode under RLS_ENFORCE=on — live, 2026-09-22

Database c2c_oq_w3_20260922b (scratch). platform_settings row set to module_enforcement_mode='report' for this check, deleted afterwards.
Server: npx tsx server/index.ts, RLS_ENFORCE=on, runtime role app_service, PLATFORM_ADMIN_EMAILS=<the run identity> (server env only).
Probe per round: unauthenticated GET / (no tenant scope; the gate resolves the mode on it), then GET /api/admin/master/licensing/enforcement/mode as the platform admin. Two rounds, 32 s apart (cache TTL 30 s).

## With the fix
200 {"mode":"report","source":"stored","storedMode":"report","degraded":false}   (both rounds)
stored-mode read failures in the server log: 0

## Without the fix (enforcement-mode.ts stashed)
200 {"mode":"off","source":"deployment","storedMode":null,"degraded":true}   (both rounds)
stored-mode read failures in the server log: 2

```
{"level":50,"time":"2026-09-22T23:17:19.776Z","pid":1821,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":false,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
{"level":50,"time":"2026-09-22T23:17:54.362Z","pid":1821,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":true,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
```

## The same failure in the production-posture OQ execution (pp-server log), 5 occurrences
```
{"level":50,"time":"2026-09-22T22:35:07.731Z","pid":14771,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":false,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
{"level":50,"time":"2026-09-22T22:35:40.297Z","pid":14771,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":true,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
{"level":50,"time":"2026-09-22T22:36:41.316Z","pid":14771,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":true,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
{"level":50,"time":"2026-09-22T22:37:11.909Z","pid":14771,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":true,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
{"level":50,"time":"2026-09-22T22:37:41.913Z","pid":14771,"hostname":"vm","context":{"servingMode":"off","deploymentMode":"off","usedPreviousResolution":true,"err":"[tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope while RLS_ENFORCE=on"},"msg":"[enforcement-mode] could not read the stored enforcement mode — serving a fail-safe value"}
```
