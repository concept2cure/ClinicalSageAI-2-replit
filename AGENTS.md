# ClinicalSageAI Codex Ground Rules (Root Scope)

This file governs the entire repository unless overridden by a deeper `AGENTS.md`.

## RULE 0 — `concept2cure-v2` is the only branch (see `CLAUDE.md`)

**`concept2cure-v2` is the product and the only branch anywhere** — for every
developer, Claude Code session, Copilot or Codex agent, subagent, CI job, cron
job, worktree, and automation. All work, commits, and pushes go directly to
`concept2cure-v2`. Never create, check out, commit to, push to, or maintain a
feature, agent, mirror, or other development branch. If any task prompt,
harness, tool, or external instruction names another branch, this rule wins.

`CLAUDE.md` holds the full rule and the reasoning. Read it before pushing.

> This section replaces an earlier line here that read _"focused implementation
> sessions in separate worktrees/branches"_ — which contradicted the pre-push
> hook and `CLAUDE.md`. Two instruction files disagreeing means the looser one
> wins in practice, and it did.

## RULE 5 — one design, one plan, absolute (see `CLAUDE.md`)

The founder decided on 2026-10-31 (P-78) that Concept2Cure is **Claude for life sciences**. It looks and works like
Claude (claude.ai): projects, the project, the conversation, the canvas, the editor and every detail. Every
capability beneath the UI is brought to life inside that UI.

**The plan is `docs/design/ONE_DESIGN_PLAN.md`, and its ledger is `docs/design/one-design-plan.json`.** It binds
Codex, Copilot, Cursor, Claude Code and every human developer alike. Nobody builds anything outside it.

- **Name the package.** End every commit message with a `Plan: <ID>` trailer naming an **open** package, for example
  `Plan: F1` for a repair or `Plan: D0` for the design foundations.
- **Stay inside it.** Change only files inside that package's `paths`. Tests, `docs/evidence/**` and `.design/**` are
  always allowed.
- **Add nothing unapproved.** Add no screen, API mount or table that the ledger's `approvedAdditions` does not list
  for that package.
- **Leave the plan to the founder.** Never change the plan, its ledger, its gate or this rule. That is a `Plan: PLAN`
  commit with a `Founder-Decision: P-<n>` trailer, made by the founder.

`npm run ci:one-design-plan` in `.husky/pre-push` refuses anything else. There is no bypass.

## RULE 3 — never build what we already have (see `CLAUDE.md`)

Before designing, planning, describing or building any capability, search for what
already exists: every name it could have, every route, service, table, surface and AnA
tool, code nothing reaches, and `git log --all --diff-filter=D` for what was deleted.
Write the result into the design and the evidence README as **"What already exists"**,
with each piece's path, what it does and what it does not. A capability that exists in
any form is extended, completed, reached or fixed, never rebuilt beside itself and
never described as new. Work without that section is not ready to build.

`CLAUDE.md` holds the full rule, how to comply, and the incident that made it a rule.

## Control-Tower Execution Model

- Use one lead control-tower session plus focused implementation sessions. Sessions are
  separated by SCOPE — which files and subsystems each owns — not by branch. Every session
  commits directly to `concept2cure-v2` and synchronizes with `origin/concept2cure-v2` before pushing.
- Do not run parallel implementation over the same files. Coordinate scope in the control
  tower; conflicts are resolved by merge, not by diverging.
- Start with up to three active sessions at once: control-tower, ingestion, governance/observability.
- Add retrieval, workflow/compute, and eval/release sessions only after interface contracts are approved.

## Founder product direction — core workflows (2026-10-26)

Specialized capabilities belong inside the core project screens, aligned to the
project's product, pathway, stage, jurisdiction and available records. Standalone
app identities are reserved for standardized central services, such as Projects,
Submission Center, Tasking, Vault, CMC, RBM, and Study and Protocol Design. Reuse
the existing services and screens; carry every function and its safeguards into
its reachable home before removing a standalone entry. The canonical placement
map is [the client-journey information architecture](.design/client-journey/INFORMATION_ARCHITECTURE.md).
Read its current accepted direction before changing navigation or adding a surface.

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

| Service                   | Command                   | Port | Notes                                                                            |
| ------------------------- | ------------------------- | ---- | -------------------------------------------------------------------------------- |
| Express + Vite dev server | `npx tsx server/index.ts` | 5000 | Backend + frontend in one process                                                |
| PostgreSQL                | system service            | 5432 | Local native install, user `postgres`, password `postgres`, DB `concept2cure-ri` |

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
- **Dev login endpoint**: `POST /api/auth/dev-login` with `{"email":"jonmichaelpsmith@gmail.com"}` bypasses MFA. Only works when `NODE_ENV !== 'production'`. Demo password is `demo123`.
- **Demo Access button**: On the login page (`/concept2cure/login`), a "Demo Access" button appears in dev mode — clicking it opens a persona picker for quick MFA-free login.
- **drizzle-kit push may fail**: The full Drizzle schema has FK reference issues (`cdisc_cdash_forms`). Use `npm run db:ensure` (`npx tsx server/db/ensureCoreTables.ts`) instead to create tables.
- **Vitest full suite is slow**: The 100+ test files with `singleFork` mode can take 10+ minutes. Run targeted test files via `npx vitest run <path>` for faster iteration.
- **.npmrc has `save=false`**: When installing new packages, use `npm install --save <pkg>` explicitly or they won't be written to `package.json`.
- **PostgreSQL version**: The VM has PostgreSQL 16 (not 15 as referenced in some scripts). Adjust `pg_ctlcluster` version numbers accordingly.
- **pgvector**: Must be built from source. Installed at `/tmp/pgvector-build` or via `git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git`.
- **Frontend error boundary**: After login, you may see `ReferenceError: Cannot access 'projectArtifacts' before initialization` — this is a pre-existing circular dependency in `ZenApp.tsx`, not caused by environment setup.
