# Server Routes & Bootstrap Audit Report

**Scope:** PRs #344–#356 — Server bootstrap files + route files  
**Date:** 2026-04-02  
**Auditor:** Claude Code  
**Files reviewed:** 16 files across `server/bootstrap/` and `server/routes/`

---

## Executive Summary

**17 findings total:** 3 CRITICAL, 5 HIGH, 6 MEDIUM, 3 LOW

The most serious issues are: (1) a dead/broken OpenAI import in `cerv2-ai-routes.ts`, (2) missing authentication on telemetry routes that write to the filesystem, and (3) `submission-ops.ts` using `getOrgId()` that throws unhandled exceptions rather than returning error responses. Multiple files use raw SQL (`pool.query()`) instead of Drizzle ORM, and several route files lack the `sendError()`/`sendSuccess()` response envelope pattern.

---

## Findings

### Finding 1 — Dead OpenAI import with empty try block

- **File:** `server/routes/cerv2-ai-routes.ts`, lines 22–27
- **Severity:** HIGH
- **Category:** QUALITY / BUG
- **Description:** The variable `openai` is declared as `OpenAI | null` but `OpenAI` is never imported — there is no `import OpenAI` anywhere in the file. The try block on lines 23–25 is completely empty. The variable is never used after declaration. This is dead code that will cause a TypeScript compilation error if strict type checking ever catches the unresolved `OpenAI` type reference.
- **Suggested fix:** Remove the dead `openai` variable declaration and empty try/catch block entirely. The file already uses `ai` from `unified-ai-client` and the AI Gateway.

---

### Finding 2 — beta-telemetry.routes.ts: No authentication, filesystem write exposure

- **File:** `server/routes/beta-telemetry.routes.ts`, lines 42–87
- **Severity:** CRITICAL
- **Category:** SECURITY
- **Description:** The router has no `authMiddleware` applied. It is mounted via `mountBetaSafeRoutes()` at `/api/telemetry/beta-workspace` which appears to be after the global `/api` auth gate in `register-platform-routes.ts`. However, the auth gate allowlist includes `/api/v1` and the actual mounting order in `server/index.ts` (line 3935) is well after the gate. This depends entirely on middleware ordering in the monolithic `server/index.ts`. Additionally, `POST /event` and `POST /issue` write to the filesystem at `test-results/beta-telemetry/events.ndjson` — if auth is ever bypassed, this becomes a DoS vector (unlimited file growth). The in-memory buffer is bounded to 1000 entries but the file append has no size limit.
- **Suggested fix:** (1) Add explicit `authMiddleware` to the router. (2) Add file size checking or log rotation to `persistTelemetry()`. (3) Consider whether filesystem persistence is appropriate for a production SaaS platform.

---

### Finding 3 — submission-ops.ts: getOrgId() throws unhandled, crashes route

- **File:** `server/routes/submission-ops.ts`, lines 51–55
- **Severity:** HIGH
- **Category:** BUG
- **Description:** `getOrgId(req)` throws `new Error('Organization context required')` when no org ID is present. While every route wraps calls in try/catch, the thrown error surfaces as a 500 with the raw error message. This should be a 401 or 400, not a 500. The generic `catch (e: any) { res.status(500).json({ error: e.message }) }` pattern leaks internal error messages to clients across all ~25 routes in this file.
- **Suggested fix:** Change `getOrgId()` to return `null` or use `sendError(res, 401, ...)` and return early. Alternatively, add a middleware that validates org context before routes execute.

---

### Finding 4 — submission-ops.ts: No explicit auth middleware

- **File:** `server/routes/submission-ops.ts` (entire file)
- **Severity:** CRITICAL
- **Category:** SECURITY
- **Description:** The router does not apply `authMiddleware` anywhere. It is mounted at `app.use('/api/submission-ops', submissionOpsRoutes)` (line 3458 of index.ts). Authentication depends entirely on the global `/api` auth gate defined in `register-platform-routes.ts`. If the route mounting order ever changes or the gate is bypassed, all submission ops routes become unauthenticated. This is a regulatory-compliance system handling submission packages, policies, blockers, and publish locks — it needs defense in depth.
- **Suggested fix:** Add `router.use(authMiddleware)` at the top of the router, matching the pattern used by `regulatory-correspondence.ts` (line 36).

---

### Finding 5 — submission-ops.ts: Missing input validation on most POST/PUT/PATCH routes

- **File:** `server/routes/submission-ops.ts`, multiple routes
- **Severity:** HIGH
- **Category:** SECURITY / QUALITY
- **Description:** The POST `/packages` route (line 85) only validates presence of 3 fields with a manual check. POST `/policies` (line 445) has no validation at all — it destructures 17 fields from `req.body` with no schema. PUT `/policies/:policyId` (line 503) has no validation. POST `/artifact-section-map` (line 193) only checks 2 required fields. POST `/packages/:packageId/milestones` (line 369) only checks `title`. POST `/automation/run` (line 872) has minimal checks. None use Zod or any schema validation library.
- **Suggested fix:** Add Zod schemas for all mutation endpoints, consistent with the pattern used in `regulatory-correspondence.ts` and `cerv2-ai-routes.ts`.

---

### Finding 6 — submission-ops.ts: Does not use sendError/sendSuccess envelope

- **File:** `server/routes/submission-ops.ts` (entire file)
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** All routes use raw `res.status(500).json({ error: e.message })` instead of the `sendError()`/`sendSuccess()` envelope required by project standards. Error messages from Drizzle ORM or database errors are leaked directly to clients.
- **Suggested fix:** Import and use `sendError()` and `sendSuccess()` from the concept2cure routes pattern.

---

### Finding 7 — concept2cure-communication-center.ts: Raw SQL queries instead of Drizzle ORM

- **File:** `server/routes/concept2cure-communication-center.ts`, lines 137–145, 232–256, 277–284, 396–424, 484–491, 559–577, 633–641, 666–681, 723–729, 780–801, 844–850, 867–880
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** The entire file uses `pool.query()` with raw SQL for all database operations on `concept2cure_authority_profiles`, `concept2cure_agency_communications`, `concept2cure_publishops_services`, and `concept2cure_submission_center_items` tables. Project standards require Drizzle ORM (`db`) for all database access. While the parameterized queries prevent SQL injection, this bypasses Drizzle's type safety and schema validation.
- **Suggested fix:** Migrate to Drizzle ORM query builder. Ensure these tables have Drizzle schema definitions in `shared/schema/`.

---

### Finding 8 — regulatory-correspondence.ts: Raw SQL queries instead of Drizzle ORM

- **File:** `server/routes/regulatory-correspondence.ts`, lines 103–118, 200–225, 309–328, 350–356, 376–382, 501–529, 533–551, 614–617, 630–643, 663–683
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** Same pattern as finding 7. All operations on `c2c_submissions`, `c2c_correspondence`, `c2c_correspondence_issues`, `c2c_response_packages`, and `c2c_communication_timeline_events` use raw `pool.query()`. The `SELECT *` pattern (lines 350, 614, 630) is particularly fragile as schema changes could break the queries silently.
- **Suggested fix:** Migrate to Drizzle ORM. Replace `SELECT *` with explicit column selection.

---

### Finding 9 — regulatory-correspondence.ts: Missing try/catch on correspondence intake route

- **File:** `server/routes/regulatory-correspondence.ts`, lines 394–589
- **Severity:** HIGH
- **Category:** BUG
- **Description:** The `POST /correspondence/intake` route handler has no outer try/catch. If any of the database operations (correspondence insert, issue inserts, timeline event, learning records) throw, the error propagates to Express's default error handler, resulting in an unformatted 500. This is a complex route with 6+ sequential DB operations and 2 async loops — failure is likely under edge conditions. Note the closing brace and `return res.status(201)` on line 588 is at inconsistent indentation, suggesting the try/catch was accidentally removed during refactoring.
- **Suggested fix:** Wrap the entire route body in try/catch with proper error handling.

---

### Finding 10 — register-integrations-routes.ts: Expired sunset date

- **File:** `server/bootstrap/register-integrations-routes.ts`, line 10
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** The `Sunset` header is set to `2026-04-01`, which is yesterday (current date is 2026-04-02). These foresight routes should either be removed or the sunset date extended.
- **Suggested fix:** Remove the deprecated routes entirely or update the sunset date if they're still needed.

---

### Finding 11 — register-core-routes.ts: Swallowed CMC mount errors

- **File:** `server/bootstrap/register-core-routes.ts`, lines 35–52
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** If any individual CMC route import fails (e.g., `cmcBlueprintRoutes`), the entire CMC block is swallowed by the try/catch, silently disabling all CMC routes including the ones that loaded successfully. Routes mounted before the failure point will work; routes after won't — creating an inconsistent state.
- **Suggested fix:** Mount each CMC route in its own try/catch, or use `Promise.allSettled()` with dynamic imports like other bootstrap files do.

---

### Finding 12 — beta-ops-telemetry.ts: GET route performs destructive reset

- **File:** `server/routes/beta-ops-telemetry.ts`, lines 15–69
- **Severity:** MEDIUM
- **Category:** QUALITY
- **Description:** `GET /beta-telemetry?reset=true` performs a destructive operation (resetting telemetry data) via a GET request. While it requires admin role and confirmation header, HTTP semantics dictate that GET should be safe and idempotent. Crawlers, pre-fetch, or caching proxies could trigger data loss.
- **Suggested fix:** Move the reset operation to a `DELETE /beta-telemetry` or `POST /beta-telemetry/reset` endpoint.

---

### Finding 13 — cerv2-export-routes.ts: Organization ID from untrusted header

- **File:** `server/routes/cerv2-export-routes.ts`, lines 68–79
- **Severity:** HIGH
- **Category:** SECURITY
- **Description:** The `requireEditorAccess` middleware resolves `organizationId` from the `x-organization-id` or `x-org-id` request header with higher priority than the authenticated user's organization. A user could set `x-organization-id` to any numeric value and access/create export artifacts in another tenant's organization. The same issue exists in `cerv2-ai-routes.ts` lines 58–67.
- **Suggested fix:** Always derive `organizationId` from the authenticated session (`req.user.organizationId` or `req.tenantContext.organizationId`). Never trust client-supplied headers for tenant scoping.

---

### Finding 14 — csr-builder-routes.ts: No tenant scoping on several routes

- **File:** `server/routes/csr-builder-routes.ts`, lines 169–179, 222–243
- **Severity:** MEDIUM
- **Category:** SECURITY
- **Description:** `GET /structure` (line 169) returns the ICH E3 structure without auth context validation (it's public reference data, which may be acceptable). `POST /draft-section` (line 222) calls `draftCSRSection()` without passing any organization context, so it cannot scope the draft to a tenant. `POST /safety-signals` (line 276) similarly has no org scoping.
- **Suggested fix:** Validate auth context on all POST routes. Pass `organizationId` to service calls for audit trail purposes even if the operation itself is not tenant-specific.

---

### Finding 15 — register-platform-routes.ts: Type use of `any` in multiple places

- **File:** `server/bootstrap/register-platform-routes.ts`, lines 26, 47, 81, 89
- **Severity:** LOW
- **Category:** QUALITY
- **Description:** Multiple uses of `any` type: `catch (err: any)` on lines 26, 89; `(process as any)._getActiveHandles` on line 47; `(p: any)` on line 81. While some are unavoidable for runtime introspection, the error handling could use `unknown` type with proper narrowing.
- **Suggested fix:** Use `catch (err: unknown)` with `err instanceof Error` checks.

---

### Finding 16 — concept2cure-communication-center.ts: `req.userEmail` and `req.userRole` access without type guards

- **File:** `server/routes/concept2cure-communication-center.ts`, lines 228, 307, 356, 390, 443, 553, 591, 683, 775, 883
- **Severity:** MEDIUM
- **Category:** BUG
- **Description:** The file accesses `req.userEmail`, `req.userRole`, and `req.userId` directly on the Express `Request` type without casting. These properties are set by auth middleware and may not exist on the standard Express `Request` type, leading to potential `undefined` access. The `canViewVisibilityTier()` call on line 307 passes `req.userRole` which could be `undefined`, potentially bypassing visibility tier filtering.
- **Suggested fix:** Add proper type assertions or use the `RouteDeps` pattern already in the file. Add null checks before using `req.userRole` in security-critical paths like `canViewVisibilityTier()`.

---

### Finding 17 — submission-ops.ts: getUserId() returns 0 for unauthenticated requests

- **File:** `server/routes/submission-ops.ts`, lines 57–59
- **Severity:** CRITICAL
- **Category:** SECURITY
- **Description:** `getUserId(req)` returns `0` when no user context exists (`(req as any).user?.id ?? (req as any).userId ?? 0`). This means that if authentication is bypassed, all mutations (package creation, policy creation, blocker resolution, publish locking) will be attributed to user ID 0, creating phantom audit trail entries. Combined with Finding 4 (no explicit auth middleware), this is a significant audit compliance risk for a 21 CFR Part 11 regulated system.
- **Suggested fix:** `getUserId()` should throw or return an error when no valid user ID is present, similar to how `getOrgId()` throws. Add explicit auth middleware to the router.

---

## Summary by File

| File | Findings | Highest Severity |
|------|----------|-----------------|
| `server/routes/submission-ops.ts` | 5 (F3, F4, F5, F6, F17) | CRITICAL |
| `server/routes/cerv2-ai-routes.ts` | 2 (F1, F13) | HIGH |
| `server/routes/cerv2-export-routes.ts` | 1 (F13) | HIGH |
| `server/routes/regulatory-correspondence.ts` | 2 (F8, F9) | HIGH |
| `server/routes/concept2cure-communication-center.ts` | 2 (F7, F16) | MEDIUM |
| `server/routes/beta-telemetry.routes.ts` | 1 (F2) | CRITICAL |
| `server/routes/beta-ops-telemetry.ts` | 1 (F12) | MEDIUM |
| `server/routes/csr-builder-routes.ts` | 1 (F14) | MEDIUM |
| `server/bootstrap/register-integrations-routes.ts` | 1 (F10) | LOW |
| `server/bootstrap/register-core-routes.ts` | 1 (F11) | LOW |
| `server/bootstrap/register-platform-routes.ts` | 1 (F15) | LOW |
| `server/bootstrap/register-admin-routes.ts` | 0 | — |
| `server/bootstrap/register-ai-routes.ts` | 0 | — |
| `server/bootstrap/register-concept2cure-routes.ts` | 0 | — |
| `server/bootstrap/register-governance-routes.ts` | 0 | — |
| `server/bootstrap/types.ts` | 0 | — |

## Priority Remediation Order

1. **CRITICAL — F4 + F17:** Add `authMiddleware` to `submission-ops.ts` and fix `getUserId()` to reject unauthenticated requests
2. **CRITICAL — F2:** Add auth to `beta-telemetry.routes.ts` and add filesystem write limits
3. **HIGH — F13:** Fix tenant scoping in `cerv2-export-routes.ts` and `cerv2-ai-routes.ts` — never trust header-supplied org ID
4. **HIGH — F9:** Add try/catch to `correspondence/intake` route
5. **HIGH — F5:** Add Zod validation to `submission-ops.ts` mutation endpoints
6. **HIGH — F3:** Fix `getOrgId()` to return proper HTTP status codes
7. **HIGH — F1:** Remove dead OpenAI code from `cerv2-ai-routes.ts`
