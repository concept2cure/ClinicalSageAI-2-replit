# GA Readiness Register — 2026-07-05

**Date:** 2026-07-05
**Status:** Single current source of truth for GA state.
**Supersedes:** [`GA_GAP_AUDIT_2026-06-10.md`](../GA_GAP_AUDIT_2026-06-10.md) (whole document) and the status/maturity claims of [`docs/GA_READINESS_PLAN.md`](./GA_READINESS_PLAN.md) (2026-06-16 — its phase structure remains the working plan). The feature inventory in [`docs/FEATURE_CATALOG_2026-06-16.md`](./FEATURE_CATALOG_2026-06-16.md) remains valid as an inventory; its maturity flags predate the closures below.
**Method:** Every "closed" claim in this register was re-verified against code on 2026-07-05 (paths and line references below), not carried forward from the prior documents.

## Headline

The platform's backend depth is real and the June audits' engineering gaps have largely been closed in code; the GA gate is no longer backend build. What now stands between the platform and a credible pharma GA is (1) operational posture (RLS enforcement flip, corpus ingestion run, audit consolidation decisions), (2) procurement and vendor licensing (eCTD DTDs, eSTAR templates, MedDRA, LORENZ, gateway credentials), and (3) the design-owned authoring/UI program. The current branch (2026-07-05 session) closes the remaining security-architecture items — a global default-deny auth boundary, real CI enforcement of the existing security gate scripts, and tenant-scoping fixes — which were the last engineering-owned GA blockers.

## Closed since the prior audits (verified in code, 2026-07-05)

| Item (prior reference) | State | Evidence |
|---|---|---|
| External eValidator integration (GA_GAP_AUDIT Tier 1 #4) | **Seam closed.** Pluggable external-validator seam with fail-closed gate and FDA-criteria fallback adapter; wired into the dispatch-readiness gate. Only the LORENZ engine itself remains, behind a vendor license (see punch list). | `server/services/ectd/external-validator/` (`gate.ts`, `fda-criteria-adapter.ts`, `lorenz-adapter.ts`, `noop-validator.ts`, `__tests__/`); wired at `server/services/ectd/assess-dispatch-readiness.ts:178` |
| Device technical-file leaf rendering (Tier 2 #9) | **Closed.** Device package leaves render through `renderLeafPdf` (genuine PDFs, not structure-only); unresolved leaves are surfaced rather than silently skipped. | `server/services/ectd/assemble-from-core.ts` |
| CMC Module 3 auto-draft-from-uploads (Tier 2 #10) | **Closed.** Auto-draft composer implemented, exposed as routes, and mounted in the core route spine. | `server/services/cmc/auto-draft-composer.ts` → `server/api/cmc/module3AutoDraftRoutes.ts` → `server/bootstrap/register-core-routes.ts:19` |
| Part 11 §11.50 signature manifestation (Tier 2 #6) | **Closed.** Printed name, date/time, and meaning captured and rendered as a manifestation block for PDF/print embedding. | `server/routes/part11-compliance.ts:96-133` |
| Tamper-proof audit hash verification (Plan 1.2 "methods stubbed") | **Closed.** `verifyChain` implemented over the hash-chained log; returns a real verification result. | `server/lib/tamper-proof-audit.ts:314` |
| Test routes mounted in production (Plan 0.6) | **Closed.** Test/demo routes production-fenced. | env guard on the test-route mounts |
| Dead ORM (Plan 0.4, ORM half) | **Closed.** Prisma archived; Drizzle is the single canonical ORM. (The ~34 CDISC schema-only stub tables remain a DB-owner decision — see punch list.) | repo state |
| Typecheck baseline | **Closed.** 2598 errors → 0. | CI typecheck |

## In flight (this branch, 2026-07-05 session)

Security-architecture hardening in progress on `claude/concept2cure-v2-ga-audit-dlklsf`. Mark these "in flight (this branch)" until merged; they are engineering-owned and do not appear in the punch list below.

1. **Security CI gates actually enforced.** ~14 existing gate scripts (`gateway-bypass`, `jwt-verify-pinned`, `no-mock-in-prod-routes`, `governed-export-*`, `runtime-canonicality`, `legacy-dep-quarantine`, `token-cascade`, `editor-integrity`, `reasoning-tier-*`) were previously wired into no workflow; being wired into CI.
2. **Global default-deny auth boundary** over the 333-file route surface (previously per-mount; `/api/templates`, `/api/intelligent-docs`, `/api/control-plane`, and the phase3 mounts were unauthenticated). Plus: org-membership TTL re-check in `authenticateToken` (previously revoked users kept access up to 24 h) and closure of a staging-reachable dev org-fallback.
3. **AI gateway:** the inert `piiDetection` flag made real; prompt-injection scanning extended to non-user content (RAG/tool output).
4. **Dead-letter queue:** cross-tenant read/clear scoped to tenant and admin-gated.
5. **Uploads/egress:** template-upload magic-byte validation; un-timed outbound fetch given a timeout.
6. **IND lifecycle persistence** wired for amendment, safety-report, and annual-report flows.
7. **Production boot posture:** RLS at boot now requires an explicit operator decision (previously silent default-off with a warning); audit-chain integrity sweep default-on in production; veraPDF added to the deploy image.
8. **Duplicate-module hazard:** `.js`/`.ts` duplicate security-critical modules resolved, with a CI shadow guard against recurrence.

## Open punch list (by owner)

Effort tags: S = hours, M = days, L = weeks/program.

### Procurement / licensing (code seams exist and fail closed; waiting on vendors)

| Item | Effort | Notes |
|---|---|---|
| eCTD DTDs into `assets/ectd-dtd/` | S | Drop-in: the 5 licensed files named in `assets/ectd-dtd/checksums.txt` (`ich-ectd-3-2.dtd`, `us-regional-v2-01.dtd`, `eu-regional.dtd`, `jp-regional.dtd`, `ca-regional.dtd`); manifest currently has zero filled entries. Bundler + self-containment gate already built. |
| Official FDA eSTAR AcroForm templates + field-map population | M | `assets/estar-templates/` contains only a README; fill engine is built and fail-closed until templates land. |
| MedDRA dictionary license | S–M | Procurement S; data load M. Blocks PV coding; intake/signal-detection logic is already real. |
| LORENZ eValidator license + engine | M | `server/services/ectd/external-validator/lorenz-adapter.ts` throws fail-closed (~line 51) until the licensed engine is integrated; the seam, gate, and FDA-criteria fallback are done. |
| ICSR E2B(R3) gateway credentials (FDA ESG / EudraVigilance) | M | `server/services/ind-lifecycle/icsr-gateway-transport.ts` throws fail-closed (~line 196) with no configured gateway; composer and envelope validation are done. Includes connectivity testing. |

### Ops (no engineering blocker)

| Item | Effort | Notes |
|---|---|---|
| Run the corpus ingestion sweep | S–M | `scripts/ingest-corpus.ts` + `docs/runbooks/corpus-ingestion.md`; gated by `ENABLE_CORPUS_INGESTION`. Corpus tables are empty until run — RIM/precedent/prediction features remain in honest cold-start until then. |
| Veeva Vault customer-credential UAT | M | Engineering closed 2026-06-10; needs real Vault credentials and a customer-vault UAT pass. |
| Enable and validate `RLS_ENFORCE=on`, staging → production | M | The highest-severity open ops item (Plan 0.1). Requires DB-owner assist for query-surface validation (below). Boot-time posture change is in flight on this branch. |
| Decide coverage-threshold enforcement | S | `ci.yml` currently forces all coverage thresholds to 0 and runs the coverage job `continue-on-error` (`.github/workflows/ci.yml:261-264`); it measures, never blocks. Decide a floor and remove the overrides. |

### DB-owner (explicitly out of scope of the 2026-07-05 session)

| Item | Effort | Notes |
|---|---|---|
| Audit-trail consolidation | L | ~20 domain audit tables to consolidate into, or federate with, the canonical hash chain. Architecture decision plus migration. |
| RLS query-surface validation for the enforcement flip | M | Verify the query surface behaves under enforced RLS before the staging→production flip. |
| ~34 CDISC schema-only stub tables | S (decision) / M (if dropped) | Drop or explicitly justify (Plan 0.4, schema half). |

### Design / UI-owner (explicitly out of scope of the 2026-07-05 session)

| Item | Effort | Notes |
|---|---|---|
| Authoring UI program | L | The platform's largest trapped-value item; one cohesive program per `HANDOFF_TO_DESIGN_document_authoring.md`. Backends (co-authoring, versioning, annotations, approvals, e-sign, templates) exist. |
| Fixture-backed surfaces on the GA spine | M | Biopharma Pathway/Meetings surfaces, AdminSurface; wire to live endpoints (Plan 1.3). |
| Sentence-traceability click-through UI | M | Backend + API done (`/traceability/*`); UI is the differentiator's last mile. |

### Deferred engineering (not GA-blocking)

| Item | Effort |
|---|---|
| PDF/A-1b archival leaf fidelity (current output = deterministic text PDF) | M |
| CSV IQ/OQ/PQ validation package | L |
| GraphRAG tables | M |
| Observability wiring (OTel/Langfuse dashboards + SLOs) | M |
| Env-var documentation drift (~409 referenced vs 178 documented) | S |

## Explicitly out of scope of the 2026-07-05 session

By instruction, the 2026-07-05 session touches neither the database layer nor the UI:

- **DB:** audit-trail consolidation, RLS query-surface validation, CDISC stub-table decision (DB-owner table above).
- **UI:** the authoring UI program, fixture-surface wiring, sentence-traceability click-through (Design/UI-owner table above).

Nothing in this register should be read as deferring those items' priority — the authoring UI program and the RLS enforcement flip remain the two largest GA levers. They are simply not this session's work.

## ROI-claim disposition ("Takeda 100h → 2.6h")

GA_GAP_AUDIT item 11 flagged this claim as having no supporting evidence as a platform metric; the entitlements ground rule (`MDX_PAYING_CUSTOMER_VALUE_AND_ENTITLEMENTS_2026-06-15.md` §2) directs that it not be repeated. Disposition, verified 2026-07-05:

- The figure is **retracted as a Concept2Cure/ClinicalSageAI metric**. It must not appear in product copy, sales material, or platform documentation as a claim about this platform. The only defensible formulation until a benchmark exists: substantial cycle-time reduction reported in early pilots; formal benchmark pending.
- The number originates from a **competitor's published study** (Weave Bio × Takeda, arXiv:2509.09738). Where it appears in the repo's competitive-research documents it is attributed to Weave Bio and stays as competitor intelligence; those documents now carry an explicit do-not-reuse attribution note.
- Repo sweep (client/, server/, all `*.md`): no occurrence presents the claim as this platform's own. `client/` has zero occurrences; `server/` matches are ClinicalTrials.gov sponsor data (`server/scripts/data/clinical_trials_cancer_20250409_214935.json`), not ROI copy. The one invented illustrative figure in a strategy doc was neutralized (`docs/reports/COMPETITIVE_CLICK_THROUGH_EVALUATION_2026-03-27.md`).

## Recommended execution order

1. **Merge this branch** (security CI gates, default-deny auth boundary, tenant-scoping, boot posture) — closes the last engineering-owned GA blockers.
2. **Ops posture, immediately after:** run the corpus ingestion sweep; validate and flip `RLS_ENFORCE=on` in staging with DB-owner query-surface validation, then production; decide coverage thresholds.
3. **Procurement in parallel:** eCTD DTDs (drop-in), eSTAR templates, LORENZ license, MedDRA, gateway credentials — all code seams are built and fail closed, so each item is unblocking-by-delivery.
4. **Design program:** authoring UI + fixture-surface wiring + sentence-traceability click-through, per the existing hand-off.
5. **DB-owner track:** audit-trail consolidation decision and CDISC stub-table decision, scheduled independently.
6. **Deferred engineering** as capacity allows; none of it gates GA.
