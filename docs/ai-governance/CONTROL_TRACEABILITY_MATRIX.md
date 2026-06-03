# AI governance control → regulation traceability matrix

Maps each implemented AI-governance control to the regulatory expectations it
addresses and the code/evidence that implements it. Scoped to what is **built**;
executed validation protocols live under `docs/validation/`.

Standards referenced: 21 CFR Part 11 (electronic records/signatures), GAMP 5
(risk-based CSV), ISO 14971 (risk management), FDA 2025 draft framework on AI
credibility for regulatory decision support, EU Annex 11.

| # | Control | Regulatory expectation | Implementation / evidence |
| - | ------- | ---------------------- | ------------------------- |
| C1 | Per-capability intended use | FDA 2025 (intended use of context of use); GAMP 5 (risk-based categorization) | `ai-governance/risk-tiers.ts`; `ana_capability_registry.intended_use`; `EVIDENCE_PACK.md §2` |
| C2 | Per-capability risk tier | FDA 2025 (model risk = influence × consequence); ISO 14971 (risk evaluation) | `risk-tiers.ts` (CATEGORY_POLICY + overrides); `ana_capability_registry.risk_tier` |
| C3 | Defined human-oversight control per feature | FDA 2025 (human-in-the-loop); ISO 14971 §3.5.3 (information for safety); Annex 11 §1 | `risk-tiers.ts` (humanOversight); export/accept gates |
| C4 | Model & version pinning | GAMP 5 (configuration mgmt); Part 11 §11.10(a) (validation) | `ai-governance/approved-models.ts` (lockfile); gateway `DEFAULT_MODELS` |
| C5 | Drift detection on model swap | GAMP 5 (change control); FDA 2025 (re-validation on change) | `approved-models.ts` `detectModelDrift` + drift-gate test |
| C6 | Per-request capture of model/prompt/params/sources | Part 11 §11.10(e) (audit of record creation); reproducibility | `ai-gateway/audit.ts` (model, model/prompt version, prompt hash, temperature, seed, fallback chain) |
| C7 | All AI calls audited (no bypass) | Part 11 §11.10(e); GAMP 5 (completeness of records) | `scripts/ci/check-gateway-bypass.mjs` + baseline |
| C8 | Groundedness score per claim | FDA 2025 (output reliability); ISO 14971 H-AI-005 (hallucination control) | `ai-governance/groundedness.ts` (citation coverage); `confidenceScoringEngine.ts` |
| C9 | Human review forced below threshold | FDA 2025 (human oversight proportional to risk); Annex 11 §1 | `ai-governance/review-policy.ts`; `422 GROUNDEDNESS_REVIEW_REQUIRED` at accept endpoints |
| C10 | Model cards | FDA 2025 (transparency, known limitations); GAMP 5 (supplier/component documentation) | `docs/ai-governance/MODEL_CARDS.md` + generator |
| C11 | Accuracy evaluation per document type | FDA 2025 (performance for the context of use); GAMP 5 (PQ) | `server/eval/{rag,doc-quality}/`; `docs/validation/PQ-CORTEX-001` |
| C12 | Immutable, tamper-evident audit trail | Part 11 §11.10(c)(e); Annex 11 §9 | `c2c_ana_actions` + `audit_logs` + SHA-256 chain (`services/audit/chain.ts`) |
| C13 | Audit integrity verification (periodic) | ISO 14971 §9 (monitoring); Part 11 §11.10(c) | `GET /api/c2c/actions/verify-chain`; `jobs/auditChainIntegritySweep.ts` (daily) |
| C14 | Re-authentication for high-risk actions | Part 11 §11.10(d), §11.200 (signature controls) | `server/routes/c2c/actions.ts` re-auth gate (sign/lock/revoke) |
| C15 | Authentication on AI endpoints | Part 11 §11.10(d) (access limited to authorized individuals) | `requireAuth` on AI routers (cortex, foresight); fail-closed |

## Known gaps (tracked, not hidden)

- **C11**: per-document-type accuracy is seed-stage; harnesses run, gold banks
  expanding, live numbers pending.
- **C9**: computed-groundedness enforcement defaults off (records always);
  enable org-wide with `AI_GROUNDEDNESS_ENFORCE=1` after rollout review.
- **C7**: 11 pre-existing direct-client sites are baselined for burndown; the
  guard prevents new ones.
- Formal IQ/OQ/PQ runs under `docs/validation/` are DRAFT templates pending
  execution + signature in the validated environment.
