# P0-13a — production refuses `AUTH_BOUNDARY_MODE=warn` (IAM-16)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-16. **Plan item:** P0-13 (the boot half;
the deploy-preflight half that rejects every `*_ACCEPT_*` flag lives in `.github/workflows/deploy-aws.yml`, inside
the W2 lane's window, and is handed on).

## What was wrong

`resolveAuthBoundaryMode` (`server/middleware/authBoundary.ts`) honoured an explicit `AUTH_BOUNDARY_MODE=warn` in
every environment, production included, and nothing at boot refused it. `warn` logs an unauthenticated request and
lets it through; it exists for the staging soak. One environment variable therefore turned the default-deny `/api`
boundary off with an info log. The older unconditional gate in `register-platform-routes.ts` limited the blast radius
to the routes mounted before it (`/api/users`, `/api/admin` security, SCIM admin, `/api/admin/audit`), which is why
the audit rated it Low–Medium rather than High.

## What is true now

- `validateEnvironment()` (`server/startup/env.ts`, the first thing `server/index.ts` runs) exits non-zero in
  production when `AUTH_BOUNDARY_MODE` is `warn`, beside the existing refusal of the dev/mock route flags.
- `resolveAuthBoundaryMode` resolves an explicit `warn` to `enforce` in production and logs that once per process,
  for any entry point that mounts the boundary without passing through `validateEnvironment`. Outside production
  the override still works both ways.

| | File | Result |
|---|---|---|
| red | `red/before-fix.txt` | on HEAD `0b8d6e9a`: `validateEnvironment` boots with `warn` in production (no exit); `resolveAuthBoundaryMode` returns `warn` for production |
| green | `green/after-fix.txt` | 19 of 19: the two new cases, the 17 existing boundary cases (one of which, "honours an explicit override both ways", asserted production + `warn` → `warn` and now asserts the override works outside production and `enforce` works anywhere) |

Tests: `server/startup/__tests__/env-auth-boundary-posture.test.ts` (new), `server/middleware/__tests__/authBoundary.test.ts`
(extended). Gates: `ci:no-dev-auth-in-prod` OK, `check:security-patterns` 0 violations; `tsc` reports nothing for the
two files.
