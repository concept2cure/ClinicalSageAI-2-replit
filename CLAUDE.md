# CLAUDE.md — Claude Code Instructions for Concept2Cure.RI

> This file is automatically read by Claude Code at the start of every session.
> These rules are NON-NEGOTIABLE and must be followed in every session.

## Branch Rules (NON-NEGOTIABLE)

**`concept2cure-v2` is the ONE AND ONLY branch.** It is the production branch, the development branch, and the source of truth. There is no other branch that matters.

### Branch Model

- **`concept2cure-v2`** = the sole production + development branch. ALL work happens here. ALL commits land here.
- **`main`** = deprecated legacy branch. Do NOT use, do NOT target, do NOT merge to/from.
- **`claude/*` branches** = FORBIDDEN. Do not create them. Ever.
- **`feature/*` branches** = FORBIDDEN. Do not create them. Ever.

### Mandatory Steps at the Start of EVERY Session

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

If `git checkout concept2cure-v2` fails, stop and tell the user — do NOT create a new branch.

### Forbidden Actions

| Action | Why |
|--------|-----|
| `git checkout -b claude/*` | Creates orphaned branches — all work goes to `concept2cure-v2` |
| `git checkout -b feature/*` | Same problem — no branch creation allowed |
| `git checkout main` | `main` is deprecated — never switch to it |
| Committing to any branch other than `concept2cure-v2` | There is only one branch |
| Opening PRs to `main` | `main` is not the target anymore |

### Allowed Git Operations

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
git add <files>
git commit -m "feat: description"    # conventional commits
git push origin concept2cure-v2
```

### Why This Exists
`concept2cure-v2` is the core and only product branch. All previous branching strategies
(`main`, `claude/*`, `feature/*`) caused work to go missing. One branch, one truth.

---

## Project Overview

ClinicalSageAI is an enterprise regulatory intelligence platform for life sciences (FDA, EMA).
- **Frontend**: React + TypeScript + Vite (in `client/`)
- **Backend**: Express + TypeScript (in `server/`)
- **Database**: PostgreSQL via Drizzle ORM (schema in `shared/schema/`)
- **AI**: Claude API primary, OpenAI fallback via AI gateway (`server/services/ai-gateway/`)

## Key Directories

```
client/src/concept2cure/     # Main app shell (ZenApp.tsx), auth, components
client/src/components/       # Shared UI components
server/routes/               # Express route handlers
server/services/             # Business logic, AI engines, knowledge graphs
shared/schema/               # Drizzle ORM schemas (source of truth for DB)
shared/types/                # TypeScript type definitions
migrations/                  # SQL migration files
scripts/                     # Dev/deploy/seed scripts
```

## Tech Stack

- **Runtime**: Node.js >= 20, ESM modules (`"type": "module"`)
- **Frontend**: React 18, TanStack Query, Tailwind CSS, Radix UI
- **Backend**: Express, Drizzle ORM, PostgreSQL (Neon/pgvector)
- **Auth**: JWT + bcrypt + MFA (TOTP), session validation
- **AI**: Anthropic Claude (primary), OpenAI (fallback), AI gateway routing
- **Build**: Vite (client), tsx (server dev), esbuild (server prod)

## Common Commands

```bash
npm run dev              # Start dev server (client + server)
npm run db:push          # Push schema changes to database
npm run db:ensure        # Ensure core tables exist
npm run test             # Run vitest suite
npm run typecheck        # TypeScript type checking
```

## Do NOT Rebuild These (They Already Exist)

- **Auth system**: `server/routes/auth.ts` + `client/src/concept2cure/auth/`
- **Login UI**: `client/src/concept2cure/auth/ZenLogin.tsx`
- **AI gateway**: `server/services/ai-gateway/gateway.ts`
- **Chat/AnA panel**: `client/src/concept2cure/components/chat/ZenChat.tsx`
- **Client portal**: `client/src/components/client-portal/`

If you think something needs rebuilding, **ask the user first**.

## Code Standards

- TypeScript strict mode — no `any` unless unavoidable
- All DB access is tenant-scoped (multi-tenant SaaS)
- All mutations must be auditable (regulatory compliance)
- No mock data in production paths — if a feature exists, it must use real DB queries
- No `Coming Soon` placeholders — either implement it or don't add the route
- Prefer Drizzle ORM query builder over raw SQL
- Use the AI gateway (`server/services/ai-gateway/`) instead of direct OpenAI/Anthropic calls

## Schema Changes

1. Create a new migration file in `migrations/` (numbered sequentially)
2. Update the Drizzle schema in `shared/schema/`
3. Export new tables from `shared/schema/index.ts`
4. Run `npm run db:push` to apply

## Security Rules

- Never commit `.env` files or API keys
- All auth routes enforce bcrypt password hashing
- Account lockout after 5 failed login attempts (15-min lock)
- JWT tokens expire in 24h, refresh tokens in 7d
- MFA (TOTP) is supported and should not be removed

## File Operation Rules

### NEVER ask for confirmation before:
- Modifying, deleting, moving, or renaming existing files
- All git operations (add, commit, push, pull)

### ALWAYS ask for confirmation before:
- Creating a file that has never existed before in the repository

## Pull Request Rules

PRs are generally not needed since `concept2cure-v2` is the single branch. If the user
explicitly asks to open a PR (e.g., for code review purposes):
- **From**: `concept2cure-v2`
- **Title**: conventional commit style, e.g. `feat: add CSR knowledge database schema`
- **Never** open a PR from or to `main` — it is deprecated
- **Never** open a PR from a `claude/*` branch

---

## Regulatory Intelligence Model (RIM) — System Rules

RIM is Concept2Cure's proprietary, non-LLM intelligence layer. It sits on top of LLMs
and accumulates regulatory judgment over time. It is NOT a model to train — it is a
structured, versioned, compounding intelligence system.

### Architecture

```
server/services/intelligence/
├── judgment-framework.ts      # 6 codified scoring models
├── pattern-registry.ts        # Regulatory prior knowledge (seed + learned)
├── signal-capture.ts          # Two-layer signal accumulation
├── rim.ts                     # Central orchestrator
├── rim-interceptors.ts        # Auto-capture at chat, compliance, artifact points
├── rim-change-impact.ts       # Version impact review enrichment
├── rim-cross-artifact.ts      # Cross-document intelligence
└── index.ts                   # Barrel export
```

### System Invariants (MUST HOLD)

1. **Persistence is source of truth** — memory is cache only
2. **Every signal has provenance** — `judgmentFrameworkVersion`, `patternRegistryVersion`, `runId`
3. **Every signal is anchored** — `projectId`, `artifactId`, `artifactVersionId`, `sectionCode`, `runId`
4. **No silent persistence failure** — runs marked `degraded` if persistence fails
5. **Trends include confidence** — `TrendConfidence: high | moderate | low | insufficient`
6. **Interceptors are non-blocking** — NEVER slow down the primary pipeline

### Do NOT

- Build or fine-tune an LLM
- Create analytics dashboards for RIM signals
- Introduce model training pipelines
- Duplicate existing intelligence services
- Expose RIM scores directly to end users (internal intelligence only)

### Do

- Extend existing services in `server/services/intelligence/`
- Add new seed patterns to `pattern-registry.ts` when real deficiency patterns are identified
- Wire new analysis endpoints through interceptors for signal capture
- Use `enrichChangeImpact()` to surface RIM intelligence in version impact review
- Bump version constants when scoring logic or patterns change

### Version Constants

When modifying scoring logic or patterns, bump the corresponding version:
- `JUDGMENT_FRAMEWORK_VERSION` in `judgment-framework.ts`
- `PATTERN_REGISTRY_VERSION` in `pattern-registry.ts`
- `RIM_VERSION` in `rim.ts`
