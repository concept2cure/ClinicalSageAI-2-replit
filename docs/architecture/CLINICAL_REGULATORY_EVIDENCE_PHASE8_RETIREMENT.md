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

### C1 — Hardcoded `0.9` precedent confidence — ✅ DONE
- **Write:** `server/services/intelligence/outcome-precedent-ingestor.ts:196` — every machine-ingested precedent was stamped `confidence_score = 0.9` regardless of the outcome's evidence.
- **Readers (preserved):** `server/services/precedent-engine.ts:279` sorts `ORDER BY decision_date DESC NULLS LAST, confidence_score DESC`; `:1120` maps `confidenceScore: row.confidence_score ?? 1.0`. Surfaces: AnA `lookup_regulatory_precedents` (`AnaToolExecutor.ts:6297-6316`) and public API `GET /api/v1/precedent/search` (`public-api.ts:481-498`).
- **Fix shipped:** replaced the hardcoded literal with `deriveIngestConfidence(...)` — confidence is now DERIVED (0.5..0.9) from how complete the ingested record is (recognized decision, dated, FDA questions captured, risk factors extracted, embedded). The field stays a non-null number in-range, so the live sort and the `?? 1.0` map fallback are unaffected; only newly-ingested rows change, and 0.9 remains the ceiling a fully-documented outcome earns (>0.9 stays reserved for human-curated precedents). This avoided the `NULL` coupling with the `NULLS FIRST` sort. Test: `__tests__/outcome-precedent-ingestor.test.ts` (3/3).

### C2 — Fabricated endpoint `success_rate` / `confidence` — ✅ DONE
- **Sites (were):** `endpoint-recommender-service.ts` — `success_rate: 75` (AI), `success_rate: 80` (academic), `+10`/`+15` merge bumps, a `: 75` CSR fallback (its computed rate was structurally 0, `reportOutcome` always `''`), and `:1052/:1060/:1068/:1077` eval-score fallbacks (75/70/65/60).
- **Surfaces (field shapes preserved):** public API `GET /api/v1/endpoint/recommend` + `/api/v1/trial-design/suggest` (passthrough JSON); AnA `recommend_endpoints`/`evaluate_endpoint`. Verified every consumer is null-safe — `ana-ri-inline-routes.ts:79` already `typeof`-guards `success_rate`, and the AnA evaluate message now branches on a null score.
- **Fix shipped:** `success_rate` is now `number | null` and is emitted ONLY from real recorded outcomes (successful trials actually present); it is never fabricated and never a misleading 0. The arbitrary `+10`/`+15` bumps are gone. Ranking + labeling now use an honest, transparent `evidence_strength` (0–100) + `evidence_basis` (`regulatory_recommended` › `corpus_outcomes` › `corpus_frequency` › `academic_literature` › `ai_suggested`), derived from evidentiary basis + corpus recurrence + corroboration (`deriveEvidenceStrength`/`classifyEndpointBasis`/`normalizeEndpointEvidence`, applied in one normalization pass before return). The evaluate score is `number | null` — no fabricated fallback; the AnA message says "could not be scored automatically" when null. Test: `__tests__/endpoint-recommender-evidence.test.ts` (7/7).
- **Note:** per-evidence `confidence` values (source-relevance heuristics, e.g. `0.7`/`0.9`) were left as-is — they are retrieval-relevance signals, not success claims, and are lower-value/higher-churn; the headline "success rate" fabrication is resolved.

### C3 — Foresight dose confidence intervals
Covered by **Part B** (retire the path); the honest dose surface is `assessDoseStrategy` (no dose value, governing-calc-required).

---

## Sequencing recommendation
1. **Done:** `@deprecated` banners on the 3 DEAD services + this plan (commit `d36180a`). Safe, reversible, zero behavior change.
2. **Done:** C1 precedent-confidence de-fabrication behind the preserved numeric field shape (write-side, new rows only). Tested.
3. **Done:** C2 — endpoint `success_rate` de-fabrication behind preserved (null-safe) field shapes: nullable success_rate emitted only from real outcomes, honest `evidence_strength`/`evidence_basis` for rank/label, no fabricated eval score. Tested.
4. **Next (reviewed):** delete the 3 DEAD files + their dead wiring (mechanical, per Part A) once soaked.
5. **Next (reviewed, route removal):** retire the already-Sunset foresight path (Part B) — this also removes the fabricated dose confidence intervals (C3). Deferred because it removes live mounted routes + an AnA command, which warrants a coordinated cutover.
