# Phase 8 — Legacy Retirement & Confidence-Hygiene Remediation

**Scope (per the migration plan).** Deprecate/quarantine the orphaned legacy services, and remove the score/confidence *fabrication* that reaches users, with a documented, reversible plan. Every verdict below was established by a full-repo caller/blast-radius analysis (import + call-site grep, not filename), cross-checked against `CLINICAL_REGULATORY_EVIDENCE_DISCOVERY.md`.

**Guardrail already in place (Phase 7).** None of the fabricated values below can influence the calibrated risk model: `server/services/intelligence/prediction-governance.ts` locks the invariant that the serving feature vector carries only completeness/submission-metadata signals (no precedent/CRL/derived-probability feature, realized outcomes zeroed at inference). So these are *display/retrieval* hygiene issues, not prediction-integrity ones.

---

## Part A — Legacy retirement (DEAD services: deprecated now, removable next)

All three have **zero production callers** (verified). They are marked `@deprecated` in-code now (JSDoc banner, the house convention) and are safe to delete in a follow-up once the deprecation has soaked. Deletion steps + rollback are recorded so removal is mechanical.

| # | File | Verdict & evidence | Removal steps (when deleted) | Rollback |
|---|---|---|---|---|
| 1 | `server/services/study-design-agent-service.ts` | **DEAD** — referenced only by the barrel re-export (`server/services/index.ts:62`) and a never-resolved `SERVICE_REGISTRY` string (`server/services/index.ts:156` `'clinical.study-design'`). No method caller. | Delete file; remove `index.ts:62` export line and the `:156` registry key. | `git revert` |
| 2 | `server/agent-service.ts` (2nd, duplicate `StudyDesignAgentService`, HF/Mixtral) | **DEAD** — zero importers anywhere (self-reference is the logger name only). | Delete file. | `git revert` |
| 3 | `server/protocol-knowledge-service.ts` | **DEAD** — one importer (`server/research-companion-service.ts:6`) that never calls a method; the intermediary `researchCompanionService` is itself uninvoked. | Delete file; remove the dead import at `research-companion-service.ts:6`. | `git revert` |

**Superseded by:** `server/services/clinical-regulatory-evidence/study-design-evidence.service.ts` (evidence-composed, honesty-gated study-design analysis) + the CSR adapter/evidence spine. New study-design analysis flows through AnA's clinical-regulatory-evidence tools, not these.

**Why deprecate-then-delete (not delete-now):** matches the repo's reversible-removal convention (`docs/audits/DELETION_QUARANTINE_AND_MIGRATION_REGISTER.md`). The `@deprecated` banners make the intent visible at every call site an IDE surfaces, and CI/typecheck confirms nothing depends on them before the delete commit.

---

## Part B — Foresight path (LIVE, already Sunset-flagged): retire, don't patch internals

The foresight path is **live but already HTTP-deprecated** — `server/bootstrap/register-integrations-routes.ts:9-14` sets `Deprecation: true` + `Sunset: 2026-04-01` on `/api/foresight`, `/api/foresight-ai`, `/api/foresight-feedback`. It also reaches users through the `compute_dose_escalation` AnA command (`server/services/ana-ri/command-executor.ts:2636-2653`) and Cortex re-mounts (`server/routes/cortex-unified.ts:1275/1284/1293`).

**Decision:** because the whole path is on a published Sunset, the correct action is **retirement of the path**, not investing in de-fabricating its internals. Retirement checklist (follow-up, reviewed):
1. Remove/redirect the three mounted prefixes (`register-integrations-routes.ts:18-20`) and the Cortex re-mounts.
2. Retire or redirect the `compute_dose_escalation` command to the honest dose-strategy surface — `clinical-regulatory-evidence/study-design-evidence.service.ts` `assessDoseStrategy`, which **emits no dose value** and requires a governing calculation + expert review (the honest replacement for the fabricated `±20%/±25%-of-dose` "confidence intervals" at `foresight-ai-engine.ts:400,:459` and the `confidence: 0.85 // Would calculate actual` at `:1065`).
3. Until the path is removed, its Sunset headers already warn consumers.

---

## Part C — Confidence-hygiene remediation (LIVE user-facing outputs — reviewed execution)

These three fabrications reach users through **live public-API JSON and AnA command results**. Each fix changes a user-visible number, so it is specified here for reviewed execution rather than changed blind — the honest replacement must preserve each field's *shape* so no consumer breaks.

### C1 — Hardcoded `0.9` precedent confidence
- **Write:** `server/services/intelligence/outcome-precedent-ingestor.ts:196` — every machine-ingested precedent is stamped `confidence_score = 0.9` regardless of the outcome's evidence.
- **Readers (must be preserved):** `server/services/precedent-engine.ts:279` sorts `ORDER BY decision_date DESC NULLS LAST, confidence_score DESC`; `:1120` maps `confidenceScore: row.confidence_score ?? 1.0`. Surfaces: AnA `lookup_regulatory_precedents` (`AnaToolExecutor.ts:6297-6316`) and public API `GET /api/v1/precedent/search` (`public-api.ts:481-498`).
- **Honest fix (behavior-preserving):** distinguish "record confidence" (the precedent is a real, verified recorded outcome → legitimately high) from a *measured* quality score. Replace the bare literal with a **named, documented** provisional constant AND stamp `metadata.confidence_basis = 'ingestor_default'` so the value is honestly labeled as a default, not a measurement. Do **not** switch to `NULL` without first changing both the `?? 1.0` map fallback (`:1120`) and the `confidence_score DESC` sort (`:279`, which is `NULLS FIRST` under DESC) — otherwise un-scored precedents get promoted to the top. This coupling is why the change is reviewed, not blind.

### C2 — Fabricated endpoint `success_rate` / `confidence`
- **Sites:** `server/services/endpoint-recommender-service.ts` — `:217 success_rate: 75`, `:224 confidence: 0.7`, `:270 +10`, `:288 +15`, `:376 success_rate: 80`, `:819 : 75` fallback, `:833 confidence: 0.9`, `:1052/:1060` eval fallbacks. Note `:819`'s computed rate is structurally 0 (its `reportOutcome` is always `''`), so the fabricated fallbacks dominate.
- **Surfaces (must keep field shapes):** public API `GET /api/v1/endpoint/recommend` (`public-api.ts:443-448`) and `/api/v1/trial-design/suggest` (`:546-553`); AnA `recommend_endpoints`/`evaluate_endpoint` (`command-executor.ts:3423-3426,:3463-3464`, the score written into the user-facing message).
- **Honest fix:** replace the fabricated defaults/bumps with either an evidence-derived rate (numerator/denominator from real trial outcomes) **or** an explicit `null` + a `basis: 'insufficient_evidence'` marker, keeping `success_rate`/`confidence` present but honest. The AnA message must stop asserting a fabricated `N/100`. This is the largest of the three (the service is ~1150 lines and heavily branched); do it behind its existing return shape.

### C3 — Foresight dose confidence intervals
Covered by **Part B** (retire the path); the honest dose surface is `assessDoseStrategy` (no dose value, governing-calc-required).

---

## Sequencing recommendation
1. **Now (this commit):** `@deprecated` banners on the 3 DEAD services + this plan. Safe, reversible, zero behavior change.
2. **Next (reviewed):** delete the 3 DEAD files + their dead wiring (mechanical, per Part A) once soaked.
3. **Next (reviewed, user-facing):** C1 then C2 behind preserved field shapes; retire the foresight path (Part B). These change numbers users see, so they land as their own reviewed commits with the field-shape guarantees above.
