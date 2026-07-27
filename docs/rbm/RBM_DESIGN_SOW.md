# RBM Module — Design Statement of Work (SOW) & Hand-off Report

*For the Claude design team — June 2026*

> **Status note added 2026-07-26.** This document describes the RBM module as it
> stood in June 2026 and is kept as a point-in-time record, not a current
> specification. Several of the files it references no longer exist. The standalone
> RBM app (`client/src/concept2cure/rbm/` — `RbmRoute.tsx`, `App.tsx`, `data/nav.ts`),
> the second `rbm-operations` surface, and the `services/rbmService.ts` +
> `hooks/useRbm.ts` client layer were all removed when RBM was consolidated onto a
> single UI. The live module is `client/src/concept2cure/v2/surfaces/Rbm.tsx` with
> `RbmSurfacesA/B.tsx`, reading the aggregated board
> (`GET /api/mdx-rbm/rbm-board/:programId`) and writing through
> `surfaces/rbmWrites.tsx` to the granular `/api/mdx/rbm-*` routes. Treat file
> paths below as historical.

The Risk-Based Monitoring (RBM / RBQM) module is **functionally complete**: data
model, API, deterministic scoring engine, AnA tools, and a wired-in **functional
scaffold** UI that renders live data. This document hands the **visual/UX design**
to the design team. Nothing below requires backend work — the contracts are
stable. Build the designed surfaces on top of the existing data layer.

---

## 1. What already exists (do not rebuild)

**Backend / data (done):**
- Tables: `migrations/20260629_rbm_surfaces.sql`, mirrored in `shared/schema.ts`
  (`rbm_risk_assessments`, `rbm_risk_items`, `rbm_kris`, `rbm_qtls`,
  `rbm_signals`, `rbm_site_risk_scores`, `rbm_monitoring_plans`,
  `rbm_monitoring_actions`).
- API: `server/routes/mdx-rbm.ts` at `/api/mdx` (CRUD, `…/seed`,
  `…/recompute`, `rbm-summary/:programId`).
- Engine: `server/services/rbm/rbm-engine.ts`,
  `server/services/rbm/site-risk-engine.ts`.
- AnA tools: `run_rbm_assessment`, `assess_site_risk`, `evaluate_kris_qtls`,
  `generate_rbm_plan`, `prioritize_monitoring_queries`.

**Frontend data layer (done — reuse as-is):**
- `client/src/concept2cure/services/rbmService.ts` — typed API client.
- `client/src/concept2cure/hooks/useRbm.ts` — React Query hooks
  (`useRbmSummary`, `useRbmItems`, `useRbmKris`, `useRbmQtls`, `useRbmSignals`,
  `useRbmSiteRisk`, `useRbmPlans`, plus seed/recompute/create mutations).
- `client/src/concept2cure/rbm/data/nav.ts` — nav, labels, status maps,
  `rbmBand()`, AnA suggestions.

**Functional scaffold (replace with designed surfaces):**
- `client/src/concept2cure/rbm/App.tsx` — self-styled tabbed shell.
- `client/src/concept2cure/rbm/RbmRoute.tsx` — route entry (mounted in
  `ZenApp.tsx` via `layoutMode === 'rbm'`, reachable at `?nav=rbm`).

---

## 2. Scope of design work

Rebuild the scaffold as a first-class **domain shell** matching the Risk
(ISO 14971) and Labeling shells. `client/src/concept2cure/risk/` is the
reference for `App.tsx`, `RiskRoute.tsx`, `shell/{Rail,TopBar,TabBar}.tsx`,
`surfaces/*`, `icons.tsx`, and `app.css` (imports `../mdx/app.css` then
`./app.css`). Recreate as `client/src/concept2cure/rbm/shell/*`,
`.../surfaces/*`, `.../icons.tsx`, `.../app.css`, and rewrite `App.tsx` to the
Rail + TopBar + TabBar + surface-router + AnA-dock structure.

**Surfaces** (one per `RBM_NAV` entry in `data/nav.ts`):

1. **Overview** — readiness tiles from `useRbmSummary` (overall risk, critical
   CtQs, KRI red/amber, QTL breached/approaching, open signals, enhanced-tier
   sites) + a "needs attention" queue.
2. **Risk assessment (RACT)** — CtQ register from `useRbmItems`; a likelihood ×
   impact **risk matrix** (mirror `risk/surfaces/Matrix.tsx`); seed empty state
   via `useSeedRbmAssessment`; create/edit dialog (`useCreateRbmItem`,
   `useUpdateRbmItem`).
3. **Key risk indicators** — KRI table/cards from `useRbmKris` with green/amber/
   red status; seed via `useSeedRbmKris`; value-entry to recompute status.
4. **Quality tolerance limits** — QTL table from `useRbmQtls`; within/
   approaching/breached; show the secondary (early-warning) limit; seed via
   `useSeedRbmQtls`.
5. **Central monitoring** — signal inbox from `useRbmSignals`, sortable by
   severity; triage actions (`useUpdateRbmSignal`).
6. **Site risk** — site table from `useRbmSiteRisk` ranked by composite risk,
   with monitoring-tier chips and drivers; recompute via `useRecomputeSiteRisk`.
7. **Monitoring plan** — plan from `useRbmPlans` + actions board; create plan;
   "Generate plan" calls the `generate_rbm_plan` AnA tool.

**AnA dock** — wire `useAnaChat({ moduleContext: { workstream: 'rbm', activeNav,
projectId } })` exactly as `risk/App.tsx` does; per-surface starters come from
`RBM_SUGGESTIONS` in `data/nav.ts`.

---

## 3. Design system & compliance constraints (mandatory)

- **Tokens only** — cream canvas, terracotta accent (`--accent`), olive/amber
  status. Reference `design-system/README.md`, `client/src/concept2cure/design/zen.css`.
- **WCAG 2.2 AA** — status never by color alone: every chip pairs a tone with a
  text label and an icon; every risk score shows its numeric value (mirror
  `risk/surfaces/state.tsx`).
- **Motion discipline** — 200ms ease-out, no bounce/overshoot, respect
  `prefers-reduced-motion`.
- **Microcopy/tone** — reviewer-grade: sentence case, no emoji, no exclamation
  marks, calm and factual.
- **21 CFR Part 11** — assessment/plan **approval** is a governed action:
  reason-for-change + e-signature (reuse `server/api/gcc/signing`) before status
  moves to `active`. Surface the audit trail.

---

## 4. Acceptance criteria

- All seven surfaces render live data via the `useRbm*` hooks; no demo arrays.
- Empty states offer the seed/recompute actions (RACT, KRIs, QTLs, site risk).
- The study selector threads `program_id` to every surface.
- `⌘\` toggles the AnA dock; per-surface starters fire real AnA round-trips.
- Chips/scores pass the color-never-alone check; keyboard nav/focus order
  correct; `prefers-reduced-motion` honored.
- Approval captures reason-for-change + e-signature and writes the audit trail.
- Matches the Risk/Labeling shells visually (rail, top bar, tab bar, density).

---

## 5. Out of scope (later phases)

- Statistical central monitoring wired to `server/services/biostatistics-judgment/` — phase 2.
- EDC/CTMS connectors feeding live KRI values — phase 2.
- KRI trend history endpoint + charts — phase 2.
- Adaptive-trial reuse for QTL parameterization — phase 3.

---

## 6. Verification handed over

- DB: apply `migrations/20260629_rbm_surfaces.sql` (or `npm run db:push`).
- API smoke (JWT with `organizationId`):
  `POST /api/mdx/rbm-assessments/seed {programId}` →
  `GET /api/mdx/rbm-summary/:programId` →
  `POST /api/mdx/rbm-kris/seed`, `/rbm-qtls/seed`,
  `POST /api/mdx/rbm-site-risk/recompute {programId}`.
- UI: `?nav=rbm` mounts the module; each surface renders live data.
- Use the `gstack` / `verify` skills to screenshot the redesigned surfaces.
