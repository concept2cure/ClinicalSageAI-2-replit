# Stage 3 — Auth / Tenant / DB Stabilization Without Organ Damage

Stage: Stage 3 — Auth / Tenant / DB Stabilization Without Organ Damage  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `bdad912b` (starting point for this stage)

## Objective

Stabilize runtime-critical auth and DB layers by declaring canonical paths, mapping non-canonical adapters, and improving parity safety without deleting protected modules or changing public semantics.

## In-scope files reviewed

- `server/auth.ts`
- `server/db.ts`
- `server/db.js`
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`
- routes importing the above modules (grouped in this plan)

## Canonical declarations (Stage 3)

### Auth canonical declaration

- **Canonical runtime gate:** `server/auth.ts` (`authMiddleware`) for global `/api` auth path used by `server/index.ts`.
- **Compatibility auth surfaces retained (do not delete in Stage 3):**
  - `server/middleware/auth.ts`
  - `server/middleware/auth.js`
  - `server/middleware/authAdapter.ts`
- **Rationale:** route families still depend on middleware variants with different request/permission semantics and error envelopes.

### DB canonical declaration

- **Canonical DB spine:** `server/db.ts` (pool, `db`, `getPool`, `getDb`, migrations, `ensureAuthTables`, `query`, `transaction`, `healthCheck`).
- **Compatibility DB surface retained (do not delete in Stage 3):**
  - `server/db.js` (status/retry/tenant-context helper layer; explicit `.js` importer heavy surface).

## Route dependency map (non-canonical dependency families)

### Routes depending on middleware auth variants

- `server/middleware/auth.ts` importers (examples):
  - `server/routes/templateRoutes.ts`
  - `server/routes/submission-twin.ts`
  - `server/routes/cortexRoutes.ts`
  - `server/routes/ana-features.ts`
  - `server/routes/change-management.ts`
- `server/middleware/auth.js` importers (examples):
  - `server/routes/cortex-unified.ts`
  - `server/routes/billing.ts`
  - `server/routes/billing-dashboard.ts`
  - `server/routes/predicate-intelligence.ts`
  - `server/routes/knowledge-base.ts`
  - legacy JS routes (`promo.js`, `reference-model.js`, `meta.js`, `esgSubmission.js`)
- `server/middleware/authAdapter.ts` importer:
  - `server/routes/documentAuthoring.routes.ts`

### Modules depending on `db.js` compatibility surface

Broad import surface remains across services/routes/jobs/scripts; representative examples:
- `server/routes/predicate-intelligence.ts`
- `server/routes/project-sections.ts`
- `server/services/working-memory.ts`
- `server/services/kernel-plan-runtime.ts`
- `server/services/precedent-engine.ts`
- `server/services/chat-thread-helpers.ts`
- `server/index.ts` (dynamic import for metrics and auth bootstrap call)

## Stage 3 stabilization actions applied

### 1) Export-shape hardening (no semantic path change)

- **`server/db.js`**
  - Kept compatibility behavior intact.
  - Added explicit re-exports of canonical helpers from `db.ts` to prevent shape regressions for mixed importer surfaces:
    - `getPool`, `getDb`, `runMigrations`, `ensureAuthTables`, `transaction`, `healthCheck`.
  - Net effect: existing `db.js` users retain behavior; missing export hazards reduced.

- **`server/middleware/auth.js`**
  - Added backward-compatible `verifyJwt` alias export (`verifyJwt = authenticateJWT`) for legacy JS route importers.
  - Added lightweight `hasPermission(req, requiredPermission)` boolean helper export to match `server/auth/index.ts` barrel contract and README examples.
  - Net effect: no route semantics widened; compatibility/import failures reduced.

### 2) Test/smoke strengthening

Added focused tests:
- `server/__tests__/security/auth-db-contract-smoke.test.ts`
  - Confirms auth export surfaces across canonical + compatibility modules.
  - Confirms `db.ts` and `db.js` critical helper export parity.
- `server/__tests__/security/auth-invalid-expired-jwt.test.ts`
  - Confirms invalid JWT and expired JWT rejection path with expected status semantics.
  - Confirms `requireOrgAccess` org mismatch behavior.

## Stage 3 validation outcomes

### Contract checks and smoke execution

- Valid JWT path: partially proven by contract analysis; full end-to-end still requires live DB + signed-token environment.
- Invalid/expired JWT path: covered by Stage 3 tests.
- Org mismatch behavior: covered via `requireOrgAccess` mismatch assertion (`AUTH_005` path).
- Protected route behavior: existing route-level guard tests plus new Stage 3 contract tests.
- DB health/startup sanity: static path confirmed (`/readyz`, `/api/health`, `/api/health/full` wiring) and compatibility exports validated.

Command run:
- `npx vitest run --config vitest.config.ts server/__tests__/security/auth-db-contract-smoke.test.ts server/__tests__/security/auth-invalid-expired-jwt.test.ts`

Result:
- **PASS** (2 files, 9 tests passed).

Notes:
- DB startup connectivity is intentionally skipped inside these tests via `SKIP_DB_STARTUP_TEST=true`.
- Test run emits a non-blocking repo warning about duplicate `jsdom` key entries in `package.json`.

### Typecheck status

- `npm run typecheck` executed in this stage and reports a large pre-existing error set outside Stage 3 scope (client/server-wide typing debt).
- No Stage 3-specific typecheck failures from:
  - `server/__tests__/security/auth-db-contract-smoke.test.ts`
  - `server/__tests__/security/auth-invalid-expired-jwt.test.ts`

## Explicit “do not delete yet” list (required)

Do not delete in Stage 3 (and not deleted here):
- `server/middleware/auth.ts`
- `server/middleware/auth.js`
- `server/middleware/authAdapter.ts`
- `server/db.js`

Reason: active importer/mount surface is still mixed; parity and ownership migration are incomplete.

## Residual risks / contradictions

1. Auth semantics still differ by module (`auth.ts` vs `middleware/auth.ts` vs `middleware/auth.js`) and are consumed by different route families.
2. Permission model differences remain (string-array semantics vs nested-object semantics) between TS and JS middleware implementations.
3. Full E2E valid-JWT + DB-backed membership path still needs environment-backed smoke execution.

## Recommendation

Stage 3 meets stabilization intent without organ damage and without deleting protected compatibility files.  
Next stage should focus on controlled convergence:
- migrate route families toward one request-contract model with explicit parity tests,
- keep adapter files until importer counts are near-zero and behavior diff tests are green,
- execute environment-backed auth+DB smoke in CI or a reproducible integration environment.

