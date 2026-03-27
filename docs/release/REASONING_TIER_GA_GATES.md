# Reasoning Tier GA Gates

**Status:** Draft gate policy  
**Date:** 2026-03-27

---

## GA Criteria (All Required)

1. **SLA/SLO defined and sustained**
   - p95 latency, availability, timeout budgets per action class
   - sustained compliance over agreed burn-in period

2. **Security hardening complete**
   - internal-only access
   - authenticated service calls
   - payload validation and size limits

3. **Abuse/rate controls complete**
   - per-org and per-action quotas
   - budget and admission controls

4. **Governance parity enforced**
   - no beta-visible high-stakes route bypasses governed persistence requirements
   - governed route + consequence-shape CI checks pass (`ci:governed-export-routes`, `ci:governed-export-consequence-shape`)

5. **Human review policy codified**
   - explicit per-action review requirements
   - exceptions auditable and role-restricted

6. **Monitoring/incident operations complete**
   - dashboards, alerts, runbooks, rollback switches

7. **Customer trust language finalized**
   - UI and docs explain what was checked, evidence used, and review requirements

8. **Regulatory + medical-writing quality thresholds enforced**
   - scoring uses `docs/evals/REGULATORY_WRITING_QUALITY_RUBRIC.md`
   - red-flag phrase controls use `docs/evals/MEDICAL_WRITING_RED_FLAG_PATTERNS.md`
   - terminology consistency uses `docs/evals/REGULATORY_TERMINOLOGY_GLOSSARY.md`
   - edit constraints follow `docs/release/REASONING_TIER_MEDICAL_WRITING_EDIT_POLICY.md`
   - no GA promotion if any run has rubric dimension score <= 2

9. **Documentation synchronized with code truth**
   - stale bypass claims removed
   - architecture, benchmark, and gate docs current

10. **Governed consequence contract checks enforced in CI**
   - route contract check (`ci:governed-export-routes`) passing
   - payload shape check (`ci:governed-export-consequence-shape`) passing
   - readiness suite check (`ci:reasoning-tier-readiness`) passing

11. **Human UAT completed and signed off**
   - scenarios from `docs/release/REASONING_TIER_HUMAN_UAT_PLAN.md` executed across required cohorts
   - medical-writing scenario pack `docs/release/REASONING_TIER_MEDICAL_WRITING_UAT_SCENARIOS.md` executed
   - Regulatory Affairs review checklist `docs/release/REASONING_TIER_REG_AFFAIRS_REVIEW_CHECKLIST.md` completed
   - run evidence captured with `docs/release/REASONING_TIER_UAT_EVIDENCE_TEMPLATE.md`
   - evidence stored under `docs/release/evidence/reasoning-tier-uat/`
   - evidence integrity check (`ci:reasoning-tier-uat-evidence`) passing
   - Regulatory + QA lead sign-off documented
   - operator checklist completed (`docs/release/REASONING_TIER_OPERATOR_SIGNOFF_CHECKLIST.md`)


---

## GA Blockers (Automatic No-Go)

- any unresolved governed export bypass on primary user paths
- unsupported claim rate above threshold
- missing audit envelope fields on accepted outputs
- inability to fail closed during Reasoning Tier outage
