# CLAUDE.md — Claude Code Instructions for ClinicalSageAI

> This file is automatically read by Claude Code at the start of every session.
> These rules are NON-NEGOTIABLE and must be followed in every session.

## Branch Rules (NON-NEGOTIABLE)

Claude Code MUST NOT create its own `claude/*` branches. All work goes through the established pipeline.

### Correct Pipeline

```
concept2cure-v2  →  (PR)  →  main
```

- **`main`** = live production app. NEVER commit directly.
- **`concept2cure-v2`** = the single development branch. ALL work happens here.
- **`claude/*` branches** = FORBIDDEN. Do not create them. Ever.

### Mandatory Steps at the Start of EVERY Session

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

If `git checkout concept2cure-v2` fails, stop and tell the user — do NOT create a new branch.

### Forbidden Actions

| Action | Why |
|--------|-----|
| `git checkout -b claude/*` | Creates orphaned branches that bypass the product pipeline |
| `git checkout -b feature/*` | Same problem — any new branch is forbidden |
| Committing directly to `main` | Bypasses the development pipeline |
| Opening a PR to `main` from anything other than `concept2cure-v2` | Breaks the merge flow |

### Allowed Git Operations

```bash
git checkout concept2cure-v2
git pull origin concept2cure-v2
git add <files>
git commit -m "feat: description"    # conventional commits
git push origin concept2cure-v2
```

### Why This Exists
Claude Code previously created 5+ orphaned `claude/*` branches, causing work to go missing
and bypassing the `concept2cure-v2` → `main` pipeline. This rule prevents that.

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

When the user asks you to open a PR:
- **From**: `concept2cure-v2`
- **To**: `main`
- **Title**: conventional commit style, e.g. `feat: add CSR knowledge database schema`
- **Never** open a PR from a `claude/*` branch
