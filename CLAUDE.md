# CLAUDE.md — Claude Code Instructions for ClinicalSageAI

## Branch Rules (NON-NEGOTIABLE)

**All work happens on `concept2cure-v2`. No exceptions.**

```bash
# First thing every session:
git checkout concept2cure-v2
git pull origin concept2cure-v2
```

- **DO NOT** create `claude/*` branches
- **DO NOT** open PRs from `claude/*` branches to `main`
- **DO NOT** push to `main` directly
- Commit and push only to `concept2cure-v2`
- PRs go from `concept2cure-v2` → `main`

If Claude Code's session automation creates a `claude/*` branch, switch back immediately:
```bash
git checkout concept2cure-v2
```

### Why This Exists
Claude Code previously created 5+ orphaned `claude/*` branches, causing work to go missing
and bypassing the `concept2cure-v2` → `main` pipeline. This rule prevents that.

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
- **Backend**: Express, Drizzle ORM, PostgreSQL (Neon)
- **Auth**: JWT + bcrypt + MFA (TOTP), session validation
- **AI**: Anthropic Claude (primary), OpenAI (fallback), AI gateway routing
- **Build**: Vite (client), tsx (server dev), esbuild (server prod)

## Common Commands

```bash
npm run dev              # Start dev server (client + server)
npm run db:push          # Push schema changes to database
npm run db:ensure        # Ensure core tables exist
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

## Testing

```bash
npm run test             # Run vitest suite
npm run typecheck        # TypeScript type checking
```

## Security Rules

- Never commit `.env` files or API keys
- All auth routes enforce bcrypt password hashing
- Account lockout after 5 failed login attempts (15-min lock)
- JWT tokens expire in 24h, refresh tokens in 7d
- MFA (TOTP) is supported and should not be removed
