# Security Scrub (CodeRabbit-style + AppSec) — 2026-03-29

Scope sampled: auth/session paths, tenant isolation middleware and selected high-risk routes, browser token handling, CORS/SSE headers, and upload handlers.

## P0

### 1) Auth bypass + hardcoded fallback secret + magic admin tokens (FastAPI dependency)
- **Files:** `backend/dependencies.py`
- **Why this is severe:**
  - Uses a fallback JWT secret (`trialsage_development_secret`) when env is missing.
  - Returns admin users when auth is missing in development.
  - Accepts non-Bearer values (`TS_1`, `TS_DEV`) as admin.
  - Accepts invalid JWTs and upgrades `dev_token` / `test_token` to admin.
- **Plain-English exploit risk:** An attacker who can hit any service path wired to this dependency can authenticate as admin by sending known test tokens (or by exploiting predictable secret usage), then read/modify tenant data.
- **Smallest safe remediation:**
  1. Remove all development token branches and non-Bearer acceptance.
  2. Fail startup if `JWT_SECRET` is missing (all envs except isolated test harnesses).
  3. Require strong secret length + key rotation plan.
  4. Add regression tests proving `TS_1`/`dev_token` are rejected.

## P1

### 2) Tenant impersonation via client-controlled organization header + insecure default tenant fallback
- **Files:** `server/routes/device-data-center.js`, `server/routes/sourceLinks.ts`
- **Why this is high:**
  - `device-data-center` trusts `x-organization-id` and defaults to org `7` if absent.
  - `sourceLinks` explicitly enforces tenant isolation only by `x-organization-id` header, with no JWT-derived org binding.
- **Plain-English exploit risk:** A logged-out or low-privileged caller can set `x-organization-id` to another tenant and access/modify that tenant's records; missing header may silently route to tenant 7.
- **Smallest safe remediation:**
  1. Derive org/tenant only from verified JWT claims (`req.user.organizationId`).
  2. Remove hardcoded tenant fallback (`|| 7`).
  3. Reject requests where header org differs from JWT org and log security event.
  4. Add route-level auth middleware where missing.

### 3) Role trust from client-supplied headers
- **Files:** `server/src/mw/rbac.ts`
- **Why this is high:** `resolveRole()` accepts `x-user-role` directly and returns it as authoritative role.
- **Plain-English exploit risk:** Any caller can send `x-user-role: Admin` and bypass RBAC checks wherever this middleware is used.
- **Smallest safe remediation:**
  1. Ignore `x-user-role` from external requests.
  2. Resolve roles from JWT claims and/or server DB only.
  3. If service-to-service headers are needed, require signed internal auth and network boundary checks.

### 4) Optional/non-production auth path in authoring routes + unbounded memory upload
- **Files:** `server/routes/authoring.router.ts`
- **Why this is high:**
  - JWT is only strictly required when `NODE_ENV === 'production'`.
  - If `jose` fails to load, middleware logs warning and continues.
  - `multer.memoryStorage()` is used with no explicit size/type limits.
- **Plain-English exploit risk:** In mis-set environments (staging/test mirrors), unauthenticated requests may mutate controlled authoring resources; large uploads can exhaust memory and degrade availability.
- **Smallest safe remediation:**
  1. Require auth in all deployed environments (only explicit unit-test mode may bypass).
  2. Hard-fail startup if JWT verifier dependency is unavailable.
  3. Add multer `limits.fileSize`, file count, and MIME/extension allowlist.

## P2

### 5) Browser token exposure in localStorage
- **Files:** `client/src/concept2cure/services/cortexService.ts`
- **Why this is medium:** Access tokens are read from `localStorage` (and sessionStorage). Any XSS can exfiltrate tokens.
- **Plain-English exploit risk:** If any front-end script injection occurs, attacker can steal bearer tokens and reuse them from another device.
- **Smallest safe remediation:**
  1. Move auth tokens to HttpOnly, Secure, SameSite cookies.
  2. Keep short-lived access tokens + rotating refresh tokens.
  3. Add CSP hardening and token theft detection.

### 6) Permissive CORS/SSE origins in non-prod and SSE wildcard routes
- **Files:** `server/middleware/security.js`, `server/routes/contentAssembly.routes.ts` (also similar SSE in `server/routes/leaves.js`, `server/routes/fieldSync.routes.ts`)
- **Why this is medium:**
  - Global security middleware allows any origin in non-production (`origin: true`) while using credentials.
  - Some SSE routes manually set `Access-Control-Allow-Origin: *`.
- **Plain-English exploit risk:** Cross-origin pages can consume internal event streams and increase attack surface in shared dev/staging or misconfigured deployments.
- **Smallest safe remediation:**
  1. Replace wildcard/`true` with explicit allowlist for every environment.
  2. Centralize SSE CORS handling in one middleware.
  3. Disable credentialed cross-origin access unless strictly needed.
