# CLAUDE.md — Claude Code Instructions for Concept2Cure.RI

> This file is automatically read by Claude Code at the start of every session.
> These rules are NON-NEGOTIABLE and must be followed in every session.
> Last consolidated: 2026-03-24

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

ClinicalSageAI is an enterprise regulatory intelligence platform for life sciences (FDA, EMA, PMDA, Health Canada).
- **Frontend**: React + TypeScript + Vite (in `client/`)
- **Backend**: Express + TypeScript (in `server/`)
- **Database**: PostgreSQL via Drizzle ORM (schema in `shared/schema/`)
- **AI**: Claude API primary, OpenAI fallback via AI gateway (`server/services/ai-gateway/`)
- **Phase**: Consolidation-to-production — hardened, governed, audited systems

## Key Directories

```
client/src/concept2cure/             # Main app shell (ZenApp.tsx), auth, 58 component dirs
client/src/concept2cure/auth/        # Auth module (ZenLogin, MFA, session)
client/src/concept2cure/components/  # All feature UI (editor, chat, projects, regulatory, etc.)
client/src/components/               # Shared UI components, client portal
server/routes/                       # Express route handlers (240+ files)
server/services/                     # Business logic (40+ subdirectories, 200+ files)
server/services/intelligence/        # RIM — Regulatory Intelligence Model (core IP)
server/services/ai-gateway/          # AI provider routing (Claude primary, OpenAI fallback)
server/services/cortex/              # CORTEX Prime — AI Brain, knowledge atoms, threads
server/services/foresight/           # Foresight — predictive analytics engine (75KB)
server/services/csr/                 # CSR builder + knowledge extraction
server/services/cognitive-ecosystem/ # LangGraph workflows
shared/schema/                       # Drizzle ORM schemas (source of truth for DB)
shared/types/                        # TypeScript type definitions
migrations/                          # SQL migration files (0000–0010+)
scripts/                             # Dev/deploy/seed scripts (50+)
tests/                               # Vitest + Jest test suite (114 files)
docs/                                # Comprehensive documentation (60+ subdirs)
```

## Monolithic Files (Be Aware)

These files are very large. Read only the section you need, never the whole file:

| File | Size | Notes |
|------|------|-------|
| `server/index.ts` | 285KB | Main Express app — all middleware/routes mounted here |
| `server/routes/concept2cure.ts` | 429KB | Core product routes — monolithic |
| `server/routes/authoring.router.ts` | 174KB | Authoring workflow routes |
| `client/src/concept2cure/ZenApp.tsx` | 113KB | Main React app shell |
| `server/services/lumen-context-builder.ts` | 91KB | Context assembly for AI |
| `server/services/intelligent-report-engine.ts` | 106KB | Report generation |
| `server/services/foresight/foresight-ai-engine.ts` | 75KB | Predictive analytics |
| `server/services/precedent-engine.ts` | 60KB | Regulatory precedent |
| `shared/schema/schema.ts` | 730KB | Legacy monolithic schema backup |

## Tech Stack

- **Runtime**: Node.js >= 20, ESM modules (`"type": "module"`)
- **Frontend**: React 18, TanStack Query, Tailwind CSS, Radix UI (30+ packages)
- **Backend**: Express, Drizzle ORM, PostgreSQL (Neon/pgvector)
- **Auth**: JWT + bcrypt + MFA (TOTP), session validation, account lockout
- **AI**: Anthropic Claude (primary), OpenAI (fallback), LangChain, AI gateway routing
- **Real-time**: Socket.io for live updates
- **Jobs**: Bull queue + Redis (ioredis)
- **Storage**: AWS S3 (`@aws-sdk/client-s3`)
- **Payments**: Stripe
- **Email**: SendGrid + Nodemailer
- **Monitoring**: Sentry (Node + React), Prometheus metrics
- **Build**: Vite (client), tsx (server dev), esbuild (server prod)
- **Testing**: Vitest + Jest, Playwright (E2E)

## Common Commands

```bash
npm run dev              # Start dev server (client + server)
npm run db:push          # Push schema changes to database
npm run db:ensure        # Ensure core tables exist
npm run test             # Run vitest suite
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint
npm run build            # Production build (Vite + esbuild)
```

---

## Do NOT Rebuild These (They Already Exist)

- **Auth system**: `server/routes/auth.ts` (49KB) + `server/routes/authEnterprise.ts` (22KB) + `client/src/concept2cure/auth/`
- **Login UI**: `client/src/concept2cure/auth/ZenLogin.tsx`
- **AI gateway**: `server/services/ai-gateway/gateway.ts` — routes between Claude and OpenAI
- **Chat/AnA panel**: `client/src/concept2cure/components/chat/ZenChat.tsx` + `AnaPersistentPanel.tsx`
- **Client portal**: `client/src/components/client-portal/`
- **Document editor**: `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` + extensions
- **CORTEX Prime**: `server/services/cortex/cortexPrimeService.ts` (35KB) — knowledge atoms, threads, agents
- **Foresight engine**: `server/services/foresight/foresight-ai-engine.ts` (75KB) — predictive analytics
- **CSR builder**: `server/services/csr/csr-builder.ts` + `csr-extractor-service.ts`
- **RIM intelligence layer**: `server/services/intelligence/` (entire directory)
- **Authoring actions**: `server/routes/authoring-actions.ts` — governed, Wave 2 hardened
- **AnA 1.0 RI routes**: `server/routes/ana-ri.ts` — regulatory intelligence orchestration
- **Kernel/control plane**: `server/services/kernel-*.ts`, `server/src/control-plane/kernel.ts`
- **Memory context assembler**: `server/services/memory-context-assembler.ts` — 3-layer AI context injection
- **Working memory**: `server/services/working-memory.ts` — thread-level memory
- **Shared memory pool**: `server/services/shared-memory-contract.ts` — supersession lifecycle

If you think something needs rebuilding, **ask the user first**.

---

## Code Standards

- TypeScript strict mode — no `any` unless unavoidable
- All DB access is tenant-scoped (multi-tenant SaaS)
- All mutations must be auditable (regulatory compliance, 21 CFR Part 11)
- No mock data in production paths — if a feature exists, it must use real DB queries
- No `Coming Soon` placeholders — either implement it or don't add the route
- Prefer Drizzle ORM query builder over raw SQL
- Use the AI gateway (`server/services/ai-gateway/`) instead of direct OpenAI/Anthropic calls
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`

## Schema Changes

1. Create a new migration file in `migrations/` (numbered sequentially, currently at 0010+)
2. Update the Drizzle schema in `shared/schema/`
3. Export new tables from `shared/schema/index.ts`
4. Run `npm run db:push` to apply

## Security Rules

- Never commit `.env` files or API keys
- All auth routes enforce bcrypt password hashing
- Account lockout after 5 failed login attempts (15-min lock)
- JWT tokens expire in 24h, refresh tokens in 7d
- MFA (TOTP) is supported and should not be removed
- Helmet for security headers, express-rate-limit for rate limiting

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

## Core Architecture Systems

### 1. AnA 1.0 RI (Regulatory Intelligence Assistant)

AnA is the user-facing AI assistant with persona-based routing and regulatory intelligence.

**Key files**:
- `server/routes/ana-ri.ts` — RI orchestration routes
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — persistent chat UI
- `server/routes/chat.ts` (39KB) — chat infrastructure

**Rules**:
- AnA interceptors feed into RIM (non-blocking)
- Persona routing is governed — don't bypass it
- Chat context uses the 3-layer memory assembler (working + project + client memory)

### 2. Kernel / Control Plane (Recently Added)

Microkernel architecture for goal planning, decision records, and adaptive policy.

**Key files**:
- `server/services/kernel-*.ts` — goal planner, decision records, adaptive policy, router
- `server/src/control-plane/kernel.ts` — control plane microkernel
- `db/migrations/20260324_ai_kernel_*.sql` — kernel DB schema

**Rules**:
- Decision records are append-only (audit trail)
- Adaptive policy outcomes must be traceable
- Goal planner supports replanning — don't flatten to single-shot

### 3. Memory System (3-Layer Architecture)

```
Layer 1: Working Memory     — thread-level, volatile (working-memory.ts)
Layer 2: Project Memory     — semantic search in projectMemoryEntries
Layer 3: Client Memory      — account-level intelligence
```

**Key files**:
- `server/services/memory-context-assembler.ts` — assembles all 3 layers for AI context
- `server/services/working-memory.ts` — thread-level working memory
- `server/services/client-intelligence-memory.ts` — account-level memory
- `server/services/shared-memory-contract.ts` — shared memory pool, supersession lifecycle

**Rules**:
- Structured forgetting: old entries dropped unless critical/verified
- Deduplication by title + content prefix
- Respect maxChars while prioritizing high-value atoms
- Shared memory pool uses supersession lifecycle — don't break the contract

### 4. Document Authoring (Wave 2 Hardened)

**Key files**:
- `server/routes/authoring.router.ts` (174KB) — authoring workflow
- `server/routes/authoring-actions.ts` — governed AI actions
- `client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx` — editor
- Editor extensions: AI Autocomplete, Citations, ReviewMode, ComplianceScannerPanel

**Rules**:
- Actions are governed — don't bypass escalation gating
- Document mode system has canonical lock toggle
- Context packing for authoring uses lumen-context-builder

### 5. Submission Workflow

**Key files**:
- `server/services/submission-twin-service.ts` (51KB) — submission simulation
- `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`
- `client/src/concept2cure/components/workflow/DossierMap.tsx`
- `client/src/concept2cure/components/workflow/ProjectHomeDashboard.tsx`
- `client/src/concept2cure/components/workflow/SectionWorkspace.tsx`

---

## Regulatory Intelligence Model (RIM) — System Rules

RIM is Concept2Cure's proprietary, non-LLM intelligence layer. It sits on top of LLMs
and accumulates regulatory judgment over time. It is NOT a model to train — it is a
structured, versioned, compounding intelligence system.

### Architecture

```
server/services/intelligence/
├── rim.ts                          # Central orchestrator (v1.1.0)
├── judgment-framework.ts           # 6 codified scoring models (v1.1.0)
├── pattern-registry.ts             # Regulatory prior knowledge — seed + learned (v1.1.0)
├── signal-capture.ts               # Two-layer signal accumulation (500 max/project)
├── rim-interceptors.ts             # Auto-capture: chat, compliance, artifact, feedback
├── rim-integration.ts              # Reusable RIM entry point (provenance builder)
├── rim-change-impact.ts            # Version impact review enrichment
├── rim-cross-artifact.ts           # Cross-document systemic intelligence
├── evidence-confidence-model.ts    # Evidence chain building + confidence scoring
├── learning-loop-service.ts        # Closed feedback loop (accept/dismiss/resolve/override)
├── project-intelligence-service.ts # Profile + memory management (continuity object)
├── readiness-scoring-engine.ts     # Readiness dimensions + module scoring
├── recommendation-engine.ts        # Next-best action generation
├── cross-module-intelligence.ts    # Module relationship analysis
├── next-best-action-engine.ts      # Action generation engine
└── index.ts                        # Barrel export (ALL public API here)
```

### Judgment Framework — 6 Codified Models

| Model | Weight | Purpose |
|-------|--------|---------|
| Evidence Sufficiency | 25% | Is the evidence base strong enough? |
| Defensibility | 20% | Can it withstand regulatory scrutiny? |
| Reviewer Sensitivity | 15% | Likelihood to trigger reviewer questions? |
| Claim Risk | 15% | Are claims supportable with data? |
| Cross-Section Consistency | 10% | Internal consistency across sections? |
| Submission Risk | 15% | Overall submission risk (composite) |

### Pattern Registry — 16 Seed Patterns

Categories: `deficiency`, `reviewer_trigger`, `rejection`, `strong_language`, `weak_language`, `data_gap`, `consistency_issue`, `formatting`, `risk_signal`

Patterns are deterministic (no LLM needed). Learned patterns added via `addLearnedPattern()`.

### Signal Capture — Two Layers

- **Layer 1 (Working Memory)**: In-memory, volatile, bounded to 500/project
- **Layer 2 (Intelligence Record)**: Persisted to `projectMemoryEntries`, source of truth

Every signal carries: `signalId`, `provenance` (framework version, pattern version, runId), `riskLevel`, `score`, `confidence`

### Four Interceptors (Non-Blocking)

1. **Chat** — scan assistant messages for patterns + claim quality
2. **Compliance** — capture structured compliance scan results
3. **Artifact** — capture create/update/delete + pattern scan content
4. **Feedback** — capture user feedback (accept/reject/edit/regenerate)

### System Invariants (MUST HOLD)

1. **Persistence is source of truth** — memory is cache only
2. **Every signal has provenance** — `judgmentFrameworkVersion`, `patternRegistryVersion`, `runId`
3. **Every signal is anchored** — `projectId`, `artifactId`, `artifactVersionId`, `sectionCode`, `runId`
4. **No silent persistence failure** — runs marked `degraded` if persistence fails
5. **Trends include confidence** — `TrendConfidence: high | moderate | low | insufficient`
6. **Interceptors are non-blocking** — NEVER slow down the primary pipeline
7. **Trend detection requires min 10 signals** — only compares same-version, same-type signals

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

---

## Database Tables (Key)

| Table | Purpose |
|-------|---------|
| `projectIntelligenceProfiles` | Continuity object — learned insights, decisions, risks, open questions |
| `projectMemoryEntries` | Knowledge atoms — category, content, confidence, importance, embeddings |
| `projectIngestedDocuments` | Document tracking — what's been ingested |

**RIM-specific categories in `projectMemoryEntries`**:
- `rim_pattern_registry` — learned patterns + hit counts
- `intelligence_signal_summary` — persisted signals from RIM runs
- `recommendation_feedback` — user feedback on recommendations

---

## Project Development Phases (History)

The project has gone through systematic consolidation:

1. **Cleanup** — Eliminated alternate product universes, collapsed SaaS catalog traces
2. **Dead Code Removal** — Deleted orphaned pages, stale imports, dead routes (Batches 1-6)
3. **Sidebar Consolidation** — Collapsed from 12 items to 5
4. **Authoring Hardening** — Wave 1 + Wave 2 governed actions, escalation gating
5. **AnA 1.0 RI** — Regulatory intelligence orchestration, persona routing
6. **Kernel Architecture** — Control plane, goal planner, decision records, adaptive policy
7. **Memory & Knowledge** — Shared memory pool, supersession management, 3-layer assembler
8. **Cross-Cutting Audit** — Systematic audit of all major systems (current phase)

**Current state**: Enterprise GA hardening. Systems are audited, governed, and production-ready.

---

## Report & Output Preferences

When producing audit reports, analysis summaries, or any long-form deliverable:
- **Write the report to a file** (e.g., `docs/reports/<descriptive-name>.md`) so the user can copy the entire thing at once.
- Always tell the user the file path so they can open/copy it.
- Still provide a brief summary in chat, but the full report goes to a file.
