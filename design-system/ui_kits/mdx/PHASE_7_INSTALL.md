# PHASE 7 — install guide for Claude Code

> Workspace deepening. Four new surfaces that turn dashboards into authoring workspaces: AnA review queue, Q-Sub briefing, SaMD lifecycle (IEC 62304), Clinical study management. Read after Phase 4–6.

---

## 0 · Scope

| # | Surface              | Group       | Layout            | Endpoint                            |
|---|----------------------|-------------|-------------------|-------------------------------------|
| 1 | AnA review queue     | workbench   | inbox             | `GET /api/mdx/ana-review`           |
| 2 | Q-Sub briefing       | workbench   | 3-col workspace   | `GET /api/mdx/qsub`                 |
| 3 | SaMD lifecycle       | workstream  | doc-first + PCCP  | `GET /api/mdx/samd/:programId`      |
| 4 | Clinical studies     | workstream  | doc-first + funnel| `GET /api/mdx/clinical/:programId`  |

---

## 1 · Files (8 total)

| Kit source                          | Lands at                                                  |
|-------------------------------------|-----------------------------------------------------------|
| `data/ana-review.js`                | `mdx/data/anaReview.ts`                                   |
| `data/qsub.js`                      | `mdx/data/qsub.ts`                                        |
| `data/samd.js`                      | `mdx/data/samd.ts`                                        |
| `data/clinical.js`                  | `mdx/data/clinical.ts`                                    |
| `surfaces/AnaReview.jsx`            | `mdx/surfaces/AnaReviewSurface.tsx`                       |
| `surfaces/QSub.jsx`                 | `mdx/surfaces/QSubSurface.tsx`                            |
| `surfaces/Samd.jsx`                 | `mdx/surfaces/SamdSurface.tsx`                            |
| `surfaces/Clinical.jsx`             | `mdx/surfaces/ClinicalSurface.tsx`                        |

## 2 · Hooks

- `useAnaReview({filter})` → `{ kpis, drafts }`
- `useQSub()` + `useQSubDetail(qsubId)` → `{ qsubs, sections, correspondence, documents }`
- `useSamd(programId)` → `{ kpis, reqs, ots, anomalies, pccp, documents }`
- `useClinical(programId)` → `{ kpis, funnel, sites, deviations, adjudication, documents }`

## 3 · Nav additions

Add to `MDX_NAV_V2` (workbench + workstream groups):

```ts
{ id: 'ana-review', label: 'AnA Review Queue',  icon: 'sparkles', group: 'workbench' },
{ id: 'qsub',       label: 'Q-Sub Briefing',    icon: 'chat',     group: 'workbench' },
{ id: 'samd',       label: 'SaMD Lifecycle',    icon: 'zap',      group: 'workstream' },
{ id: 'clinical',   label: 'Clinical Studies',  icon: 'users',    group: 'workstream' },
```

Place `ana-review` after `tasks` (it's the AI-counterpart to human review).
Place `qsub` after `submissions` (it sits before submission as the briefing step).

## 4 · App.tsx routing

```tsx
case 'ana-review': surface = <AnaReviewSurface onAskAna={askAna} />; break;
case 'qsub':       surface = <QSubSurface onAskAna={askAna} onOpenEditor={openEditor} />; break;
case 'samd':       surface = <SamdSurface onAskAna={askAna} onOpenEditor={openEditor} program={programForContext} />; break;
case 'clinical':   surface = <ClinicalSurface onAskAna={askAna} onOpenEditor={openEditor} program={programForContext} />; break;
```

## 5 · Database deltas

```sql
-- AnA draft queue (one row per pending draft)
CREATE TABLE c2c_ana_drafts (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  surface         text NOT NULL,
  program_code    text,
  section_label   text NOT NULL,
  author_model    text NOT NULL,
  confidence      numeric(3,2) NOT NULL,
  priority        text NOT NULL,   -- critical | high | medium | low
  summary         text NOT NULL,
  evidence_count  integer NOT NULL DEFAULT 0,
  sources         jsonb,
  reviewer_id     uuid,
  status          text NOT NULL DEFAULT 'pending',  -- pending | refine | accepted | rejected
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz
);
CREATE INDEX c2c_ana_drafts_reviewer_pending ON c2c_ana_drafts (reviewer_id, status, created_at DESC);

-- Q-Sub program + briefing-document state
CREATE TABLE c2c_qsubs (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  program_id      uuid NOT NULL,
  qsub_type       text NOT NULL,   -- pre-sub | study-risk | submission-issue | pccp
  title           text NOT NULL,
  status          text NOT NULL,
  question_count  integer NOT NULL DEFAULT 0,
  submitted_at    timestamptz,
  feedback_at     timestamptz,
  reviewer_id     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE c2c_qsub_correspondence (
  id          text PRIMARY KEY,
  qsub_id     text NOT NULL REFERENCES c2c_qsubs(id),
  from_party  text NOT NULL,        -- FDA | C2C | AnA
  kind        text NOT NULL,        -- draft | submission | feedback | clarification
  body        text NOT NULL,
  when_ts     timestamptz NOT NULL DEFAULT now()
);

-- SaMD requirements, OTS inventory, anomalies, PCCP
CREATE TABLE c2c_samd_requirements (...);  -- SR-XXXX + SDS link + tests[]
CREATE TABLE c2c_samd_ots_components (...);
CREATE TABLE c2c_samd_anomalies (...);
CREATE TABLE c2c_samd_pccp (...);

-- Clinical study management
CREATE TABLE c2c_clinical_sites (...);
CREATE TABLE c2c_clinical_subjects (...);
CREATE TABLE c2c_clinical_deviations (...);
CREATE TABLE c2c_clinical_adjudications (...);
```

## 6 · Editor variants

No new editors required for Phase 7 — every artifact routes to `engineering` (reuse `DocumentEditor`) or `data-submission` (reuse `DataSubmissionViewer`).

## 7 · Acceptance

- [ ] AnA review queue groups drafts by priority; bulk-accept opens the Phase 5 e-signature flow once per draft.
- [ ] Q-Sub surface renders 3-column layout (open Q-Subs ledger / briefing-section list / FDA correspondence thread).
- [ ] SaMD requirements table shows each requirement's coverage chip and any anomalies linked back.
- [ ] SaMD PCCP card renders only when `pccp.enabled === true`; absent for non-AI/ML devices.
- [ ] Clinical enrollment funnel renders 6 stages with proportional bars.
- [ ] Clinical adjudication queue shows only AEs in `pending` state by default.
- [ ] All 4 Phase 7 surfaces routed in `App.tsx`; rail items appear in correct groups; AnA suggestions appear when navigating to each.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## 8 · Still uncovered (Phase 8+)

- Global search across artifacts/sections/audit-log/AnA conversations
- Onboarding / migration importer for new paying clients
- AnA conversation history archive (per-program threaded)
