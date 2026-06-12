# GA Gap Audit — code-grounded, whole-platform

**Date:** 2026-06-10
**Method:** Direct reconciliation of the live codebase against the prior audit corpus. Every claim below was checked against code as it exists now, not against the older report files (which have been removed — they were stale enough to be misleading).
**Supersedes:** the deleted pile of dated audits/evaluations/reviews (`C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md`, `SWARM_AUDIT_*`, `EXPERT_SWARM_EVALUATION_*`, `PRODUCT_QC_REVIEW_*`, `GENERAL_RELEASE_AUDIT_*`, etc.). Use this as the single current source of truth.

## Headline

The old "~52% GA-ready, 10 P0s" figure is **stale and understates the platform**. Re-checked against live code, most of those P0s are already built and tested; what remains is a smaller, sharper set dominated by **UI wiring, data ingestion, and two genuine integrations** — not missing backend engineering.

The recurring pattern across the whole platform is the same one the document audit found: **strong, tested backends with no UI wired to them.** That is the true center of gravity for GA, and it is design+integration work, not greenfield backend build.

## Status of the prior "P0" blockers (verified against code)

| Prior P0 claim | Real current state | Evidence |
|---|---|---|
| Fabricated outputs in regulated paths (random ACKs, hardcoded "ACCEPTED", success=0.5, random reviewer twins) | **FIXED.** FDA ESG paths fail closed (throw in production, deterministic `simulated:true` in test); reviewer-twin returns honest "not yet implemented" degradation; the remaining `Math.random()` is differential-privacy Laplace noise (legitimate) | `server/services/ESGSubmissionService.ts`, `fdaIntegrationService.ts` (+ `fdaIntegrationService.failclosed.test.ts`); `innovation/submission-readiness-twin-service.ts`; `cognitive-ecosystem/federated-learning.service.ts` |
| Sentence-level source traceability missing (the headline differentiator) | **Backend DONE, not wired.** `sentenceTraceabilityService.ts` (≈795 lines) does sentence splitting, per-sentence source mapping, click-through resolution, coverage reporting, persistence to `evidence_links`. No route exposes it; no client calls it | `server/services/sentenceTraceabilityService.ts` |
| eCTD XML export not implemented | **DONE.** Canonical packager produces ICH backbone + FDA/EMA/PMDA regional XML, MD5 index, ZIP; now bundles DTDs and runs PDF/A + DTD submission-grade gates | `server/services/submission-gateways/regional-packager.ts`, `server/services/ectd/{dtd-bundler,pdfa-readiness}.ts` |
| Module 5 (CSR) authoring missing — refuse-to-file | **DONE (scaffolds).** ICH E3 CSR/synopsis/ISS/ISE/protocol templates + `get_csr_template` AnA tool | `server/services/templates/clinical-csr-templates.ts` |
| EU MDR CER service "broken / not wired" | **FALSE — fully wired.** `UnifiedCERService` implemented (generate+validate, fail-closed), routes mounted at `/api/cer`, MEDDEV/GSPR conformance validator with tests. The prior "broken" claim (which my own earlier document audit repeated) was wrong | `server/services/cer/index.ts`, `server/bootstrap/register-regulatory-routes.ts`, `cer/cerConformanceValidator.ts` |
| Critical/High security issues (C1–C5, H1–H6) | **FIXED.** Hash-chained tamper-proof audit, HMAC seal that refuses to start in production without `AUDIT_HMAC_SECRET`, tenant isolation, regulated-delete audit coverage | `server/lib/tamper-proof-audit.ts`, `server/services/audit/chain.ts`, `auditService.ts` |

## What is genuinely still open (the real GA gap register)

### Tier 1 — blocks a credible pharma GA

1. **Authoring UI is the platform's weakest layer.** The editor (`client/src/components/ui/editor.jsx`) is a TipTap stub; real-time co-authoring (Yjs), versioning, annotations, approval workflow, e-signature, template management, and **sentence-level traceability** all have working backends and **no UI**. This is one cohesive design+integration program — see `HANDOFF_TO_DESIGN_document_authoring.md`. *Owner: design + frontend.*
2. **Regulatory corpus is data-starved.** The ingestion pipeline, CSR intelligence library, and precedent benchmarking are production-grade, but the shipped data is a ~535-row seed CSV with ~8 usable rows + a handful of guidance JSONs. Intelligence/prediction features query nearly-empty tables. *Owner: data-ops (licensing + intake), not engineering.* `server/services/corpus/*`, `regulatory_data/`, `data/csr_dataset*.csv`.
3. **Veeva Vault integration absent.** Zero code; an enterprise-pharma prerequisite. *Owner: engineering (new integration), ~weeks.*
4. **External eValidator not integrated.** Internal validators only; agencies run LORENZ eValidator. Interface + dispatch-gate wiring specced. *Owner: engineering + vendor license.* `EVALIDATOR_INTEGRATION_SPEC.md`.
5. **Licensed eCTD DTDs not vendored.** The bundling code + self-containment gate are done; the licensed `.dtd` files must be dropped into `assets/ectd-dtd/`. *Owner: procurement.*

### Tier 2 — credibility / completeness

6. **E-signature §11.50 manifestation incomplete.** All three elements (printed name, date/time, meaning) are captured and stored, but no endpoint returns a pre-formatted manifestation block for PDF/print embedding. *Small, isolated backend fix.* `server/routes/part11-compliance.ts`.
7. **Audit trail still fragmented** across ≥5 stores. The dangerous one (in-memory `auditLogger`) was fixed to forward to the canonical chain; full consolidation is an architecture decision. `server/services/audit/*`.
8. **MedDRA / FAERS-transmission / aggregate-report export** in PV are licensing/integration gates, not missing logic — intake, signal detection (ROR/PRR), scheduling, and ICSR/PBRER generation are real. `server/services/pharmacovigilance*`, `compliance/pv-signal-detection.ts`.
9. **Device technical-file leaf rendering** is structure-only; wire `coauthor_documents` → `leaf-pdf-renderer` for device packages. `server/services/ectd/assemble-from-core.ts`.
10. **CMC / Module 3** is real (composers, ICH rule sets, QbD analyzer, convergence/staleness tracking) but lacks auto-draft-from-uploads and UI surfacing. `server/services/cmc/*`, `module3-convergence-service.ts`.
11. **"Takeda 100h→2.6h" ROI claim** has zero supporting evidence anywhere in the repo — document or retract it (credibility risk).

### Tier 3 — backend-tractable now (no UI, low collision)

- E-signature §11.50 manifestation endpoint (Tier 2 #6) — ~30 min + test.
- Sentence-traceability **route** exposing the existing service (the UI is separate, but the API can land now).
- Contract test formalizing `auditLogger` → canonical forwarding.

## Honest GA posture

- **Engineering depth: high.** Biostatistics, audit/Part 11, eCTD assembly, CER, PV, CMC rule sets are real and tested.
- **Productization: the gap.** The value is trapped behind missing UI and empty data tables.
- **Realistic readiness:** strong for a **design-partner / beta** today; **full pharma-production** is gated on the authoring UI, corpus ingestion, and the two integrations (Veeva, eValidator) — weeks-to-a-quarter, mostly non-backend.

## Recommended execution order

1. Land the backend-tractable items now (Tier 3) — pure, isolated, testable.
2. Run the authoring-UI program off `HANDOFF_TO_DESIGN_document_authoring.md` (design-owned) — unlocks the most trapped value in one initiative.
3. Stand up corpus ingestion (data-ops) and the Veeva + eValidator integrations (engineering) in parallel.
4. Close the procurement items (DTDs, MedDRA, eValidator license) — the code seams already exist behind opt-in flags.
