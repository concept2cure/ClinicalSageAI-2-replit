# Security Audit Report — PRs #338–#356 (concept2cure-v2)

**Date**: 2026-04-02
**Scope**: Security-relevant code changes from today's PRs
**Auditor**: CERv2 Security & Compliance Engineer
**Mode**: Read-only audit — no changes made
**Branch**: `concept2cure-v2`

---

## Executive Summary

Reviewed 14 files across 8 security domains. Found **3 CRITICAL**, **5 HIGH**, **6 MEDIUM**, and **4 LOW** findings. The most urgent issues are a hardcoded JWT secret fallback in production-reachable code, tenant impersonation via `x-organization-id` header spoofing in the Cortex chat endpoint, and a missing auth guard on the `/save-draft` mutation endpoint.

| Severity  | Count  |
| --------- | ------ |
| CRITICAL  | 3      |
| HIGH      | 5      |
| MEDIUM    | 6      |
| LOW       | 4      |
| **Total** | **18** |

---

## Findings

### CRITICAL-01: Hardcoded JWT Secret Fallback in Production-Reachable Code

**File**: `server/routes/cortex-unified.ts` L1210
**Severity**: CRITICAL
**Category**: Hardcoded Secret

```typescript
const decoded = jwt.verify(
  token,
  process.env.JWT_SECRET || 'trialsage-codespace-jwt-secret-2026'
) as any;
```

**Description**: The `extractUserId()` function (used by all thread management endpoints: `GET/POST/PATCH/DELETE /api/cortex/threads*`) falls back to a hardcoded secret `'trialsage-codespace-jwt-secret-2026'` when `JWT_SECRET` is not set. This is **distinct** from the main `authMiddleware` which uses `config.jwt.secret` (which throws on missing secret in production). An attacker who discovers this fallback can forge valid JWT tokens for the thread endpoints.

**Impact**: Full authentication bypass for Cortex thread CRUD operations. An attacker can read, create, modify, and delete any user's conversation threads by crafting a JWT signed with the known hardcoded secret.

**Recommended Fix**:

```typescript
function extractUserId(req: Request): number | null {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    return decoded?.userId ? Number(decoded.userId) : null;
  } catch {
    return null;
  }
}
```

Import `config` from `../config/environment` and remove the hardcoded fallback entirely. The main `authMiddleware` already enforces proper secret sourcing; this function must do the same.

---

### CRITICAL-02: Tenant Impersonation via Header Spoofing in Cortex Chat

**File**: `server/routes/cortex-unified.ts` L239–L242, L962–L965
**Severity**: CRITICAL
**Category**: Missing Tenant Isolation

```typescript
const organizationId =
  parseInt((req as any).tenantContext?.organizationId, 10) ||
  parseInt(req.headers['x-organization-id'] as string, 10) ||
  1;
```

**Description**: The `/chat` and `/save-draft` endpoints resolve `organizationId` by first checking `tenantContext` (set from the untrusted `x-organization-id` header in `extractTenantContext` middleware at L117–L118), then falling back to the raw header, and finally defaulting to `1`. The `extractTenantContext` middleware at L116–L124 blindly trusts the `x-organization-id` header:

```typescript
const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = (req.headers['x-organization-id'] as string) || null;
  // ...
  (req as any).tenantContext = { organizationId, ... };
  next();
};
```

This allows any authenticated user to spoof the `x-organization-id` header and access/modify data belonging to a different organization. Compare with `server/middleware/auth.js` L67–L80 which explicitly blocks this pattern and logs it as "tenant impersonation attempt."

**Impact**: Cross-tenant data access. An authenticated user from Org A can read project data, save drafts, and access AI-generated intelligence for Org B by setting `x-organization-id: <org_b_id>`.

**Recommended Fix**:

```typescript
// In the /chat and /save-draft handlers, ALWAYS derive orgId from the JWT:
const organizationId = Number(req.user?.organizationId) || Number(req.tenantId);
if (!organizationId || organizationId <= 0) {
  return res.status(400).json({ error: 'Valid organization context required' });
}
```

Do NOT trust `x-organization-id` header for data-scoping operations. The header should only be used for telemetry/logging, never for authorization.

---

### CRITICAL-03: Missing Auth Middleware on `/save-draft` Mutation Endpoint

**File**: `server/routes/cortex-unified.ts` L952
**Severity**: CRITICAL
**Category**: Missing Authentication

```typescript
router.post('/save-draft', async (req: Request, res: Response) => {
```

**Description**: The `/save-draft` endpoint is a data-mutation route that creates/updates artifact records in the database. It lacks `requireAuth` middleware — it only has the router-level `rateLimiter` and `extractTenantContext` (neither of which enforce authentication). Compare with the `/chat` endpoint at L225 which includes `requireAuth`:

```typescript
router.post('/chat', requireAuth, async (req: Request, res: Response) => {
```

The endpoint falls back to `(req as any).userId || null` which will be `null` for unauthenticated requests, but it proceeds anyway and writes to the database with `userId: null`.

**Impact**: Unauthenticated users can create/modify artifacts in arbitrary projects. The endpoint defaults `organizationId` to `1` when unauthenticated, writing data to the first organization.

**Recommended Fix**:

```typescript
router.post('/save-draft', requireAuth, async (req: Request, res: Response) => {
```

---

### HIGH-01: Path Traversal Risk in Export Download Route

**File**: `server/routes/export-routes.ts` L57–L74
**Severity**: HIGH
**Category**: Path Traversal

```typescript
const { study_id } = req.query;
// ...
const files = fs.readdirSync(exportDir);
const zipFiles = files
  .filter(file => file.startsWith(`${study_id}_bundle_`) && file.endsWith('.zip'))
  .sort()
  .reverse();
// ...
const zipPath = path.join(exportDir, zipFiles[0]);
```

**Description**: The `study_id` query parameter is validated only for type (`string`), not for content. While the `startsWith()` filter partially mitigates direct traversal, the `study_id` value is incorporated into the filesystem lookup. If `study_id` contains path separator characters or is crafted to collide with filenames, it could interact unexpectedly with the filesystem. Additionally, the `exportDir` uses an unsanitized `process.env.DATA_PATH` which, if misconfigured, could point to sensitive directories.

**Recommended Fix**:

```typescript
const study_id = req.query.study_id;
if (!study_id || typeof study_id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(study_id)) {
  return res.status(400).json({ error: 'Invalid study_id format' });
}
```

---

### HIGH-02: Content-Disposition Header Injection in Export Download

**File**: `server/routes/export-routes.ts` L107
**Severity**: HIGH
**Category**: Header Injection

```typescript
res.setHeader('Content-Disposition', `attachment; filename=${zipFiles[0]}`);
```

**Description**: The filename from the filesystem is interpolated directly into the `Content-Disposition` header without quoting or sanitization. Filenames with special characters (newlines, semicolons) could enable header injection. RFC 6266 requires the filename to be quoted.

**Recommended Fix**:

```typescript
const safeFilename = zipFiles[0].replace(/[^a-zA-Z0-9._-]/g, '_');
res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
```

---

### HIGH-03: Sample Export Routes Missing Authentication

**File**: `server/routes/cerv2-export-routes.ts` L471–L480, L500, L557, L600
**Severity**: HIGH
**Category**: Missing Authentication

```typescript
router.get('/sample/:docType', async (req: Request, res: Response) => {
  if (!isSampleExportEnabled()) return denySampleExportRoute(res);
  // ... no authMiddleware, no requireEditorAccess
```

**Description**: All four sample export routes (`GET /sample/:docType`, `GET /sample/:docType/zip`, `GET /sample/:docType/docx`, `GET /sample/:docType/json`) are gated only by `isSampleExportEnabled()` (env flag check), not by authentication. While the `isSampleExportEnabled()` check requires `NODE_ENV !== 'production'`, non-production environments (staging, dev) are still internet-accessible and these endpoints expose mock data structures including internal document schemas and TipTap editor JSON format.

**Recommended Fix**: Add `authMiddleware` to sample export routes even in dev/staging:

```typescript
router.get('/sample/:docType', authMiddleware, async (req: Request, res: Response) => {
```

---

### HIGH-04: Rate Limiter KeyGenerator Trusts x-organization-id Header

**File**: `server/routes/cerv2-export-routes.ts` L39–L43
**Severity**: HIGH
**Category**: Rate Limit Bypass

```typescript
keyGenerator: (req: any) => {
  const userId = req.userId || req.user?.id || 'anon';
  const orgId = req.header('x-organization-id') || 'unknown';
  return `cerv2-export:${orgId}:${userId}`;
},
```

**Description**: The rate limiter key is derived from the untrusted `x-organization-id` header. An attacker can rotate this header value to bypass the rate limit entirely. By sending different header values, each request gets a fresh rate limit bucket.

**Recommended Fix**:

```typescript
keyGenerator: (req: any) => {
  const userId = req.userId || req.user?.id || 'anon';
  // Use JWT-derived org ID, not the header
  const orgId = req.user?.organizationId || req.tenantId || 'unknown';
  return `cerv2-export:${orgId}:${userId}`;
},
```

---

### HIGH-05: Cortex Rate Limiter Uses Untrusted Header for Client ID

**File**: `server/routes/cortex-unified.ts` L80
**Severity**: HIGH
**Category**: Rate Limit Bypass

```typescript
const clientId = (req.headers['x-organization-id'] as string) || req.ip || 'anonymous';
```

**Description**: Same pattern as HIGH-04. The Cortex rate limiter (50 req/min) uses the untrusted `x-organization-id` header as the primary rate-limit key. An attacker can rotate this header to get unlimited requests, potentially overwhelming AI provider backends (which have per-account cost implications).

**Recommended Fix**: Use `req.user?.organizationId` (JWT-derived) or `req.ip` as fallback:

```typescript
const clientId = String(req.user?.organizationId || req.tenantId || req.ip || 'anonymous');
```

---

### MEDIUM-01: Organization ID Fallback to `1` in Chat Handler

**File**: `server/routes/cortex-unified.ts` L239–L242
**Severity**: MEDIUM
**Category**: Incorrect Default / Broken Tenant Isolation

```typescript
const organizationId =
  parseInt((req as any).tenantContext?.organizationId, 10) ||
  parseInt(req.headers['x-organization-id'] as string, 10) ||
  1;
```

**Description**: If no organization ID can be resolved, the endpoint defaults to `1`, which is the first organization in the database. This means any request without proper org context will access Org 1's data. This is a tenant isolation failure — requests should fail closed, not default to a specific tenant.

**Recommended Fix**:

```typescript
const organizationId = Number(req.user?.organizationId);
if (!organizationId || organizationId <= 0) {
  return res.status(400).json({ error: 'Organization context required', code: 'MISSING_ORG' });
}
```

---

### MEDIUM-02: IP Address Default to `127.0.0.1` in Audit Logs

**File**: `server/services/compute/exportGovernance.ts` L151, L168, L188
**Severity**: MEDIUM
**Category**: Audit Log Integrity

```typescript
input.ipAddress || '127.0.0.1',
```

**Description**: If `ipAddress` is not provided, audit log entries record `127.0.0.1` as the source IP. This corrupts the audit trail for 21 CFR Part 11 compliance, making it impossible to distinguish between local operations and remote operations where IP was not captured. For regulated exports, audit integrity is paramount.

**Recommended Fix**: Reject the export if `ipAddress` is not available, or record `'unknown'` to avoid false attribution:

```typescript
input.ipAddress || 'ip-not-captured',
```

---

### MEDIUM-03: Error Messages Leak Internal Details

**File**: `server/routes/cortex-unified.ts` L127
**Severity**: MEDIUM
**Category**: Information Disclosure

```typescript
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  // ...
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.headers['x-request-id'] || 'unknown',
  });
};
```

**Description**: In non-production environments, full error messages are returned to the client. While production is masked, staging/dev environments may be externally accessible and can leak stack traces, SQL errors, and internal path information. The check should be more restrictive.

**Recommended Fix**: Only expose errors in local dev:

```typescript
error: process.env.NODE_ENV === 'development' && !process.env.IS_PUBLIC_STAGING
  ? err.message
  : 'Internal server error',
```

---

### MEDIUM-04: Beta Route Fence Discloses Blocked Paths in Response

**File**: `server/middleware/betaRouteFence.ts` L38
**Severity**: MEDIUM
**Category**: Information Disclosure

```typescript
return res.status(503).json({
  success: false,
  error: 'Route unavailable in guided beta mode',
  code: 'BETA_ROUTE_FENCED',
  path: reqPath,
  blockedBy: 'ENABLE_BETA_ROUTE_FENCE',
  // ...
});
```

**Description**: The 503 response includes the requested `path` and the environment variable name (`ENABLE_BETA_ROUTE_FENCE`) that controls the fence. This discloses internal configuration details and confirms to an attacker that specific routes exist but are blocked.

**Recommended Fix**: Remove `path` and `blockedBy` from the response body:

```typescript
return res.status(503).json({
  success: false,
  error: 'Route temporarily unavailable',
  code: 'BETA_ROUTE_FENCED',
  timestamp: new Date().toISOString(),
});
```

---

### MEDIUM-05: Static Data Guard Leaks Flag Names

**File**: `server/middleware/staticDataGuard.ts` L33–L39
**Severity**: MEDIUM
**Category**: Information Disclosure

```typescript
return res.status(503).json({
  success: false,
  error: `${routeName} is temporarily unavailable`,
  code: 'STATIC_BUSINESS_DATA_DISABLED',
  requiredFlag,
  // ...
});
```

**Description**: The `requiredFlag` (environment variable name) is included in the 503 response. This exposes the internal feature flag naming convention to callers.

**Recommended Fix**: Remove `requiredFlag` from the response body; log it server-side instead.

---

### MEDIUM-06: Missing CSRF Protection on State-Changing Endpoints

**File**: `server/routes/concept2cure-communication-center.ts` (all POST/PATCH/DELETE routes)
**Severity**: MEDIUM
**Category**: Missing CSRF Protection

**Description**: All communication center POST endpoints (authority-profiles, agency-communications, publishops-services, submission-center) rely solely on JWT Bearer token auth. While Bearer tokens provide some CSRF protection (they are not auto-included by browsers like cookies), the application also uses cookie-based session state in some paths. If any session-cookie-based auth path can reach these endpoints, CSRF is possible.

**Recommended Fix**: Verify that all routes in the communication center are exclusively behind Bearer-only auth. Consider adding a `X-Requested-With` or `Origin` check as defense-in-depth.

---

### LOW-01: Client-Side Lockout Duration is Too Short

**File**: `client/src/concept2cure/auth/loginLockout.ts` L2
**Severity**: LOW
**Category**: Insufficient Lockout

```typescript
export const LOGIN_LOCKOUT_MS = 30_000; // 30 seconds
```

**Description**: The client-side lockout after 5 failed attempts is only 30 seconds. The CLAUDE.md and SECURITY.md reference a 15-minute server-side lockout. While this is a client-side UX layer (server-side enforcement is what matters), the short client-side lockout could mislead security auditors into thinking the actual lockout is 30 seconds.

**Recommended Fix**: Align with the server-side policy (15 minutes / 900,000ms) or clearly document that this is a UX-only lockout:

```typescript
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes — matches server-side policy
```

---

### LOW-02: Password Policy Minimum Length is 12 but No Maximum

**File**: `client/src/concept2cure/auth/passwordPolicy.ts`
**Severity**: LOW
**Category**: Input Validation

**Description**: The password policy enforces a 12-character minimum but no maximum. While this is typically fine, extremely long passwords (>1MB) could cause bcrypt performance degradation (bcrypt truncates at 72 bytes anyway). OWASP recommends a maximum of 128 characters.

**Recommended Fix**: Add a max-length check:

```typescript
{ id: 'max-length', label: 'No more than 128 characters', met: password.length <= 128 },
```

---

### LOW-03: Redirect Utility Allows `#` Fragment in Redirects

**File**: `client/src/concept2cure/auth/redirectUtils.ts` L36
**Severity**: LOW
**Category**: Open Redirect (Marginal)

```typescript
const combined = `${parsed.pathname}${parsed.search}${parsed.hash}`;
```

**Description**: The redirect URL can include a hash fragment. While the allowlist restricts the pathname prefix, hash fragments can be used for client-side navigation abuse in certain SPA configurations. The risk is minimal given the pathname prefix restriction, but fragments can carry arbitrary data.

**Recommendation**: No immediate action required. The existing controls (pathname allowlist, control-char rejection, double-decode protection) are strong. Consider stripping hash fragments if sensitive data could appear in fragment identifiers.

---

### LOW-04: Thread ID Generation Uses Weak Randomness

**File**: `server/routes/cortex-unified.ts` L1365
**Severity**: LOW
**Category**: Predictable Identifiers

```typescript
const newId = `cortex_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

**Description**: Thread IDs are generated with `Math.random()` which is not cryptographically secure. While thread IDs are scoped per user (ownership verification on read/update/delete), predictable IDs could allow enumeration if combined with other bugs.

**Recommended Fix**: Use `crypto.randomBytes()`:

```typescript
import crypto from 'node:crypto';
const newId = `cortex_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
```

---

## Positive Security Findings

The following security practices are well-implemented:

1. **Auth middleware (`server/auth.ts`)**: JWT verification uses `config.jwt.secret` (not hardcoded), validates `organizationId` presence, resolves role from DB (not from JWT claim), rejects empty password hashes, and uses bcrypt for password comparison.

2. **CERV2 Export routes**: Strong Zod validation schemas, rate limiting, role-based access (`requireEditorAccess`), human review gate enforcement in production, input sanitization for filenames, attachment path traversal checks, and governed export consequence tracking.

3. **Export Governance service**: Full transactional audit trail (5-record provenance chain), SHA-256 content hashing, rollback on failure, and trace event emission.

4. **Redirect utilities**: Robust open-redirect prevention with pathname allowlisting, double-decode protection, control character rejection, `//` and `\` blocking, and same-origin enforcement.

5. **Cortex thread management**: Ownership verification on GET/PATCH/DELETE operations — users can only access their own threads (verified via `user_id` column match). Title input is truncated to 200 chars.

6. **Communication center routes**: All data operations are organization-scoped via parameterized queries. Input validation uses Zod schemas. Visibility tier enforcement gates responses by user role.

7. **Static data guard**: Fail-closed design with production assertion that throws on startup if static data flags are enabled.

8. **Beta route fence**: Clean fail-closed design; disabled by default; hardcoded block list is restrictive.

---

## Priority Remediation Order

| Priority | Finding                                                               | Effort |
| -------- | --------------------------------------------------------------------- | ------ |
| 1        | CRITICAL-01: Hardcoded JWT secret fallback                            | 5 min  |
| 2        | CRITICAL-03: Missing `requireAuth` on `/save-draft`                   | 1 min  |
| 3        | CRITICAL-02: Tenant impersonation via header spoofing                 | 30 min |
| 4        | HIGH-04 + HIGH-05: Rate limiter key from untrusted header             | 15 min |
| 5        | HIGH-01 + HIGH-02: Path traversal + header injection in export-routes | 15 min |
| 6        | HIGH-03: Sample export routes missing auth                            | 5 min  |
| 7        | MEDIUM-01: Org ID default to `1`                                      | 10 min |
| 8        | MEDIUM-02 through MEDIUM-06                                           | 30 min |
| 9        | LOW-01 through LOW-04                                                 | 20 min |

---

_End of audit report._
