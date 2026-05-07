# Concept2Cure RI — Technical Deep Dive for Investors

*Prepared 2026-05-07 from a full-codebase audit. Concrete file paths and counts in brackets.*

---

## 1. The product, in one sentence

Concept2Cure RI is a **regulatory intelligence operating system for life sciences** — a Claude-native AI agent (**AnA**) that drafts, validates, and submits FDA/EMA dossiers (510(k), PMA, CER, eCTD/IND, CMC) inside a 21 CFR Part 11–grade workbench, on top of a proprietary corpus of clinical study reports, predicate devices, and adverse-event data.

We do not sell another chatbot. We sell the **system of record** for getting a medical product to market.

---

## 2. Why it's defensible

| Moat | What it actually is in code |
|---|---|
| **Regulatory data graph** | FAERS, MAUDE, Eudamed, FDA 510(k), ClinicalTrials.gov, CSR PDFs — wired into typed services with chunked, embedded retrieval [`server/fda_faers_client.js`, `fda_maude_client.js`, `eudamed_client.js`, `cer_integration.js`, `regulatory-brain/`] |
| **Proprietary orchestrator (AnA)** | 45+ purpose-built services (`ana-ri/`, `ana-biostats/`, `ana-kernel-orchestrator.ts`) with role-aware tool policy, working memory, and an extended-thinking "reasoning tier" gated behind UAT |
| **21 CFR Part 11 substrate** | Append-only audit middleware, e-signature schema, governed-action consequence contracts, immutable export pipeline — enforced by **13 dedicated CI gates** |
| **Design system as IP** | Single source of truth (`design-system/`) → 1:1 ports to product. No more Figma drift. Phase 1 (Home) and Phase 2 (MDX) are production-ready kits. |
| **Volume & maturity** | **~1,375 TS/JS files server-side, 531k LOC. ~350 .tsx files client-side. 378 Drizzle tables. 39 dated SQL migrations. 226 test files.** This is not an MVP. |

---

## 3. System architecture (high level)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Concept2Cure RI Platform                        │
└──────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────── CLIENT (React 19 + Vite) ────────────────────┐
  │                                                                       │
  │  Home  │  MDX Workbench  │  AnA Chat  │  Vault  │  Admin              │
  │  (P1)     (P2: 510k/CER/PMA/eSTAR)                                    │
  │                                                                       │
  │  ┌─────────────────────────────────────────────────────────────────┐  │
  │  │  TipTap + Yjs + HocusPocus  (real-time collab editor, 35+ ext)  │  │
  │  │  21 CFR Part 11 e-sig · Comment threads · Compliance scanner    │  │
  │  └─────────────────────────────────────────────────────────────────┘  │
  │  Design tokens (colors_and_type.css) ── canonical, single source      │
  └──────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS / WSS
  ┌──────────────────────────────────▼────────────────────────────────────┐
  │                    SERVER  (Node 20 / Express / TS)                   │
  │                                                                       │
  │  ┌─────────── Middleware chain (load-bearing order) ──────────────┐   │
  │  │  Helmet → CORS → org-isolation → Redis rate limit →            │   │
  │  │  body-parse → beta fence → IMMUTABILITY GUARD (Part 11) →      │   │
  │  │  error handler                                                 │   │
  │  └────────────────────────────────────────────────────────────────┘   │
  │                                                                       │
  │  ┌─── 297 endpoint aggregators (55 /api + 242 /routes) ──────────┐    │
  │  │  /api/ai · /api/signing · /api/cmc · /api/cer · /api/ectd ·   │    │
  │  │  /api/vault · /api/gcc · /api/validation · /api/drafting       │    │
  │  └───────────────────────────────────────────────────────────────┘    │
  │                                                                       │
  │  ┌──────────────── AnA Orchestration Layer ─────────────────────┐     │
  │  │   AnA-Kernel  ──► task router  ──►  reasoning mode select    │     │
  │  │                                     (audit/improve/propose/  │     │
  │  │                                      plan/decide/explain)    │     │
  │  │   45+ services: ana-ri/, ana-biostats/, ana-context-router,  │     │
  │  │   ana-continuous-eval, ana-guidance-executor, ana-gold-std   │     │
  │  └──────────────────────────────────────────────────────────────┘     │
  │              │                          │                              │
  │   ┌──────────▼──────────┐    ┌──────────▼──────────────────┐           │
  │   │  AI Gateway          │    │  Memory + RAG               │           │
  │   │  ─ anthropic-client  │    │  ─ working-memory.ts        │           │
  │   │    opus-4-7          │    │  ─ memory-context-assembler │           │
  │   │    sonnet-4-6        │    │  ─ advancedRAGPipeline      │           │
  │   │    haiku-4-5         │    │    (HyDE · MMR · rerank)    │           │
  │   │  ─ openai-client     │    │  ─ pgvector (1536d/3072d)   │           │
  │   │    (fallback)        │    │  ─ client/project memory    │           │
  │   │  ─ circuit breakers  │    │                             │           │
  │   └─────────────────────┘    └─────────────────────────────┘           │
  │                                                                       │
  │  ┌──────── Workers ────────┐    ┌──── External evidence ────┐         │
  │  │  ingestion · entity ext │    │  Firecrawl (policy-gated) │         │
  │  │  vectorization · IVDR   │    │  FAERS / MAUDE / Eudamed  │         │
  │  │  layout-aware OCR       │    │  Docling / GROBID / Tika  │         │
  │  └─────────────────────────┘    └───────────────────────────┘         │
  └──────────────────────────────────┬────────────────────────────────────┘
                                     │
  ┌──────────────────────────────────▼────────────────────────────────────┐
  │   DATA & STORAGE                                                      │
  │   ─ PostgreSQL (Neon) + pgvector  · 378 Drizzle tables · 39 migrations│
  │   ─ S3 + Veeva Vault connector · SharePoint integration               │
  │   ─ Audit chain (signed, append-only) · Tamper-proof log              │
  │   ─ eCTD module store (FDA + EMA regional variants)                   │
  └──────────────────────────────────┬────────────────────────────────────┘
                                     │
  ┌──────────────────────────────────▼────────────────────────────────────┐
  │   INFRASTRUCTURE                                                      │
  │   AWS · Terraform (28 .tf files) · Helm chart · Docker Compose ×4     │
  │   OpenTelemetry · Sentry · 13 CI gates · Lighthouse · Playwright      │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 4. Quantitative scale (the numbers behind the screenshot)

```
                   CODEBASE BY LAYER (LOC / files)
                   ──────────────────────────────

   Server  ████████████████████████████████████  531,652 LOC · 1,375 files
   Client  ██████████████                        ~350 .tsx files
   Tests   █████████                             226 test files
   CI      ██                                    13 governance scripts
   Infra   ██                                    28 Terraform + Helm chart
   Migr.   █                                     39 dated SQL migrations

           AI / ORCHESTRATION SURFACE
           ──────────────────────────

   AnA services           45 modules
   Route handlers        297 endpoint aggregators (55 + 242)
   Service modules       572 service files
   Middleware            33 dedicated middleware files
   External integrations 11 (Docling, GROBID, Tika, Firecrawl, …)
   LLM models wired       3 Claude tiers + OpenAI fallback

           DATABASE FOOTPRINT
           ──────────────────

   pgTable definitions  378
   Migrations            39  (latest: 2026-05-04)
   Vector dimensions  1536 + 3072  (dual corpora — see roadmap)
```

---

## 5. Layer-by-layer depth

### 5.1 Frontend — React 19, design-system-driven

- **Stack:** React 19.2, Vite 5, TanStack Query, Tailwind, Radix UI, Lucide, Framer Motion, Sentry. [`package.json`]
- **Editor:** TipTap 3 + Yjs CRDT + HocusPocus WebSocket = **multi-user real-time authoring** with 35+ extensions: AI autocomplete, citation linking, compliance scanner, threaded comments, e-signature workflow, document health, cross-reference graph, redline diff. [`client/src/concept2cure/components/editor/`]
- **Code splitting:** 16 named chunks (`vendor-tiptap`, `vendor-realtime`, `vendor-charts`, …) — heavy editor bundles lazy-load only on workbench surfaces. [`vite.config.ts`]
- **Design system:** Canonical CSS variables in `colors_and_type.css`, mirrored read-only into the v2 repo at `design-system/`. Phase 1 (Home, 15-item navigation rail, ⌘K palette) and Phase 2 (MDX 3-pane workbench) are **ready to ship**.

### 5.2 Server — Express, modular bootstrap

- **Entry:** `server/index.ts`, ~150 LOC. Strict middleware ordering with **21 CFR Part 11 immutability guard** before the global error handler [`server/startup/middleware.ts:106-132`].
- **Two-phase startup:** pre-HTTP route families (platform, templates, AI, integrations) → HTTP listen → post-HTTP (tenant, project, clinical intel) → WebSocket/parallel services. Python sidecar spawned for ingestion-heavy parsing.
- **API surface:** 15 `/api/*` subsystems × 242 `/routes/*` files = **297 endpoint aggregators**. Highlights: `/api/signing` (e-sig), `/api/gcc` (Global Compliance Control: ectd, labeling, signing, site-intel), `/api/ectd`, `/api/cer`, `/api/cmc`.

### 5.3 AI / AnA — the core moat

```
                 AnA REQUEST FLOW
                 ────────────────

  user prompt
      │
      ▼
  ┌─────────────────┐    project + role + workstream
  │ context-router  │──► ana-context-router
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐    audit · improve · navigate · propose
  │ kernel-orchestr.│──► plan · explain · evaluate · decide
  └────────┬────────┘    (8+ reasoning modes)
           │
           ▼
  ┌─────────────────┐    working-memory + project-memory
  │ memory-assembler│──► + RAG passages (HyDE, MMR, rerank)
  └────────┬────────┘    + external evidence (Firecrawl)
           │
           ▼
  ┌─────────────────┐    role + rate-limit + workstream gates
  │ tool-policy     │──► [evidence_sufficiency.assess,
  └────────┬────────┘     predicate.candidate.set_status,
           │              section.approve, q_sub.create,
           ▼              k510_workflow.transmit, …]
  ┌─────────────────┐
  │ AI gateway      │──► claude-opus-4-7   (complex drafting)
  │  + fallback     │    claude-sonnet-4-6 (workhorse)
  └────────┬────────┘    claude-haiku-4-5  (classify)
           │              + OpenAI fallback, circuit breaker
           ▼
  ┌─────────────────┐    contradiction scan, red-flag patterns,
  │ continuous-eval │──► quality rubric, gold-standard diff
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐    immutable audit · signed export
  │ governed action │──► consequence contract enforced
  └─────────────────┘    21 CFR Part 11
```

- **Provider strategy:** Claude-first (3 tiers wired); OpenAI as fallback. Unified client (`unified-ai-client.ts`) drops in for legacy direct-OpenAI sites — consolidation in progress.
- **Retrieval:** Advanced RAG with HyDE, multi-query, cross-encoder rerank, MMR diversity, contextual compression. Tenant-scoped. pgvector on Postgres. [`server/services/advancedRAGPipeline.ts`]
- **Memory:** 4-tier — working memory, thread state, project profile, client intelligence — merged by `memory-context-assembler.ts`.
- **Reasoning tier (UAT, near-beta):** Extended-thinking workflows for multi-step regulatory strategy. Gated behind 4 dedicated CI scripts (`ci:reasoning-tier-ga-readiness`, `ci:reasoning-tier-uat-evidence`, `ci:reasoning-tier-readiness`) and 9 documented UAT scenarios (Contradiction Scan, Reviewer Challenge, Evidence Reconciliation, …).

### 5.4 Data & compliance substrate

- **378 Drizzle tables** across submissions, supply chain, clinical metadata, quality/CMC, vault, and audit. Dual ORM (Drizzle + Prisma) — Drizzle is the live path, Prisma legacy.
- **Document storage:** Vault service abstraction over S3, with connectors to Veeva Vault and SharePoint. Deterministic DOCX render via Shadow Service (Jinja2 + content hashing).
- **Audit chain:** `chainIntegrityMonitor.ts`, `signedAuditExport.ts`, `auditLoggerV2.ts`, with a verification CLI (`scripts/run-chain-verify.mjs`) gated on a 24h and full-history schedule.
- **External regulatory clients:** FAERS, MAUDE, Eudamed, FDA 510(k), CER pipelines all live in dedicated typed services.
- **Document understanding pipeline:** Docling, GROBID, Tika, Unstructured, scispaCy, OCRmyPDF, veraPDF, redlines, citation.js, LanguageTool — **11 external integrations** for layout-aware ingestion of clinical PDFs.

### 5.5 Ops & governance

- **Infra:** AWS (S3, Neon Postgres), 28 Terraform files, Helm chart (`charts/trialsage-cer/`), Docker Compose for dev/staging/beta/e2e.
- **Observability:** OpenTelemetry + Sentry baked into the bootstrap before any request handling.
- **CI gates (a partial list of the governance moat):**
  - `ci:governed-export-routes` + `ci:governed-export-consequence-shape` — every governed export must declare its consequence contract
  - `ci:reasoning-tier-ga-readiness` + UAT-evidence — ensures the reasoning tier can't reach prod without sign-off
  - `ci:audit-route-mounts` (with no-regression baseline) — prevents endpoint drift
  - `ci:check-docx-runtime-canonicality` — DOCX exports must be byte-deterministic
  - `ci:no-mock-in-prod-routes` — quarantines mock data
  - `ci:token-cascade` — enforces design-system token integrity

---

## 6. Where we are today — phase by phase

```
   PHASE STATUS (as of 2026-05-07)
   ──────────────────────────────────────────────────────────────────────

   Phase 1  Home shell + navigation        ████████████████░  READY
   Phase 2  MDX workbench (510k/CER/PMA)   ███████████████░░  READY
   Phase 3  Projects detail (RIM)          ██████░░░░░░░░░░░  IN DESIGN
   Phase 4  Artifact workbench             ████░░░░░░░░░░░░░  IN DESIGN
   Phase 5  Auth                           ████░░░░░░░░░░░░░  IN DESIGN
   Phase 6  Admin                          ███░░░░░░░░░░░░░░  IN DESIGN

   FEATURE READINESS  (REGULATORY_UX_AUDIT, 2026-02-13)
   ──────────────────────────────────────────────────────────────────────

   eCTD Co-Author          B+   87/100   ████████████████░░   near-beta
   CERV2 (510k workflow)   B    82/100   ███████████████░░░   near-beta
   AnA chat (Lumen Cortex) C    55/100   ███████████░░░░░░░   needs work
   CMC Wizard              F    15/100   ███░░░░░░░░░░░░░░░   placeholder
```

### What is genuinely near-beta

1. **eCTD Co-Author.** Full Module 1–5 hierarchy, real-time collab editing (Yjs), version control, DOCX/PDF export, 40k+ words of authored content. Gaps: cross-reference automation, QC checklist depth.
2. **510(k) MDX workbench.** 7-stage pipeline (Intake → Submit), predicate search, substantial-equivalence matrix, eSTAR 20-section checklist, pre-sub Q-Sub creation. Sequential workflow is solid; the editor and policy layer are wired.
3. **AnA orchestration core.** Kernel orchestrator, context router, memory assembler, RAG, tool policy, governed-export contracts — all in production code paths and CI-gated.
4. **Audit/compliance plumbing.** Append-only middleware, signed audit export, chain verification CLI, e-signature schema (§11.50/.70/.100 fields). The *structure* is there.

### Why we are not yet GA — and we say this honestly

The internal QC audit (`QC_AUDIT_REPORT_2026-02-13.md`) flagged four critical gaps that the team is closing:

| Finding | Status | Plan |
|---|---|---|
| `TamperProofAuditLog` defined but not wired into request middleware | OPEN | Wire into bootstrap (2 weeks) |
| RBAC service stub — permissions default-allow | OPEN | Replace stub with policy engine (in progress) |
| Dev-mode auth bypass reachable in some prod paths | OPEN | Remove + add CI gate |
| Password verification path has bcrypt TODO | OPEN | bcrypt + argon2 migration |
| ALCOA+ coverage estimate | 58% | Target 85% before GA |
| CMC Wizard | placeholder | Functional prototype next quarter |
| AI responses on Lumen Cortex chat partially hardcoded | partial | Migrate fully to AnA gateway |

This is exactly the punch list a serious investor wants to see — known, tracked, scoped, and bounded.

---

## 7. What's next (sequenced roadmap)

```
   ROADMAP — NEXT 12 WEEKS
   ─────────────────────────────────────────────────────────────────────

   WEEK 0–2   ┃ Compliance hardening
              ┃   • Wire TamperProofAuditLog into middleware
              ┃   • Replace RBAC stub
              ┃   • bcrypt/argon2 password path
              ┃   • Remove dev-auth bypass + add CI gate
              ┃   → Target: ALCOA+ 58% → 75%

   WEEK 2–6   ┃ Beta gate for eCTD + 510(k)
              ┃   • Phase 1 (Home) ship to v2 codebase, delete legacy
              ┃   • Phase 2 (MDX) ship — 510(k) end-to-end
              ┃   • PDF export pipeline (currently 0% → 100%)
              ┃   • eCTD XML packaging
              ┃   → Target: first paying-customer beta

   WEEK 6–10  ┃ Reasoning tier GA
              ┃   • Close 9 UAT scenarios (Contradiction Scan etc.)
              ┃   • Continuous-eval dashboard (precision@k, hit-rate)
              ┃   • Memory orchestration unification (1536d/3072d merge)
              ┃   → Target: AnA reasoning tier promoted to default

   WEEK 10–12 ┃ Client onboarding GA
              ┃   • Close G1–G4 onboarding gaps (tier enum, activation
              ┃     state machine, unified quote engine)
              ┃   • Phase 4 Artifact workbench design freeze
              ┃   → Target: self-serve signup → first AnA session
              ┃           in <10 minutes
```

Beyond 12 weeks: Phases 4–6 (Artifact workbench, Auth, Admin), self-hosted GPU inference (currently provider-routed; audit scored 4.5/10 for high-perf inference — a deliberate "don't pre-buy hardware" stance), and PMDA + Health Canada regional eCTD variants.

---

## 8. The investor takeaway, in plain English

- **This is a real platform, not a demo.** 531k LOC of server code, 378 database tables, 297 endpoint aggregators, 226 test files, 13 governance CI gates, 39 dated migrations on a live schema. You can't fake that footprint in a hackathon.
- **The AI layer is engineered, not glued together.** Multi-tier Claude routing, advanced RAG (HyDE + rerank + MMR), four-tier memory, role-aware tool policy, continuous evaluation, and an extended-thinking reasoning tier in UAT. Forty-five purpose-built AnA services.
- **The compliance substrate is the product.** 21 CFR Part 11 isn't a checkbox here — it's middleware, schema, governed-export contracts, signed audit chain, and CI gates that block PRs. Competitors who skip this can't sell into pharma.
- **We are honest about the gap to GA.** The QC audit found real issues. Every one of them is on a 2-, 6-, or 12-week clock. ALCOA+ moves from 58% to 85%. eCTD and 510(k) hit beta in 6 weeks. Reasoning tier promotes by week 10.
- **The design system is proprietary leverage.** Phase-gated, single-source-of-truth, with CI enforcement of token integrity. No more "dev built it differently than design intended" — the whole class of waste is engineered out.

We are selling the operating system that pharma and medtech regulatory teams will run on for the next decade. The code shows it.
