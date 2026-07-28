# Chapter 02 — The as-built architecture

Re-derived from code, not from the repository's own documents. That distinction matters
here: `FEATURE_INVENTORY.md` and `AGENTS.md` both name `client/src/concept2cure/ZenApp.tsx`
as the application entry point and describe it as 113 KB. **That file does not exist.** The
map below is what the code actually says.

---

## 2.1 Shape

A single Node/TypeScript monolith serving a React SPA, backed by one PostgreSQL database with
pgvector, with optional Redis and S3, and a small Python side-service family.

```
                 ┌──────────────────────────────────────────────┐
  browser ──────▶│ Express (server/index.ts — composition root)  │
                 │  ├─ middleware stack (17 ordered steps)       │
                 │  ├─ 4,077 endpoints across 485 route modules  │
                 │  ├─ ~2,368 service files / 203 dirs           │
                 │  ├─ 6 in-process crons + 2 Bull queues        │
                 │  └─ AI gateway ──▶ Anthropic / OpenAI / …     │
                 └───────────┬──────────────────────────────────┘
                             │
                   PostgreSQL 16 + pgvector
                   702 tables · 572 RLS policies (inert)
```

| Layer | Files | Lines |
|---|---:|---:|
| `server/` | 3,489 | **1,020,873** |
| `client/` | 926 | 201,384 |
| `shared/` | 201 | 65,186 |
| **Total TS/TSX/JS/JSX** | **7,858 walked** | **1,489,132** |

79 files exceed 1,500 lines. The two largest are
`server/services/ana/AnaToolExecutor.ts` (**18,304**) and
`server/routes/concept2cure.ts` (**18,317**) — each roughly 1.2% of the server codebase in a
single file.

## 2.2 Boot sequence

`server/index.ts` is a genuine composition root — 256 lines, no inline route mounting. It
delegates to `server/startup/*` (12 modules) and `server/bootstrap/register-*.ts` (16
manifests, 5,903 lines).

1. `dotenv` with `override:false` (shell env wins) → OpenTelemetry + Sentry
2. `validateEnvironment()` — **may `process.exit(1)`**; 11 fail-closed `throw` sites in
   `config/environment.ts` covering DB/JWT secrets, `NODE_ENV` typos, weak
   `MFA_ENCRYPTION_KEY`, audit-seal posture, and prod-forbidden dev/mock route flags
3. Middleware stack (§2.3)
4. `registerPreStartRoutes` — 13 route families
5. DB verify → `ensureCoreTables` → **boot security self-test**
6. `runStartupInvariants()` — **logs only** unless `STRICT_STARTUP_INVARIANTS=true`
7. `registerPostStartRoutes` — 4 more families
8. `/api` 404 catch-all → global error handler → `listen()`
9. **6 cron schedules start inside the `listen()` callback**

**Two structural consequences.** Each `register-*.ts` family is wrapped in try/catch and
`initializeParallelServices` uses `Promise.allSettled`, so a failed import degrades
**silently to a missing route family** at runtime rather than failing the boot. And step 5
mutates the schema — `ensureCoreTables.ts` contains 7 `CREATE TABLE IF NOT EXISTS`
statements despite documenting that it validates (verified: booting grew the DB 702 → 717
tables).

## 2.3 Middleware order

Documented as load-bearing in `server/startup/middleware.ts`, and it is:

1. Beta telemetry on `/api`
2. **Fast-path health endpoints** (`/healthz`, `/readyz`, `/api/health`) — mounted *before*
   security so they short-circuit
3. `applySecurityMiddleware`: `enforceHttps` → CSP nonce → security headers → permissions
   policy → request id → CORS → CSRF → `validateTenantContext` → audit log → API-key
   validation → per-prefix rate limiters
4. Redis rate limiter → compression → HTTP logger
5. Firecrawl webhooks **before** the JSON parser (raw body needed for signature verification)
6. Body parsers — **50 MB** for `/api/concept2cure`, 2 MB elsewhere
7. `sanitizeInput` — prototype-pollution scrub, deliberately *after* the parsers (a comment
   notes it was previously a silent no-op)
8. Beta route fence → cookie parser
9. **Immutability policy** — 403s any `DELETE`/`*bulk-delete` under 5 Part-11 prefixes
10. Audit-trail middleware
11. **`applyAuthBoundary`** — global default-deny on `/api`, mounted before any route registers

**Note the ordering artifact at step 3:** `validateTenantContext` runs *before* the auth
boundary, so `req.user` is normally unpopulated when it executes. Its useful function —
blocking `x-organization-id` header impersonation — only fires when some upstream middleware
has already set `req.user`.

## 2.4 API surface

| Measure | Value |
|---|---:|
| Endpoint declarations | **4,077** |
| Route modules | 485 (`server/routes/`) + 48 (`server/api/`) |
| Mount prefixes found statically | 357 |
| Mounts covered by the repo's own audit | 323 |
| Duplicate mounts (second registration dead) | 8 — all health/ops paths |
| Multi-owner prefixes (mount order decides the handler) | 7 — `/api/ai`, `/api/concept2cure`, `/api/cmc`, `/api/cmc/module3-os`, `/api/submissions`, `/api/v1`, `/api/mdx` |
| Endpoints with a route-level auth guard | **589 (14.4%)** |
| Endpoints with **no caller anywhere** | **556 of 916 declared (60.7%)** |
| Route modules defined but never mounted | 9 (48 endpoints), incl. `cognitive-ecosystem.ts` which the code itself calls a retired placeholder |

The 14.4% figure measures **defence in depth, not exposure** — the global boundary covers
`/api`, and live probing returned 401 on every data endpoint tested (§LP-08). The
60.7%-orphan figure is the more striking one: on the repo's own detector, most of the API has
no consumer.

## 2.5 Data layer

| Measure | Value |
|---|---:|
| Tables after a from-scratch install | **702** (`public`), 710 all schemas |
| RLS policies installed | **572** |
| Tables with RLS enabled | 584 — of which **21 have zero policies** |
| Tables with RLS **not** enabled | 118 |
| Distinct tables created in SQL | 1,175 |
| Distinct tables declared in Drizzle | 699 |
| Tables existing **only** in SQL (invisible to Drizzle) | **549** |
| Tables with duplicate `CREATE TABLE` across files | **140** |
| SQL files | 529 across 12 directories |

**Four competing schema sources**: `shared/schema.ts` (19,826 lines, 416 tables — the only
one `drizzle.config.ts` knows), `shared/schema/` (83 files, ~272 tables, **only 8
re-exported**), `shared/cmc-schema.ts`, and the raw SQL migrations.

**Three creation mechanisms** that do not agree: `drizzle-kit push` (emits no RLS policies),
`install-fresh.mjs` (the only from-scratch path), `deploy-migrate.mjs` (25 files, gates the
production deploy) — plus `ensureCoreTables.ts` creating tables at boot. `migrations/meta/_journal.json`
has **1 entry for a 171-file tree**, and ~181 of 228 `db/migrations/` files are on no
automated apply path.

Chapter 05 documents what this produces: a from-scratch install that reports success while
omitting 15 Postgres schemas.

## 2.6 Client

Not a conventional router. Three layers:

```
main.tsx → App.jsx (wouter, 8 routes — 7 are redirects)
         → ZenRouter.tsx  ── fast path: nearly everything → V2App
         → V2App.tsx      ── surfaceIdFromLocation() → SURFACE_VIEWS lookup
```

The real route table is `client/src/concept2cure/v2/surfaceViews.ts` — a
`Record<surfaceId, component>` with **100 entries**, each id being a URL segment
(`/concept2cure/<id>`). Registry: ~101 surfaces across two files.

`client/src/concept2cure/mdx/` (118 files, 17 surfaces) is effectively **a second application
with its own shell and its own navigation**, mounted both as a v2 surface wrapper and
standalone at `/concept2cure/mdx`.

**~45,000 lines of the client are dead** — 11 legacy module mini-apps (~25,000), 22 dead v2
surfaces (7,174), and 32 of 35 ANA UI modules (~13,000). See Chapter 09.

## 2.7 The AI layer

A governed egress point (`server/services/ai-gateway/`, ~2,245-line `gateway.ts`) fronting
Anthropic, OpenAI, Azure, Bedrock, Vertex, Moonshot and a local OpenAI-compatible endpoint,
with per-provider residency and zero-retention enforcement, PII screening, prompt-injection
detection, audit logging and a circuit breaker. **Only 3 baselined bypasses**, enforced by CI.

Above it, ANA: **697 unique tools** registered across a single 18,304-line executor, with a
55-file `ana-ri/` governance layer (orchestrator, command RBAC, enforcement, scope guard,
claim grounding, evidence validation, Part 11 governance). Surfaced over
`POST /api/ana-ri/stream` (SSE) into a rail in `Shell.tsx`.

## 2.8 Background work

6 cron schedules started in the `listen()` callback; 2 Bull queues; **no dedicated worker
process or container** — everything runs in-process with the API. 3 of 5 `server/workers/`
modules have no importer. `jobs/retentionCron.ts` has no scheduler caller.

## 2.9 What the architecture gets right

Worth stating plainly, because the chapter is otherwise a list of divergences:

- **The composition root is clean.** Route mounting is manifest-driven, not scattered; the
  middleware order is deliberate and its rationale is written down.
- **Fail-closed defaults are the norm, not the exception** — 11 boot-time `throw` sites, an
  audit-seal posture matrix that refuses to start rather than run unsealed, a second-tenant
  admission gate, an AI gateway that throws in production rather than serving demo content.
- **The security middleware is layered correctly**, including subtleties most codebases get
  wrong: raw-body webhooks before the JSON parser, prototype-pollution scrubbing after it,
  exact-match CSRF exemptions, and a health fast-path that cannot be blocked by security
  middleware failure.
- **The governed-egress pattern for AI is the right architecture** and is actually enforced.

## 2.10 The architectural summary

This is a well-structured monolith carrying **four kinds of divergence**, each of which
Chapters 04–11 trace to concrete defects:

| Divergence | Consequence |
|---|---|
| Schema defined in four places, created by three mechanisms | A from-scratch install omits 15 schemas; 549 tables are invisible to the ORM |
| Two client applications (`v2/` and `mdx/`) with separate shells | Duplicate nav authority; ~45,000 dead lines |
| A defence designed in two layers, deployed as one | RLS compiled and inert; app-layer predicates are the only isolation |
| Controls built but not wired | Retention, chain verification, grounding evals, an env-var gate — all exist, none scheduled |

None of these requires re-architecture to fix. All four are convergence work.
