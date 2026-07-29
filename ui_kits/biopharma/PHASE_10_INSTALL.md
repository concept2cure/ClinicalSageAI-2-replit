# PHASE 10 — Biotech and Pharma · install guide for Claude Code

> Companion to `HANDOFF.md`, `PHASE_4_INSTALL.md` through `PHASE_9_INSTALL.md`, and this kit's `README.md`. Phase 10 ships the **second top-level domain** alongside MDX. The chassis is shared; biopharma swaps data + workstream surfaces.
>
> Read `CLAUDE.md`, `HANDOFF.md`, `ui_kits/biopharma/README.md`, then this file.

---

## 0 · Shape of the work

**Phase 10 is a domain split, not a duplication.**

In v2 today, `concept2cure/mdx/` is a complete domain implementation. Phase 10 reshapes that one folder into a domain-aware family of two:

```
client/src/concept2cure/
├── _shared/                     ← lifted from current mdx/
│   ├── shell/{Rail,TopBar,TabBar,AnaDock,CmdK}.tsx     (takes domain prop)
│   ├── workbench/{Tasks,Vault,Validation,Submissions,Templates}.tsx
│   ├── surfaces/{Search,Onboarding,Conversations,Notifications,Audit,Admin,Memory,Analytics,AnaReview}.tsx
│   ├── icons.tsx
│   └── app.css + surfaces.css
├── mdx/
│   ├── data/{nav,programs,k510,pma,cer,…}.ts
│   ├── surfaces/{K510,Pma,Cer,Precedent,Engineering,Udi,Postmarket,Samd,Clinical,Quality,Ivd,Ivdr,Cdx,Ldt,QSub}.tsx
│   └── App.tsx                  ← passes domain="mdx" to shared shell
├── biopharma/                   ← NEW
│   ├── data/{nav,programs,ind,nda,pediatric,pv}.ts
│   ├── surfaces/{Overview,Ind,Nda,Bla,Maa,Pediatric,Pharmacov,Precedent,Cmc,Clinical,Orphan,Biostat}.tsx
│   └── App.tsx                  ← passes domain="biopharma" to shared shell
├── pdev/                        ← (Phase 7, unchanged)
└── authoring/                   ← (Phase 9, domain-agnostic)
```

The shared shell takes a `domain` prop and reads the right `nav.ts` / `programs.ts` / breadcrumb label / suggestions. No more hardcoded `MDX_NAV_GROUPS`.

## 1 · Routes

```
/biopharma                              → BiopharmaApp / Overview
/biopharma/programs                     → program list
/biopharma/programs/:programId          → ProjectHome (shared, domain="biopharma")
/biopharma/ind                          → IND surface · filter to type='IND'
/biopharma/nda                          → NDA surface · filter to type='NDA'
/biopharma/bla                          → BLA surface · filter to type='BLA'
/biopharma/maa                          → MAA surface · filter to type='MAA'
/biopharma/pediatric                    → Pediatric plans
/biopharma/pharmacovigilance            → Signals + PSURs
/biopharma/cmc                          → Module 3 deep-dive (Phase 10.1)
/biopharma/clinical                     → Phase 10.1
/biopharma/orphan                       → Phase 10.1
/biopharma/precedent                    → Phase 10.1
/biopharma/biostat                      → Phase 10.1
```

The Project home (Phase 3) already dispatches `program.type` → workstream tiles. Add the biopharma cases:

```tsx
{program.type === 'IND' && <Tile to="biopharma/ind" />}
{program.type === 'NDA' && <Tile to="biopharma/nda" />}
{program.type === 'BLA' && <Tile to="biopharma/bla" />}
{program.type === 'MAA' && <Tile to="biopharma/maa" />}
```

## 2 · Files (6 source files in `ui_kits/biopharma/`)

| Kit source        | Lands at                                                                     |
|-------------------|------------------------------------------------------------------------------|
| `data.jsx`        | `client/src/concept2cure/biopharma/data/{nav,programs,ind,nda,pediatric,pv}.ts` (split by concern) |
| `shell.jsx`       | merged into `_shared/shell/*.tsx` with `domain` prop; biopharma deltas (breadcrumb label + tab list) live in `_shared/shell/domainConfig.ts` |
| `surfaces.jsx`    | split by surface into `biopharma/surfaces/{Overview,Ind,Nda,Pediatric,Pharmacov,Pathway,Stub}.tsx` |
| `styles.css`      | merged into `_shared/surfaces.css` under a `BIOPHARMA SURFACES` banner (selectors are `.bp-*` prefixed; no collision) |
| `app.jsx`         | `biopharma/App.tsx` (route table + domain prop into shared shell)            |
| `index.html`      | harness only — codebase mounts at `/biopharma` via `BiopharmaRoute.tsx`      |

## 3 · Hooks Phase 10 introduces

```ts
// Domain-level
useBiopharmaPrograms()                     // GET /api/biopharma/programs
useBiopharmaPortfolioReadiness()           // GET /api/biopharma/programs/readiness

// IND / CTA
useBiopharmaIndProgram(programId)          // GET /api/biopharma/programs/:id/ind
useBiopharmaIndModules(programId)          // GET /api/biopharma/programs/:id/ind/modules
useBiopharmaIndInteractions(programId)     // GET /api/biopharma/programs/:id/ind/fda-interactions
useBiopharmaIndContradictions(programId)   // GET /api/biopharma/programs/:id/ind/contradictions
useBiopharmaIndAmendmentSubmit()           // POST /api/biopharma/programs/:id/ind/amendments (audited)

// NDA / BLA / MAA — share one route family with `pathway` query
useBiopharmaPathwayProgram(programId, pathway)        // GET /api/biopharma/programs/:id/pathway/:pathway
useBiopharmaPathwayReviewClock(programId, pathway)    // GET /api/biopharma/programs/:id/pathway/:pathway/clock
useBiopharmaPathwayPivotalStudies(programId, pathway) // GET /api/biopharma/programs/:id/pathway/:pathway/studies
useBiopharmaPathwayFile()                              // POST /api/biopharma/programs/:id/pathway/:pathway/file (audited)

// Pediatric
useBiopharmaPediatricPlans()               // GET /api/biopharma/pediatric/plans
useBiopharmaPreaMilestones()               // GET /api/biopharma/pediatric/prea-milestones

// PV
useBiopharmaSignals({product, status})     // GET /api/biopharma/pv/signals
useBiopharmaPsurs({status})                // GET /api/biopharma/pv/psurs
useBiopharmaSafetyReportSubmit()           // POST /api/biopharma/pv/reports (audited)
```

Every mutation hook MUST accept `reason: string` and forward it to the route. Audit middleware writes the SHA-256 chain entry (PDEV pattern).

## 4 · Nav addition (home rail)

The home rail `Biotech and Pharma` item is currently `href: null`. Wire it:

```ts
// ui_kits/home/data.jsx — change the biopharma href:
{ id: 'biopharma', label: 'Biotech and Pharma', icon: 'atom', group: 'domain',
  href: '../biopharma/index.html' },   // was: null
```

In v2 the home rail items dispatch to react-router routes; `biopharma` becomes `/biopharma`.

## 5 · Database deltas

Biopharma reuses the existing `regulatory_programs` table. Only `program.type` values expand:

```sql
-- Extend the existing program-type CHECK constraint.
ALTER TABLE regulatory_programs DROP CONSTRAINT regulatory_programs_type_check;
ALTER TABLE regulatory_programs ADD CONSTRAINT regulatory_programs_type_check
  CHECK (type IN ('510K','PMA','CER','IND','NDA','BLA','MAA','CTA','PIND','iPSP'));

-- New biopharma-only tables:
CREATE TABLE biopharma_pediatric_plans (
  id              text PRIMARY KEY,                   -- 'pip-420', 'psp-204', …
  org_id          uuid NOT NULL,
  program_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  kind            text NOT NULL,                       -- 'EMA PIP' | 'FDA iPSP'
  status          text NOT NULL,                       -- agreed | submitted | in_draft
  age_range_low   smallint, age_range_high smallint,
  deferrals       integer NOT NULL DEFAULT 0,
  waivers         integer NOT NULL DEFAULT 0,
  milestones      integer NOT NULL DEFAULT 0,
  next_milestone  text,
  next_due        date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE biopharma_pv_signals (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  product_code    text NOT NULL,                       -- 'BX-099'
  term            text NOT NULL,                       -- MedDRA preferred term
  case_count      integer NOT NULL DEFAULT 0,
  prr             numeric(4,2),
  status          text NOT NULL,                       -- evaluating | monitoring | closed
  owner_id        uuid REFERENCES users(id),
  source          text NOT NULL,                       -- 'FAERS' | 'EudraVigilance' | 'Internal'
  first_observed  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE biopharma_fda_interactions (
  id              bigserial PRIMARY KEY,
  org_id          uuid NOT NULL,
  program_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  kind            text NOT NULL,                       -- 'Type B · Pre-IND' | 'Type C' | 'Information req' | 'Safety report'
  topic           text NOT NULL,
  interaction_date date NOT NULL,
  status          text NOT NULL,                       -- closed | open | submitted
  resolution      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE biopharma_module_contradictions (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  program_id      uuid NOT NULL REFERENCES regulatory_programs(id),
  severity        text NOT NULL,                       -- warn | err
  title           text NOT NULL,
  description     text NOT NULL,
  section_refs    jsonb NOT NULL,                      -- ['M3 §3.2.P.8.3', 'Protocol BX115-202 §6.4']
  owner_id        uuid REFERENCES users(id),
  detected_at     timestamptz NOT NULL DEFAULT now()
);
```

PSURs themselves reuse the Phase 9 `c2c_documents` table with `doc_type='psur'` — no separate table needed.

## 6 · Audit integration

Every biopharma mutation route writes to `audit_logs` using the PDEV pattern:

```
biopharma.program.ind.amendment.submit       (POST .../ind/amendments)
biopharma.program.pathway.file               (POST .../pathway/:pathway/file)
biopharma.pediatric.plan.update              (PATCH .../pediatric/plans/:id)
biopharma.pv.signal.transition               (POST  .../pv/signals/:id/transition)
biopharma.pv.report.submit                   (POST  .../pv/reports)
biopharma.psur.draft                         (POST  /c2c/documents/.../ai-draft, when doc_type='psur')
```

## 7 · Surface contracts

### 7.1 Overview (`/biopharma`)
**Layout.** Page head · 4 KPI cards (portfolio readiness · pending agency actions · PSURs · pediatric milestones) · 2-col split (programs table left, blockers + recent activity right).
**Routes.** `GET /api/biopharma/programs`, `GET /api/biopharma/programs/readiness`.

### 7.2 IND / CTA (`/biopharma/ind`)
**Layout.** Page head with active program · 5-module readiness strip · 2-col split (FDA interactions stream left, contradictions registry right) · blockers table.
**Routes.** `GET /api/biopharma/programs/:id/ind/{modules,fda-interactions,contradictions,blockers}`.

### 7.3 NDA · 505(b) (`/biopharma/nda`)
**Layout.** Page head with active program · 5-module CTD strip · 2-col split (pivotal studies left, FDA review clock right).
**Routes.** `GET /api/biopharma/programs/:id/pathway/nda/{modules,studies,clock}`.

### 7.4 BLA + MAA (shared `<PathwaySurface>`)
**Layout.** Page head · programs table for that pathway · optional module strip.
**Routes.** `GET /api/biopharma/programs?pathway=<bla|maa>`.

### 7.5 Pediatric (`/biopharma/pediatric`)
**Layout.** Page head · 4 PREA KPIs · plans table · upcoming milestones list.
**Routes.** `GET /api/biopharma/pediatric/{plans,prea-milestones}`.

### 7.6 Pharmacovigilance (`/biopharma/pharmacovigilance`)
**Layout.** Page head · active signals table (PRR-colored) · aggregate-reports list.
**Routes.** `GET /api/biopharma/pv/{signals,psurs}`.

### 7.7 Stubs (Phase 10.1)
Precedent · CMC · Clinical · Orphan · Biostatistics — fixtures already in `data.jsx`, surfaces fill in Phase 10.1.

## 8 · Replaces (HANDOFF.md delete list)

There's nothing to delete — Phase 10 is additive. But it **promotes**:

- `client/src/concept2cure/mdx/shell/*.tsx` → `_shared/shell/*.tsx` (with domain prop)
- `client/src/concept2cure/mdx/workbench/Workbench.tsx` → `_shared/workbench/*.tsx`
- The 14 cross-domain surfaces (Tasks, AnA Review, Vault, Validation, Submissions, Templates, Analytics, Memory, Conversations, Search, Notifications, Audit, Onboarding, Admin) move from `mdx/surfaces/` to `_shared/surfaces/`.

MDX routes update their imports; no behavior change for medtech users.

## 9 · Acceptance

- [ ] `/biopharma` route mounts and renders Overview.
- [ ] All 6 workstream tabs (Overview, IND, NDA, BLA, MAA, Precedent) navigate correctly.
- [ ] 27 rail items in `BIOPHARMA_NAV_V2` either render a built surface or a clearly-labeled stub.
- [ ] Hero surfaces render with `<DataState>` skeletons during fetch, error chip per card on failure.
- [ ] Home rail `Biotech and Pharma` item dispatches to `/biopharma`.
- [ ] `_shared/shell/*` takes `domain` prop and renders both `/mdx` and `/biopharma` without forking.
- [ ] Database constraints accept all biopharma `program.type` values.
- [ ] Every mutation route writes an audit-log entry with non-empty `reason`.
- [ ] No CSS regression in MDX (the `.bp-*` prefix means zero selector overlap).
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## 10 · Out of scope (Phase 10 explicitly does NOT do)

- **Authoring engine** — Phase 9 (`/authoring/:documentId`) is the universal drafter; biopharma surfaces link into it. Phase 10 does NOT rebuild authoring.
- **PDEV** — Phase 7 (`/pdev`) handles the IND PDEV programmatic workflow. Biopharma's `/biopharma/ind` is the regulatory-affairs view; PDEV is the development-engineering view. They link at the program level.
- **Phase 10.1 surfaces** — Precedent, CMC, Clinical, Orphan, Biostat — fixtures shipped, surfaces deferred.

## 11 · End of phase

After Phase 10 ships, the v2 codebase has three domain-tier entry points (`/mdx`, `/biopharma`, `/pdev`) plus the universal authoring spine (`/authoring`) plus the chassis layer (`_shared/*`). The home rail's two unbuilt domain items (`mdx` already wired, `biopharma` newly wired) are both live. The lifecycle/intelligence rail items are now meaningfully dispatched per domain.

Phase 11 (post-launch) is Phase 10.1 — fills in the 5 remaining biopharma surfaces against the fixtures already shipped here.
