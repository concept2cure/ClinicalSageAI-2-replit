# P1-17 — the diagnostic endpoints told every user, and anonymous callers, more than they should (IAM-18 items 2 and 3, Low)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-18 (grouped), items (2) the public AI-gateway
health and (3) `/api/metrics` readable by any tenant's user. **Plan item:** P1-17.

## What was wrong

`requireMetricsAuth` (`server/startup/inline-endpoints.ts`) admitted the `METRICS_TOKEN` bearer **or any platform
session**, and guarded `/api/metrics`, `/api/health/full` and `/api/health/jobs`: every tenant's every user could read
the process, pool and job figures. `/api/ai-gateway/health`, on the auth boundary's public allow-list, told an
unauthenticated caller which LLM providers are configured, their health, latency, request counts and error rates, and on
an exception echoed the exception's message (the same leak that had been closed for `/api/health/full`).

## What is true now

- `requireMetricsAuth` admits the scrape token, or a **platform administrator**'s session (the platform auth middleware,
  then `requirePlatformAdmin`, both real). A tenant user's session is 403; an anonymous caller 401. No client calls the
  three guarded endpoints, so nothing first-party changes.
- `/api/ai-gateway/health` (still public, still allow-listed) answers `{ status }` and nothing else; an exception is
  logged and answered `{ status: 'error' }`. The provider detail moved to `/api/ai-gateway/health/detail`, behind the
  same guard and, being outside the allow-list, the default-deny auth boundary. One helper composes both answers.
- `ci:server-error-leaks` baseline shrunk from 146 to 145 sites (the echo this fix removed), so the gate now holds the
  lower figure.

| | File | Result |
|---|---|---|
| red | `red/diagnostic-exposure-before-fix.txt` | HEAD `fdc1e53e`, handlers unchanged: a tenant user reads the metrics (200); an anonymous caller and a tenant user receive the provider list; the exception text is echoed. 4 failed / 4 passed |
| green | `green/diagnostic-exposure-after-fix.txt` | 38 / 38 across the new suite, the `/readyz` and AnA-readiness suites and the platform-admin provider-carry suite |
| green | `green/gates.txt` | `check:security-patterns` 0 violations; `ci:server-error-leaks` green, one site fixed since the baseline |

Test: `server/startup/__tests__/diagnostic-endpoints-exposure.test.ts` (supertest over the real mounts; the session
double reads a fake bearer so the test controls who asks).

## Not done here

- **Whether production sets `METRICS_TOKEN`** and what scrapes `/api/metrics` (Terraform sets neither a Prometheus
  target nor the token; INF-06): the founder's, with the P1-10 detection work.
- The other IAM-18 items ((1) the leak gate, now green and ratcheting; (4)–(10)) are separate fixes; (1) is P1-27's first
  part and was closed on trunk by `3625a205` (the dead-audit-catch guard matches code, not comments).
