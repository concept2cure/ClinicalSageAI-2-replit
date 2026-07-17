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
| Admin | Apps (module subscriptions) | live list + toggle |

## 3. Labeled sample-data surfaces (by design — not defects)

These fail closed to kit fixtures with a visible "Sample data" pill, because
an honest backing store does not exist yet (planned Wave-2/3 work):
document authoring cluster (Dossier, DocumentAuthoring, ArtifactsCenter),
NDA/IND cockpit moat phases, PV signal composites, Evidence RAG panels,
InsightsCanvas/MarketAccess, CER/PMA fixture panels, v2 Risk (ISO 14971
device-risk variant; the standalone risk module is the live one), RBM tab
composites, Setup (no backend exists).

## 4. Config-gated (needs keys, not code)

- Stripe-backed licensing/checkout actions (`STRIPE_*`)
- AnA generative flows (AI-gateway key) — deterministic engines
  (readiness, dispatch gate, validation) work without keys

## 5. Known-good verification evidence

- 84/84 v2 surfaces mount with 0 console errors (automated audit, re-run
  after every wave)
- Every seed module dry-run against a real Postgres in a rolled-back
  transaction before landing; re-runs are no-ops (idempotency proven)
- 55+ route/service tests across the new read layers
- CI: typecheck, tests, Lint, schema-on-fresh-Postgres, Neon preview
  migrations all green on PR #1025

## 6. Filing an issue

Note the surface name (left nav + page title), whether its pill said
"Sample data" or "Live", and the browser console output. A "Sample data"
pill on a section listed in §2 after seeding = data/wiring bug (file it);
on a §3 surface it is expected behavior.
