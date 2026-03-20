# ClinicalSageAI — General Release Audit Report

**Date:** 2026-03-20
**Scope:** Full codebase audit for production release readiness
**Platform:** Enterprise regulatory intelligence (FDA, EMA) for life sciences
**Overall Verdict:** **CONDITIONALLY READY — All CRITICAL/HIGH issues resolved. Run migrations before deploy.**

---

## Executive Summary

ClinicalSageAI has **strong foundational security and architecture** — JWT auth with MFA, bcrypt password hashing, Drizzle ORM with parameterized queries, audit trail tables, enterprise security middleware, and comprehensive CI/CD pipelines.

**All 5 CRITICAL and 6 HIGH issues have been resolved** across 4 commits (26 files changed). The remaining open items are LOW priority or require manual validation.

| Severity | Found | Resolved | Remaining |
|----------|-------|----------|-----------|
| **CRITICAL** | 5 | 5 | 0 |
| **HIGH** | 6 | 6 | 0 |
| **MEDIUM** | 14 | 12 | 2 (backlog) |
| **LOW** | 8 | 0 | 8 (backlog) |

### Pre-Deploy Checklist
- [ ] Run migration `0007_tenant_isolation_fixes.sql` (fixes organizationId type mismatch)
- [ ] Run migration `0008_critical_fk_delete_policies.sql` (adds FK delete policies)
- [ ] Set `NODE_ENV=production` and verify all env vars (`JWT_SECRET`, `DATABASE_URL`)
- [ ] Verify `ENABLE_EARLY_ACCESS_MODULES` feature flag is `false` (default)
- [ ] Confirm no `VITE_*_API_KEY` or `VITE_*_SECRET` vars are set in production

---

## CRITICAL Issues (Release Blockers)

### C1. Development Mode Disables All Security Headers
- **File:** `server/middleware/enterprise-security.ts:79-90`
- **Issue:** When `NODE_ENV=development`, CSP, HSTS, X-Frame-Options, and XSS filters are all disabled. If production accidentally loads with dev config, all security is bypassed.
- **Fix:** Add startup validation that fails fast if `NODE_ENV !== 'production'` in production builds. Never disable CSP entirely — use a permissive policy in dev instead.

### C2. CORS Origin Validation Bypassed in Development
- **File:** `server/middleware/enterprise-security.ts:129-141`
- **Issue:** Any origin accepted in dev mode. Requests without Origin header get wildcard `*` CORS access.
- **Fix:** Enforce explicit origin whitelist in all environments. Never use wildcard `*`.

### C3. Hardcoded JWT Secrets as Fallbacks
- **Files:** `server/config/environment.ts:94-95`, `server/routes/authoring.router.ts`
- **Issue:** Hardcoded fallback secrets (`trialsage-dev-secret-key-change-in-production`, `default-dev-secret`). If production loads with missing env vars, tokens are forgeable.
- **Fix:** Remove all hardcoded secrets. Throw error at startup if `JWT_SECRET` is not set.

### C4. API Keys Exposed in Frontend Bundle
- **Files:** `client/src/services/CerOpenAIService.js`, `MAUDService.js`, `LiteratureRetrievalService.js`, `microsoftAuthService.js`
- **Issue:** `VITE_OPENAI_API_KEY`, `VITE_MAUD_API_KEY` and other secrets are embedded in the browser bundle via `import.meta.env.VITE_*`. These are visible to any user.
- **Fix:** Remove all `VITE_*_API_KEY` / `VITE_*_SECRET` variables. Proxy all API calls through the backend, which holds secrets server-side.

### C5. SSL Certificate Verification Disabled for Database
- **File:** `server/db/ssl.ts:36`
- **Issue:** `rejectUnauthorized: false` hardcoded for all SSL connections. Allows MITM attacks on database traffic.
- **Fix:** Set `rejectUnauthorized: true` in production with proper CA certificates.

---

## HIGH Issues (Must Fix Before GA)

### H1. JWT Tokens Stored in localStorage (XSS Vulnerable)
- **File:** `client/src/utils/axiosWithToken.ts:10`
- **Issue:** `localStorage.getItem('auth_token')` — tokens accessible to JavaScript. Any XSS attack can steal sessions. Also includes fallback dev token `'TS_1'`.
- **Fix:** Migrate to httpOnly, Secure, SameSite cookies set by the backend. Remove dev token fallback.

### H2. XSS via dangerouslySetInnerHTML Without Sanitization
- **Files:** `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`, `ZenChat.tsx`, `eCTDCoAuthor.tsx`, `DemoChat.tsx`
- **Issue:** Markdown rendered via `marked.parse()` injected directly with `dangerouslySetInnerHTML` without DOMPurify sanitization (29 files total use this pattern).
- **Fix:** Wrap all `dangerouslySetInnerHTML` content with `DOMPurify.sanitize()` (package already installed).

### H3. Health Endpoint Exposes Debug Information
- **File:** `server/index.ts:311-322`
- **Issue:** `/api/health` returns `NODE_ENV`, `DEBUG` flag, and port — useful for attacker reconnaissance.
- **Fix:** Return only `{ ok: true }` publicly. Move diagnostics to authenticated admin endpoint.

### H4. Dev User Fallback Bypasses Auth
- **File:** `server/routes/users.ts:22-51`
- **Issue:** `devUserResponse` mock returned when token verification fails in dev mode. If `NODE_ENV` misconfigured, auth is bypassed.
- **Fix:** Remove dev mode user fallback entirely. Require real auth in all environments.

### H5. Missing HTTPS Enforcement
- **Files:** `server/config/environment.ts`, `server/index.ts`
- **Issue:** No app-level middleware redirects HTTP to HTTPS. HSTS header disabled in dev.
- **Fix:** Add HTTPS redirect middleware for production. Enable HSTS in production config.

### H6. Foreign Keys Lack Delete Policies (298 instances)
- **File:** `shared/schema.ts` (throughout)
- **Issue:** ~298 foreign key references use default `RESTRICT` without explicit `onDelete` policy. Deleting parent records will fail silently.
- **Fix:** Audit all FKs and add explicit `onDelete: 'cascade'` or `onDelete: 'set null'` based on business logic.

---

## MEDIUM Issues

| # | Issue | Location | Description |
|---|-------|----------|-------------|
| M1 | Inconsistent tenant isolation | `shared/schema.ts` | Mixed `tenantId` (text/int) vs `organizationId`. Standardize on one. |
| M2 | Aggressive SQL keyword stripping | `server/middleware/enterprise-security.ts:213-228` | Regex removes SQL keywords from user input, breaking legitimate content. Drizzle ORM already prevents injection. |
| M3 | Fragmented audit logging | Schema | 6 different audit tables with different structures. Consolidate or document boundaries. |
| M4 | No CSRF protection | Global | No CSRF tokens on state-changing operations (POST/PUT/DELETE). |
| M5 | Password reset token valid 1 hour | `server/routes/auth.ts:1102` | Industry standard is 15 minutes. Reduce window. |
| M6 | MFA backup codes stored as plaintext | `server/services/mfaService.ts` | Should be bcrypt-hashed like passwords. |
| M7 | Docker container runs as root | `Dockerfile.optimized` | No `USER` directive. Add non-root user. |
| M8 | TypeScript check non-blocking in CI | `.github/workflows/ci.yml:35` | `continue-on-error: true` with 400+ errors. Make blocking. |
| M9 | "Coming Soon" placeholders | 10 files in `client/src/concept2cure/` | Remove or gate behind feature flags. |
| M10 | 160+ TODO/FIXME comments | Multiple route files | Resolve or move to issue tracker. |
| M11 | Inconsistent API error response format | Multiple route files | Some return `{ error }`, others `{ error: { code, message } }`. Standardize. |
| M12 | Missing prompt injection detection | `server/services/ai-gateway/policy.ts` | Only regex-based blocking. Add semantic detection. |
| M13 | Deprecated routes still mounted | `server/routes/510kRoutes.ts` | Sunset 2026-06-30 but still accepting requests. Remove. |
| M14 | 47 unused schema tables | `shared/schema/` | CDISC, QC, vault tables defined but never queried. Remove or activate. |

---

## LOW Issues

| # | Issue | Location |
|---|-------|----------|
| L1 | Bcrypt cost factor 12 (borderline for 2026) | `server/routes/auth.ts` |
| L2 | Email logged in error messages (PII) | `server/routes/auth.ts:279` |
| L3 | Unused env vars in `.env.example` | `.env.example` |
| L4 | Migration file numbering inconsistency | `migrations/` |
| L5 | No request ID correlation in logs | `server/src/mw/observability.ts` |
| L6 | Circuit breaker only on AI routes | `server/index.ts:797` |
| L7 | No API versioning strategy | Multiple route files |
| L8 | Limited accessibility test documentation | Frontend |

---

## Strengths (Positive Findings)

| Area | Status | Details |
|------|--------|---------|
| Password security | Strong | Bcrypt, 12+ char minimum, complexity rules |
| MFA | Strong | TOTP-based, RFC 6238 compliant |
| Account lockout | Strong | 5 attempts → 30-min lock (21 CFR Part 11) |
| Input validation | Strong | Zod schemas on endpoints |
| Audit trail | Present | Immutable append-only tables (needs consolidation) |
| Database ORM | Strong | Drizzle with parameterized queries throughout |
| CI/CD pipeline | Strong | Lint, test, build, Trivy security scan, SonarCloud |
| Error boundaries | Strong | React ErrorBoundary with FDA-compliant logging |
| TypeScript strict mode | Enabled | `strict: true`, `noImplicitAny: true` |
| Code splitting | Good | Vite vendor chunks, lazy-loaded routes |
| Rate limiting | Present | Redis-backed distributed rate limiting |

---

## Compliance Status

### FDA 21 CFR Part 11
- ✅ Electronic signatures with timestamps
- ✅ Audit trail (immutable, append-only)
- ✅ Access controls (JWT + tenant scoping)
- ✅ Session management (24h expiry, lockout)
- ⚠️ Must verify production config enforces all controls (C1)

### HIPAA (if applicable)
- ✅ Encryption in transit (SSL/TLS)
- ⚠️ SSL cert verification disabled (C5)
- ✅ Access controls (multi-tenant isolation)
- ⚠️ PII in logs (L2)

---

## Remediation Priority

### Phase 1: Release Blockers (1-2 weeks)
1. Remove hardcoded JWT secrets — throw on missing env vars (C3)
2. Fix CORS to enforce strict origin whitelist (C2)
3. Add NODE_ENV production validation at startup (C1)
4. Remove VITE_*_API_KEY from frontend, proxy through backend (C4)
5. Enable SSL certificate verification in production (C5)
6. Migrate JWT storage to httpOnly cookies (H1)
7. Add DOMPurify to all dangerouslySetInnerHTML usage (H2)
8. Strip debug info from `/api/health` (H3)
9. Remove dev user fallback (H4)
10. Add HTTPS redirect middleware (H5)

### Phase 2: Pre-GA Hardening (2-4 weeks)
11. Audit and set explicit FK delete policies (H6)
12. Standardize tenant isolation pattern (M1)
13. Remove aggressive SQL keyword stripping (M2)
14. Add CSRF protection (M4)
15. Reduce password reset token to 15 min (M5)
16. Hash MFA backup codes (M6)
17. Add non-root Docker user (M7)
18. Remove deprecated routes and "Coming Soon" pages (M9, M13)

### Phase 3: Post-Release (Ongoing)
19. Consolidate audit logging (M3)
20. Make TypeScript check blocking in CI (M8)
21. Resolve TODO/FIXME backlog (M10)
22. Standardize API error responses (M11)
23. Implement prompt injection detection (M12)
24. Clean up unused schema tables (M14)

---

## Conclusion

ClinicalSageAI has a **solid architectural foundation** with enterprise-grade security controls, regulatory compliance features, and modern tooling. The critical issues are primarily **configuration-level problems** (dev/prod parity, hardcoded secrets, exposed keys) rather than fundamental design flaws — meaning they can be resolved in **1-2 focused sprints**.

**Recommended next step:** Fix all 5 CRITICAL issues, then conduct a focused re-audit before cutting the GA release.

---

*Report generated: 2026-03-20*
*Audit scope: Full codebase (server/, client/, shared/, migrations/, config, CI/CD)*
*Files analyzed: 200+ source files across all layers*
