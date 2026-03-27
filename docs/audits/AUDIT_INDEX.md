# Audit Index — Controlled Operating Register

> Status: ACTIVE
> Canonical: Yes
> Supersedes: —
> Superseded By: —
> Related Reports: BETA_READINESS_MASTER.md


**Date:** 2026-03-26  
**Purpose:** Master register for `docs/audits/` to control scope, reduce overlap, and define canonical decision inputs for beta readiness.

## Status Definitions
- **ACTIVE**: currently used as operating truth for planning/gates.
- **SUPPORTING**: useful evidence/context but not primary decision document.
- **STALE**: outdated, contradictory, or malformed for present decisioning.
- **SUPERSEDED**: replaced by a newer document covering the same ground more completely.

## Master Register

| File | Date | Category | Scope | Status | Owner/Source | One-line value | Supersedes | Superseded By |
|---|---|---|---|---|---|---|---|---|
| `AUDIT_INDEX.md` | 2026-03-26 | Governance index | Full audit register and classification control | **ACTIVE** | Codex consolidation pass | Canonical map of what to read, what to ignore, and why. | — | — |
| `BETA_READINESS_MASTER.md` | 2026-03-26 | Readiness synthesis | Beta command-center synthesis across canonical audits | **ACTIVE** | Codex consolidation pass | Single-source readiness recommendation and sprint order. | — | — |
| `510K_DOCUMENT_GENERATION_AUDIT.md` | 2026-03-26 | Export governance | 510(k)/eSTAR generation consequence paths | **ACTIVE** | Codex audit pass | Confirms 510(k) exports are still download-only and not governed artifacts. | — | — |
| `ANA_RI_BRAINSTEM_AUDIT_2026-03-24.md` | 2026-03-24 | AI kernel architecture | Planner/routing/memory/orchestration maturity | SUPPORTING | Audit author not named | Strong architecture baseline with explicit kernel maturity gaps. | — | — |
| `ANA_RI_KERNEL_BETA_LAUNCH_CHECKLIST.md` | 2026-03-25 | Launch checklist | Kernel runtime/safety/observability launch checks | **ACTIVE** | Checklist author not named | Fast gate checklist for kernel beta operations. | — | — |
| `BETA_INTEGRITY_BASELINE.md` | 2026-03-26 | Baseline audit | Shell/nav/compute truth snapshot (phase 0) | **SUPERSEDED** | Codex baseline pass | Useful baseline snapshot before later synthesis. | — | `BETA_READINESS_MASTER.md` |
| `BETA_INTEGRITY_REPORT.md` | 2026-03-26 | Sprint report | Beta-integrity implementation report | STALE | Mixed Codex/Copilot merge artifact | Contains unresolved merge markers; not safe as canonical truth. | — | — |
| `BIOTECH_SME_FULL_CLICK_THROUGH_AUDIT_2026-03-19.md` | 2026-03-19 | Broad SME audit | Platform-wide click-through readiness | STALE | SME multi-agent audit | Historical snapshot (38% readiness) but too broad/dated for current beta gate. | — | — |
| `CMC_AnA_Integration_Audit_2026-03-25.md` | 2026-03-25 | CMC integration | CMC backend/frontend and AnA wiring reality check | **ACTIVE** | Audit author not named | Defines current CMC+AnA integration blockers and split-path risk. | — | — |
| `CMC_TOP_LEVEL_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md` | 2026-03-25 | UX audit | First-touch CMC UX and path to outcomes | SUPPORTING | Build iteration audit | Captures human-first UI issues and top-level route behavior. | — | — |
| `CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md` | 2026-03-24 | Integration audit | API/service/tooling integration layer | SUPPORTING | Audit author not named | Evidence base for enterprise integration maturity assessment. | — | — |
| `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md` | 2026-03-24 | Execution plan | Delivery plan for integration/service/tooling gaps | **ACTIVE** | Post-audit execution plan | Converts integration findings into gated delivery plan. | — | — |
| `CONVERSATION_OS_DURABILITY_AUDIT.md` | 2026-03-26 | Durability audit | Conversation OS persistence baseline | **SUPERSEDED** | Durability audit pass | Baseline durable-state inventory prior to hardening phase 2. | — | `CONVERSATION_OS_DURABILITY_PHASE2.md` |
| `CONVERSATION_OS_DURABILITY_PHASE2.md` | 2026-03-26 | Durability hardening | Validation/fail-closed behavior/artifact consequence persistence | **ACTIVE** | Phase 2 hardening pass | Tracks what hardening landed and what risk remains for fallback modes. | `CONVERSATION_OS_DURABILITY_AUDIT.md` | — |
| `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md` | 2026-03-25 | Vault build plan | Beta-usable submission-aware vault plan | **ACTIVE** | Combined plan pass | Primary vault delivery roadmap for near-term beta. | `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md` | — |
| `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md` | 2026-03-25 | Vault competitive audit | Vault capability + competitor baseline | **SUPERSEDED** | Audit + competitive plan | Competitive analysis retained, but combined build plan is operating doc. | — | `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md` |
| `DOCUMENT_CONSEQUENCE_AUDIT.md` | 2026-03-26 | Consequence audit | Proposal acceptance + governed artifact visibility | **ACTIVE** | Launch-gate audit pass | Confirms governed consequence now visible on acceptance path with caveats. | — | — |
| `ENTERPRISE_ETHICS_MLOPS_DOMAIN_AUDIT_2026-03-24.md` | 2026-03-24 | Enterprise audit | Ethics/safety/MLOps/domain optimization maturity | SUPPORTING | Enterprise audit pass | Domain-level maturity rationale feeding execution planning. | — | — |
| `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md` | 2026-03-24 | Execution plan | 30/60/90-style ethics+MLOps delivery | **ACTIVE** | Post-audit execution plan | Operating plan for enterprise governance hardening. | — | — |
| `EXPORT_GOVERNANCE_ROUTE_INVENTORY_2026-03-24.md` | 2026-03-24 | Route inventory | Export endpoints + governance rollout tiers | SUPPORTING | Audit continuation | Concrete route-level backlog for governance middleware rollout. | — | — |
| `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md` | 2026-03-26 | Baseline audit | Beta-visible generated-document entry points | **SUPERSEDED** | Copilot launch-gate sprint | Baseline evidence replaced by consolidated final launch-gate report. | — | `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` |
| `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` | 2026-03-26 | Final launch-gate report | Consequence visibility final state + follow-on | **ACTIVE** | Launch-gate sprint final report | Primary consequence/readiness report across compute, conversation OS, and gaps. | `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md` | — |
| `PHASE_5_6_AUDIT_SUMMARY.md` | 2026-02-09 | Legacy summary | Phase 5/6 completion summary | STALE | Copilot | Contradicts detailed completion report and predates current beta governance focus. | — | — |
| `PHASE_5_6_COMPLETION_AUDIT.md` | 2026-02-09 | Legacy completion audit | Detailed Phase 5/6 status | SUPPORTING | Copilot Agent | Historical implementation context for legacy roadmap threads. | — | — |
| `PLATFORM_SCORECARD_AND_SIGN_OFF_MATRIX.md` | 2026-03-19 | Scorecard | Platform-wide scoring/sign-off framework | STALE | SME global project manager | Valuable framework, but too broad for current controlled beta decision set. | — | — |
| `VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md` | 2026-03-25 | UX audit | Vault top-level user experience and fixes | SUPPORTING | Build sprint audit | Detailed UX evidence informing vault beta priorities. | — | — |

## Canonical Active Docs (Operating Set)
1. `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`
2. `DOCUMENT_CONSEQUENCE_AUDIT.md`
3. `CONVERSATION_OS_DURABILITY_PHASE2.md`
4. `510K_DOCUMENT_GENERATION_AUDIT.md`
5. `CMC_AnA_Integration_Audit_2026-03-25.md`
6. `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md`
7. `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md`
8. `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md`
9. `ANA_RI_KERNEL_BETA_LAUNCH_CHECKLIST.md`

## Duplicate/Overlap Clusters (Primary Selection)
1. **Document consequence / launch-gate consequence**
   - Cluster: `DOCUMENT_CONSEQUENCE_AUDIT.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`
   - **Primary:** `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` (final integrated readout).
2. **Beta integrity baseline/report**
   - Cluster: `BETA_INTEGRITY_BASELINE.md`, `BETA_INTEGRITY_REPORT.md`
   - **Primary:** `BETA_INTEGRITY_BASELINE.md` as evidence only; `BETA_INTEGRITY_REPORT.md` is stale due to merge conflict markers.
3. **Conversation OS durability audit/phase2**
   - Cluster: `CONVERSATION_OS_DURABILITY_AUDIT.md`, `CONVERSATION_OS_DURABILITY_PHASE2.md`
   - **Primary:** `CONVERSATION_OS_DURABILITY_PHASE2.md`.
4. **AnA integration audit/execution plan**
   - Cluster: `CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md`, `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md`, `CMC_AnA_Integration_Audit_2026-03-25.md`
   - **Primary:** `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md` for program control; keep `CMC_AnA_Integration_Audit_2026-03-25.md` as active domain-specific gap truth.
5. **Vault-related audits**
   - Cluster: `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md`, `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md`, `VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md`
   - **Primary:** `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md`.
6. **Enterprise ethics MLOps audit/execution plan**
   - Cluster: `ENTERPRISE_ETHICS_MLOPS_DOMAIN_AUDIT_2026-03-24.md`, `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md`, `EXPORT_GOVERNANCE_ROUTE_INVENTORY_2026-03-24.md`
   - **Primary:** `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md`.
