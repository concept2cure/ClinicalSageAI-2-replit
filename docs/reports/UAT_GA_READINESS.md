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

Sign-in (printed by the seeder): `jm.smith@concept2cure.pro` / `pass-word`,
plus six role-scoped team members (`…@concept2cure.pro` / `demo-2026`).
Rotate these before any shared or externally reachable deployment.

## 2. What testers should see — live surfaces (seeded)

| Area | Surfaces | Backed by |
|---|---|---|
| Projects & portfolio | Projects list, project detail | `regulatory_programs` (5–7 programs) |
| Risk (standalone module) | Overview, Register, Matrix, Controls | 9 risk items + 14 controls |
| Tasks & approvals | Tasking board/list, Approvals, Review queue | 12 unified tasks; approval-workflow chain |
| Audit & compliance | Communication audit timeline; Dispatch readiness gate | 12 governed-action events; real dispatch-gate engine |
| Submission | Overview, Transmittals (+findings) | 8 transmittals, 9 findings |
| Device (mdx) | UDI, Postmarket (vigilance/CAPA), Analytics, IVD, Engineering | 8 UDI records; 8 events + 5 CAPAs; aggregate base rows |
| Vault & memory (mdx) | Vault, AnA memory | 9 artifacts + 22 versions; 9 memory atoms |
| Labeling | Translation board, symbols glossary | doc + 7 translations; 12 ISO 15223-1 symbols |
| Translation module | Projects, Segment workspace, Glossary | full `/api/translation` route layer (was 404) |
| Nonclinical | Study review board (+SEND status) | 6 studies + SEND datasets |
| Clinical ops | Studies & enrollment board | 3 studies |
| Biopharma | Specialty (pediatric/orphan/lifecycle), programs | dedicated stores + programs |
| Templates | Template library | 4 templates with docTypes |
| Training | Learning paths, certifications | 6 paths, 3 certifications |
| Change control | Change assessment | 2 assessments (FDA/EU decision trees) |
| Orchestration | Readiness panel, approval checkpoints | computed readiness; `approval_checkpoints` |
| Admin | Apps (module subscriptions); Admin console access grants | live module list + toggle; audited `platform_role_grants` |
| Post-submission | HAQ manager (rounds + questions) | `project_memory_entries` (2 letters, 8 questions) |
| Human factors | HFE/UE file + use scenarios | `c2c_hf_files` + `c2c_hf_scenarios` (1 file, 6 scenarios) |
| Safety / PV | SafetyNarrative SAE worklist | `c2c_sae_cases` (3 cases; ICH E3 §16 composer client-side) |
| NDA cockpit | CTD module readiness + overall % | `c2c_nda_modules` (5 modules, 80% ready) |
| Evidence | Saved evidence-ask (answer + chunks) | `c2c_evidence_asks` (1 ask, 3 chunks) |
| Document lifecycle | DocJourney stage rail | `c2c_doc_journeys` (9 stages) |
| Agency interactions | Agency meetings + briefing books/minutes | `c2c_agency_meetings` (4 meetings) |
| Device design | Design controls (820.30 traceability) | `c2c_design_controls` (7 inputs) |
| CRO | Sponsor portfolio roster | `c2c_cro_portfolio` (5 sponsors) |
| Evidence pool | pdev EvidencePicker | `c2c_evidence_objects` (11 objects) |
| Biostatistics | SAP / sample-size / interims sections | `c2c_biostat_*` |

Each Wave-2/3 surface adopts live data only when the store returns its full
display shape, else fails closed to the codebase fixture with a "Sample data"
pill — so a "Live" pill on any of these after seeding is the proof it worked.

## 3. Labeled sample-data surfaces (by design — not defects)

These fail closed to kit fixtures with a visible "Sample data" pill because an
honest per-org backing store does not exist yet (planned later work), or the
surface is a pure calculator / static reference with no instance data to back:
document editors (DocumentAuthoring, EditorCockpit), Evidence RAG deep-search,
PvSignal (a deterministic disproportionality calculator — inputs → PRR/ROR/
BCPNN/EBGM, nothing to seed), Setup (installer-only backend — intentionally not
wired), InsightsCanvas, CER/PMA fixture panels, v2 Risk (ISO 14971 device-risk
variant; the standalone risk module is the live one), and the remaining
records-list surfaces not yet wired (labeling-pi, protocol-dev, ind-checklist,
filings-catalog, precedent-intelligence, market-access, program-journey,
device-510k, ivd-completeness, shadow-review, batch-draft, research-admin,
task-board). AnaDocTemplates/AnaDocContext/SourceTracer are helper/static
modules, not instance-data surfaces.

## 4. Config-gated (needs keys, not code)

- Stripe-backed licensing/checkout actions (`STRIPE_*`)
- AnA generative flows (AI-gateway key) — deterministic engines
  (readiness, dispatch gate, validation) work without keys

## 5. Known-good verification evidence

- Every v2 SURFACE_VIEWS surface mounts with 0 console errors (automated
  render audit, re-run after every wave/slice)
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
