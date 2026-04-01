# ClinicalSageAI Codex Ground Rules (Root Scope)

This file governs the entire repository unless overridden by a deeper `AGENTS.md`.

## Control-Tower Execution Model
- Use one lead control-tower session plus focused implementation sessions in separate worktrees/branches.
- Do not run parallel implementation on the same branch (a branch may only be checked out in one worktree at a time).
- Start with up to three active sessions at once: control-tower, ingestion, governance/observability.
- Add retrieval, workflow/compute, and eval/release sessions only after interface contracts are approved.

## Repository Safety Rules
- No new production dependency without a written justification doc in `docs/`.
- Every new subsystem must ship with tests and documentation in the same workstream.
- Preserve governed artifact lifecycle, provenance links, and audit traceability.
- Prefer feature flags for all new infrastructure paths.
- Policy/review/export/approval gates must fail closed.
- No direct writes from experimental services to core regulated artifact tables.
- Benchmark before enabling any experimental or alternate path by default.

## Change Management
- Control-tower session owns repo truth, branch/worktree naming, merge order, and release gates.
- Implementation sessions must align to explicit data contracts before merge.
- Do not mass-implement architecture before publishing control documents.

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Express + Vite dev server | `npx tsx server/index.ts` | 5000 | Backend + frontend in one process |
| PostgreSQL | system service | 5432 | Local native install, user `postgres`, password `postgres`, DB `concept2cure-ri` |

Redis and external services (Stripe, S3, SendGrid, AI providers) are optional; the server degrades gracefully without them.

### How to start the dev server

Set the required environment variables and run:
```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/concept2cure-ri?sslmode=disable"
export SKIP_DB_STARTUP_TEST=true NODE_ENV=development PORT=5000
export SESSION_SECRET=dev-session-secret JWT_SECRET=dev-jwt-secret REFRESH_TOKEN_SECRET=dev-refresh-token-secret
export CONCEPT2CURE_SIGNER_MODE=dev
npx tsx server/index.ts
```
Or use `npm run dev` (which sources `scripts/startup.sh` — this auto-detects Docker/native Postgres and writes `.env`).

### How to run tests, lint, and build

See `package.json` scripts. Key commands:
- **Lint**: `npm run lint` (ESLint; pre-existing warnings/errors in the codebase are expected)
- **Jest**: `npx jest --config scripts/jest.config.js` (client-side component tests)
- **Vitest**: `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run --config vitest.config.ts` (server + integration tests; full suite is very slow with `singleFork` mode — run specific files for speed)
- **Build**: `npm run build`

### Non-obvious gotchas

- **Auth token storage keys**: The frontend uses `trialsage_access_token`, `trialsage_refresh_token`, and `trialsage_user` as localStorage/sessionStorage keys (not `accessToken`).
- **Dev login endpoint**: `POST /api/auth/dev-login` with `{"email":"jm.smith@concept2cure.pro"}` bypasses MFA. Only works when `NODE_ENV !== 'production'`. Demo password is `demo123`.
- **Demo Access button**: On the login page (`/concept2cure/login`), a "Demo Access" button appears in dev mode — clicking it opens a persona picker for quick MFA-free login.
- **drizzle-kit push may fail**: The full Drizzle schema has FK reference issues (`cdisc_cdash_forms`). Use `npm run db:ensure` (`npx tsx server/db/ensureCoreTables.ts`) instead to create tables.
- **Vitest full suite is slow**: The 100+ test files with `singleFork` mode can take 10+ minutes. Run targeted test files via `npx vitest run <path>` for faster iteration.
- **.npmrc has `save=false`**: When installing new packages, use `npm install --save <pkg>` explicitly or they won't be written to `package.json`.
- **PostgreSQL version**: The VM has PostgreSQL 16 (not 15 as referenced in some scripts). Adjust `pg_ctlcluster` version numbers accordingly.
- **pgvector**: Must be built from source. Installed at `/tmp/pgvector-build` or via `git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git`.
- **Frontend error boundary**: After login, you may see `ReferenceError: Cannot access 'projectArtifacts' before initialization` — this is a pre-existing circular dependency in `ZenApp.tsx`, not caused by environment setup.
