# UAT readiness — GA demo runbook

Single source of truth for human acceptance testing of the Concept2Cure.RI
UI layer. Derived from the full 154-surface audit (2026-07-16) plus the
Wave-0/1 execution program (PR #1025). Every "live" claim below is backed by
a verified read path and seeded demo data; every "sample" is a deliberate,
labeled fail-closed fixture — never an error state.

## 1. Environment setup

```bash
# 1. Postgres (fresh or existing) — apply schema + migrations
export DATABASE_URL=postgres://…          # non-production database
bash db_migrate.sh                        # manifest-ordered db/migrations/*
# root migrations/ path (raw phase migrations) as applicable to your env

# 2. Demo data — org, users, projects, and every Wave-0 domain store
npm run db:seed                           # scripts/seed-ga-demo.mjs
#   → refuses to run when NODE_ENV=production
#   → idempotent: re-running never duplicates rows

# 3. Boot
npm run dev                               # tsx server/index.ts (ESM-clean on Node 20/22)
```

Sign-in (printed by the seeder): `jonmichaelpsmith@gmail.com` / `demo123`,
plus six role-scoped team members (`…@concept2cure.pro` / `demo-2026`).
Rotate these before any shared or externally reachable deployment.

## 2. What testers should see — live surfaces (seeded)

| Area                     | Surfaces                                                      | Backed by                                                                                      |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Projects & portfolio     | Projects list, project detail                                 | `regulatory_programs` (5–7 programs)                                                           |
| Risk (standalone module) | Overview, Register, Matrix, Controls                          | 9 risk items + 14 controls                                                                     |
| Tasks & approvals        | Tasking board/list, Approvals, Review queue                   | 12 unified tasks; approval-workflow chain                                                      |
| Audit & compliance       | Communication audit timeline; Dispatch readiness gate         | 12 governed-action events; real dispatch-gate engine                                           |
| Submission               | Overview, Transmittals (+findings)                            | 8 transmittals, 9 findings                                                                     |
| Device (mdx)             | UDI, Postmarket (vigilance/CAPA), Analytics, IVD, Engineering | 8 UDI records; 8 events + 5 CAPAs; aggregate base rows                                         |
| Vault & memory (mdx)     | Vault, AnA memory                                             | 9 artifacts + 22 versions; 9 memory atoms                                                      |
| Labeling                 | Translation board, symbols glossary                           | doc + 7 translations; 12 ISO 15223-1 symbols                                                   |
| Translation module       | Projects, Segment workspace, Glossary                         | full `/api/translation` route layer (was 404)                                                  |
| Nonclinical              | Study review board (+SEND status)                             | 6 studies + SEND datasets                                                                      |
| Clinical ops             | Studies & enrollment board                                    | 3 studies                                                                                      |
| Biopharma                | Specialty (pediatric/orphan/lifecycle), programs              | dedicated stores + programs                                                                    |
| Templates                | Template library                                              | 4 templates with docTypes                                                                      |
| Training                 | Learning paths, certifications                                | 6 paths, 3 certifications                                                                      |
| Change control           | Change assessment                                             | 2 assessments (FDA/EU decision trees)                                                          |
| Orchestration            | Readiness panel, approval checkpoints                         | computed readiness; `approval_checkpoints`                                                     |
| Admin                    | Apps (module subscriptions); Admin console access grants      | live module list + toggle; audited `platform_role_grants`                                      |
| Post-submission          | HAQ manager (rounds + questions)                              | `project_memory_entries` (2 letters, 8 questions)                                              |
| Human factors            | HFE/UE file + use scenarios                                   | `c2c_hf_files` + `c2c_hf_scenarios` (1 file, 6 scenarios)                                      |
| Safety / PV              | SafetyNarrative SAE worklist                                  | `c2c_sae_cases` (3 cases; ICH E3 §16 composer client-side)                                     |
| NDA cockpit              | CTD module readiness + overall %                              | `c2c_nda_modules` (5 modules, 80% ready)                                                       |
| Evidence                 | Saved evidence-ask (answer + chunks)                          | `c2c_evidence_asks` (1 ask, 3 chunks)                                                          |
| Document lifecycle       | DocJourney stage rail                                         | `c2c_doc_journeys` (9 stages)                                                                  |
| Agency interactions      | Agency meetings + briefing books/minutes                      | `c2c_agency_meetings` (4 meetings)                                                             |
| Device design            | Design controls (820.30 traceability)                         | `c2c_design_controls` (7 inputs)                                                               |
| CRO                      | Sponsor portfolio roster                                      | `c2c_cro_portfolio` (5 sponsors)                                                               |
| Evidence pool            | pdev EvidencePicker                                           | `c2c_evidence_objects` (11 objects)                                                            |
| Biostatistics            | SAP / sample-size / interims sections                         | `c2c_biostat_*`                                                                                |
| Reg intelligence         | Reg-change horizon scan                                       | `c2c_reg_changes` (5 change records)                                                           |
| Governance               | Decision lineage trails                                       | `c2c_decision_lineage` (3 governed-artifact trails)                                            |
| Dossier                  | CTD module map (completeness/readiness)                       | `c2c_dossier_map` (5 modules)                                                                  |
| IND                      | IND lifecycle checklist (forms + eCTD sections)               | `c2c_ind_checklist` (BX-301 IND: 3 forms, 17 sections)                                         |
| Program                  | Program journey (stage overlay + clock)                       | `c2c_program_journey` (BX-204)                                                                 |
| Market access            | Payer coverage / value dossier / coding                       | `c2c_market_access` (BX-204)                                                                   |
| Shadow review            | Refuse-to-File findings by reviewer lens                      | `c2c_shadow_review` (5 lenses, 14 findings)                                                    |
| Labeling                 | USPI section worklist + agency negotiation                    | `c2c_labeling_pi` (18 sections)                                                                |
| Protocol dev             | Protocol section tree / SoA / risk register                   | `c2c_protocol_dev` (SELVO-DLBCL-201)                                                           |
| Research admin           | CITI training matrix                                          | `research_personnel` + `personnel_training` (6 personnel; matrix derived live from real dates) |

Each Wave-2/3 surface adopts live data only when the store returns its full
display shape, else fails closed to the codebase fixture with a "Sample data"
pill — so a "Live" pill on any of these after seeding is the proof it worked.

The v2 Risk surface (ISO 14971) also adopts the org's live risk file: it reads
the same `risk_items` store as the standalone module through a fail-closed
display mapper (`mapRiskItems`) that maps raw DB rows onto the surface's
labelled contract — severity/probability labels are the exact inverse of the
surface's own write path, and residual acceptability is taken from the server's
`acceptable` flag, never inferred.

**Read-shape wiring (raw `SELECT *` endpoints → display fixture) — all wired.**
A few older MDX panels read raw `SELECT *` endpoints whose DB columns diverge
from the v2 display fixture, so `useLiveList`'s structural guard rejected the
response and the panel stayed on its "Sample data" fixture. Each now adopts
live through a pure, unit-tested, fail-closed adapter (the Orchestration
mapping pattern):

- **Risk** — `mapRiskItems` (org-wide `risk_items`).
- **Labeling translations** — document-id discovery via `GET /api/mdx/labeling`
  - `mapLabelTranslations` (language name via `Intl.DisplayNames`).
- **RBM site-risk** — `GET /api/mdx/rbm-site-risk` now takes an optional
  `program_id` (org-wide when omitted, so no UUID handle to discover) and
  LEFT JOINs `site_intel.sites` for the site country; the board adopts via
  `mapRbmSites`. The demo seed doesn't populate `rbm_site_risk_scores` yet, so
  in the seeded demo this panel still shows its "Sample data" fixture (correct
  fail-closed) — but a real org with recomputed site risk now loads live.

## 3. Labeled sample-data surfaces (by design — not defects)

These fail closed to kit fixtures with a visible "Sample data" pill because an
honest per-org backing store does not exist yet (planned later work), or the
surface is a pure calculator / static reference with no instance data to back:
document editors (DocumentAuthoring, EditorCockpit), Evidence RAG deep-search,
PvSignal (a deterministic disproportionality calculator — inputs → PRR/ROR/
BCPNN/EBGM, nothing to seed), Setup (installer-only backend — intentionally not
wired), InsightsCanvas, CER/PMA fixture panels, and the remaining
records-list surfaces not yet wired (filings-catalog and precedent-intelligence
— static taxonomies/search catalogs; batch-draft; task-board — already backed by
the tasking layer). device-510k is the ported MDX 510(k) sub-app whose instance
lists (eSTAR sections, predicates, SE matrix) are already live via the MDX data
layer; ivd-completeness is a computed catalog over the shared dossier spine (its
`IvdFamily` shape carries a non-serializable match predicate) — both correctly
left as-is rather than forced into a store. AnaDocTemplates/AnaDocContext/
SourceTracer are helper/static modules, not instance-data surfaces.

## 4. Config-gated (needs keys, not code)

- Stripe-backed licensing/checkout actions (`STRIPE_*`)
- AnA generative flows (AI-gateway key) — deterministic engines
  (readiness, dispatch gate, validation) work without keys

## 5. Known-good verification evidence

- Every v2 SURFACE_VIEWS surface mounts with 0 console errors (automated
  render audit, re-run after every wave/slice)
- First-use render gate: every surface renders crash-free with no backend
  reachable (`surfaceRender`). The former `liveBranchRender` gate forced the
  legacy `live ?? fixture` hooks into their "Live" branch; those hooks and the
  fixture fallback were deleted (ledger L72), so there is no second provenance
  branch left to render — a surface shows real data, an honest empty state, or
  an honest error state.
- Navigation-integrity gate: every literal in-app nav target
  (onNav/open/C2C.open/setSurface) resolves to a real SURFACE_VIEWS surface, a
  deep-link alias, the home hub, or a modal mode — no dead buttons
  (`navTargets`)
- Risk live-adoption mapper unit-tested end to end: label round-trip vs the
  write path, server-flag acceptability, and every fail-closed rejection
  (`riskMapping`)
- Every seed module dry-run against a real Postgres in a rolled-back
  transaction before landing; re-runs are no-ops (idempotency proven)
- Each Wave-2/3 read endpoint carries a route test: 403 without org, the
  exact display-key contract, and 42P01 fail-closed (empty/null, never 500)
- Full `tsc --noEmit` at 0 errors; route-mount + repo-health no-regression
  gates at +0 delta on every slice
- CI: typecheck, tests, Lint, schema-on-fresh-Postgres, and the Neon preview
  DB (migrations applied + schema verified + tests) green on PR #1026
- Every domain seed module in `scripts/seed/ga-demo.d/` is auto-loaded by the
  GA-demo orchestrator (glob loader), so seeding populates every live store

## 6. Filing an issue

Note the surface name (left nav + page title), whether its pill said
"Sample data" or "Live", and the browser console output. A "Sample data"
pill on a section listed in §2 after seeding = data/wiring bug (file it);
on a §3 surface it is expected behavior.
