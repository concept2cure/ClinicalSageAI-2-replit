# Audit Index (Controlled Operating Register)

Date: 2026-03-26  
Purpose: master register for all current artifacts in `docs/audits/` with operating status and ownership signals for beta readiness control.

## Status definitions
- **ACTIVE**: currently used to drive beta build decisions.
- **SUPPORTING**: useful reference, but not the primary decision document.
- **STALE**: outdated, contradictory, or too old for current beta control.
- **SUPERSEDED**: explicitly replaced by a newer report that covers the same ground better.

## Master register

| Filename | Date | Category | Scope | Status | Owner/Source | One-line value | Supersedes | Superseded by |
|---|---|---|---|---|---|---|---|---|
| `510K_DOCUMENT_GENERATION_AUDIT.md` | 2026-03-26 | 510(k) governance | 510(k)/eSTAR export consequence path | ACTIVE | Codex audit | Confirms 510(k) exports are still dead-end and ungoverned. | — | — |
| `ANA_RI_BRAINSTEM_AUDIT_2026-03-24.md` | 2026-03-24 | AnA architecture | Kernel/orchestration maturity assessment | SUPPORTING | Audit agent | Deep architecture gap map for planner/scheduler/memory maturity. | — | — |
| `ANA_RI_KERNEL_BETA_LAUNCH_CHECKLIST.md` | 2026-03-25 | AnA launch gate | Kernel runtime launch checklist and missing gates | ACTIVE | Beta checklist | Fast launch gate truth for kernel readiness. | Brainstem audit (launch subset) | — |
| `BETA_INTEGRITY_BASELINE.md` | 2026-03-26 | Beta baseline | Pre-hardening shell/nav/compute truth snapshot | SUPERSEDED | Beta integrity sprint | Useful historical baseline only. | — | `BETA_INTEGRITY_REPORT.md` |
| `BETA_INTEGRITY_REPORT.md` | 2026-03-26 | Beta integrity | Consolidated shell/nav/workspace hardening report | ACTIVE | Beta integrity sprint | Current platform integrity readout for shell and workspace behavior. | `BETA_INTEGRITY_BASELINE.md` | — |
| `BIOTECH_SME_FULL_CLICK_THROUGH_AUDIT_2026-03-19.md` | 2026-03-19 | Platform-wide SME | Broad module-by-module click-through audit | STALE | SME agents | Historical breadth, but too old for current beta gate decisions. | — | — |
| `CMC_AnA_Integration_Audit_2026-03-25.md` | 2026-03-25 | CMC integration | CMC backend/frontend + AnA wiring reality check | ACTIVE | Codebase reality audit | Canonical CMC+AnA integration risk map for beta. | — | — |
| `CMC_TOP_LEVEL_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md` | 2026-03-25 | CMC UX | First-view CMC route/UX audit | SUPPORTING | Build iteration audit | Captures human-first orientation and route coherence gains. | — | — |
| `CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md` | 2026-03-24 | Integrations audit | Integration/service/tooling state audit | SUPERSEDED | Integration audit | Domain findings are preserved in execution plan. | — | `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md` |
| `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md` | 2026-03-24 | Integrations execution | Phased integration hardening plan | ACTIVE | Post-audit execution plan | Canonical roadmap for governed integration operating model. | `CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md` | — |
| `CONVERSATION_OS_DURABILITY_AUDIT.md` | 2026-03-26 | Conversation OS | Durability implementation pass 1 | SUPERSEDED | Durability sprint | Captures phase 1 before fail-closed hardening. | — | `CONVERSATION_OS_DURABILITY_PHASE2.md` |
| `CONVERSATION_OS_DURABILITY_PHASE2.md` | 2026-03-26 | Conversation OS | Durability hardening pass 2 | ACTIVE | Durability sprint | Canonical durability state for strict context validation + governed accept states. | `CONVERSATION_OS_DURABILITY_AUDIT.md` | — |
| `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md` | 2026-03-25 | Vault beta plan | Combined Vault competitive + execution plan | ACTIVE | Vault build plan | Canonical vault beta plan with practical plugin and execution stack. | `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md` | — |
| `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md` | 2026-03-25 | Vault competitive audit | Vault baseline vs Veeva/SharePoint + phase plan | SUPERSEDED | Vault audit | Input report preserved by combined beta build plan. | — | `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md` |
| `DOCUMENT_CONSEQUENCE_AUDIT.md` | 2026-03-26 | Document consequence | Proposal acceptance consequence audit | SUPERSEDED | Consequence audit | Early tranche now replaced by launch-gate baseline/report pair. | — | `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` |
| `ENTERPRISE_ETHICS_MLOPS_DOMAIN_AUDIT_2026-03-24.md` | 2026-03-24 | Ethics/MLOps audit | Enterprise governance and domain optimization assessment | SUPERSEDED | Enterprise audit | Strategic findings converted into execution program. | — | `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md` |
| `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md` | 2026-03-24 | Ethics/MLOps execution | 30/60/90 execution workstreams and gates | ACTIVE | Execution-ready plan | Canonical ethics + MLOps delivery board for controlled rollout. | `ENTERPRISE_ETHICS_MLOPS_DOMAIN_AUDIT_2026-03-24.md` | — |
| `EXPORT_GOVERNANCE_ROUTE_INVENTORY_2026-03-24.md` | 2026-03-24 | Export governance | Export route inventory and rollout tiers | SUPPORTING | Audit continuation | Route-level grounding for governance coverage claims. | — | — |
| `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md` | 2026-03-26 | Launch gate baseline | Baseline consequences across beta-visible entry points | SUPERSEDED | Launch-gate sprint | Critical historical baseline for consequence visibility before sprint changes. | `DOCUMENT_CONSEQUENCE_AUDIT.md` | `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` |
| `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` | 2026-03-26 | Launch gate report | Final consequence visibility sprint output | ACTIVE | Launch-gate sprint | Canonical truth for current document consequence implementation. | `DOCUMENT_CONSEQUENCE_AUDIT.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md` | — |
| `PHASE_5_6_AUDIT_SUMMARY.md` | 2026-02-09 | Legacy phase audit | Phase 5/6 completion summary | STALE | Copilot | Contradicts other phase audit and predates current beta control set. | — | — |
| `PHASE_5_6_COMPLETION_AUDIT.md` | 2026-02-09 | Legacy phase audit | Phase 5/6 completion report | STALE | Copilot | Historical reference only; not a current beta launch gate. | — | — |
| `PLATFORM_SCORECARD_AND_SIGN_OFF_MATRIX.md` | 2026-03-19 | Platform scorecard | Cross-module score/sign-off matrix | STALE | SME global PM | Useful context but too broad and old for current beta command decisions. | — | — |
| `VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md` | 2026-03-25 | Vault UX | Top-level vault human workflow audit | SUPPORTING | Build sprint audit | Practical UX deltas and remaining gaps for vault trust. | — | — |

## Canonical active docs (operating set)
1. `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`
2. `BETA_INTEGRITY_REPORT.md`
3. `CONVERSATION_OS_DURABILITY_PHASE2.md`
4. `ANA_RI_KERNEL_BETA_LAUNCH_CHECKLIST.md`
5. `CMC_AnA_Integration_Audit_2026-03-25.md`
6. `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md`
7. `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md`
8. `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md`
9. `510K_DOCUMENT_GENERATION_AUDIT.md`

## Duplicate/overlap clusters and primary selections

1. **Document consequence / launch-gate consequence**
   - Cluster: `DOCUMENT_CONSEQUENCE_AUDIT.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_BASELINE.md`, `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md`
   - **Primary:** `LAUNCH_GATE_DOCUMENT_CONSEQUENCE_REPORT.md` (latest synthesis + implemented changes).

2. **Beta integrity baseline/report**
   - Cluster: `BETA_INTEGRITY_BASELINE.md`, `BETA_INTEGRITY_REPORT.md`
   - **Primary:** `BETA_INTEGRITY_REPORT.md` (baseline + hardening outcome).

3. **Conversation OS durability audit/phase2**
   - Cluster: `CONVERSATION_OS_DURABILITY_AUDIT.md`, `CONVERSATION_OS_DURABILITY_PHASE2.md`
   - **Primary:** `CONVERSATION_OS_DURABILITY_PHASE2.md` (adds fail-closed controls and explicit states).

4. **AnA integration audit/execution plan**
   - Cluster: `CONCEPT2CURE_ANA_INTEGRATION_AUDIT_2026-03-24.md`, `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md`, `CMC_AnA_Integration_Audit_2026-03-25.md`
   - **Primary:** `CONCEPT2CURE_ANA_INTEGRATION_EXECUTION_PLAN_2026-03-24.md` for cross-platform execution; `CMC_AnA_Integration_Audit_2026-03-25.md` remains domain-primary for CMC-specific integration.

5. **Vault-related audits**
   - Cluster: `DMS_VAULT_COMPETITIVE_BETA_PLAN_2026-03-25.md`, `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md`, `VAULT_UI_HUMAN_EXPERIENCE_AUDIT_2026-03-25.md`
   - **Primary:** `DMS_VAULT_BETA_BUILD_PLAN_2026-03-25.md` (combined competitive+build plan).

6. **Enterprise ethics MLOps audit/execution plan**
   - Cluster: `ENTERPRISE_ETHICS_MLOPS_DOMAIN_AUDIT_2026-03-24.md`, `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md`, `EXPORT_GOVERNANCE_ROUTE_INVENTORY_2026-03-24.md`
   - **Primary:** `ENTERPRISE_ETHICS_MLOPS_EXECUTION_PLAN_2026-03-24.md` (delivery control); route inventory stays supporting evidence.
