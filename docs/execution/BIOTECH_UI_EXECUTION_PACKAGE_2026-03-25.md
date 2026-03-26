# Biotech UI Execution Package (No UI code changes)

_Date: March 25, 2026_

This package is designed to be downloaded and executed by Product, Design, RA, QA, and Engineering leads immediately.

## 1) Scope and Guardrails
- **In scope now:** execution planning artifacts, ownership, acceptance criteria, sequencing, and KPI instrumentation plan.
- **Out of scope now:** shipping new UI components or changing runtime behavior.

## 2) Rack-and-Stack (Now / Next / Later)

| Priority | Workstream | Outcome | Owner |
|---|---|---|---|
| P0 | Canonical stage-gated submission journey | One source of truth for stage progression and blockers | Product |
| P0 | Universal evidence traceability contract | Every claim/section can show source lineage path | Design + Product |
| P1 | Review orchestration model | Reviewer ownership, SLA, blocker reason taxonomy, approvals | Product + QA |
| P1 | Submission preflight confidence model | Explicit pass/fail checks before export approval | RA + Product |
| P2 | Program-level command surface spec | Portfolio readiness/risk visibility requirements | Product Ops |
| P2 | Confidence decomposition model | Section-level explainable confidence dimensions | AI Product |

## 3) Execution Board (Epic → Stories)

### Epic E1: Canonical Submission Journey (P0)

#### Story E1-S1: Stage Gate Contract
- **Objective:** Define the progression contract from project intake to submission export.
- **Acceptance Criteria:**
  - Entry/exit criteria for each stage are explicit.
  - Stage owner and SLA are defined per stage.
  - Blocked state requires reason code.
- **Dependencies:** none.
- **Deliverable:** `product-spec-stage-gates-v1`.

#### Story E1-S2: Shared Status Dictionary
- **Objective:** Harmonize status terms across Dossier, Documents, Review, Submissions.
- **Acceptance Criteria:**
  - Terms are unambiguous and consistent.
  - Mapping table from existing labels to canonical labels is published.
- **Dependencies:** E1-S1.
- **Deliverable:** `status-dictionary-v1`.

### Epic E2: Universal Traceability (P0)

#### Story E2-S1: Global Evidence Access Pattern
- **Objective:** Define single interaction pattern for source lineage access from any artifact.
- **Acceptance Criteria:**
  - Pattern works for claims, tables, and section text.
  - Includes source, timestamp, contributor, and version metadata requirements.
- **Dependencies:** E1-S2.
- **Deliverable:** `evidence-access-pattern-v1`.

#### Story E2-S2: Parity Checklist vs Weave/Artos
- **Objective:** Validate parity for traceability and governance UX expectations.
- **Acceptance Criteria:**
  - Checklist includes source-link depth, version visibility, change rationale, audit identity.
  - Approved by RA lead and QA lead.
- **Dependencies:** E2-S1.
- **Deliverable:** `parity-checklist-traceability-v1`.

### Epic E3: Review Orchestration & Governance (P1)

#### Story E3-S1: Reviewer Assignment & SLA Model
- **Objective:** Standardize reviewer assignment, deadlines, and approval states.
- **Acceptance Criteria:**
  - Every review item has owner + deadline + state.
  - Approval stamp includes approver + timestamp.
- **Dependencies:** E1-S2.
- **Deliverable:** `review-orchestration-model-v1`.

#### Story E3-S2: Change Confidence Requirements
- **Objective:** Define “what changed / why / impact” review requirements.
- **Acceptance Criteria:**
  - Semantic change summary required.
  - Impact linkage to affected section and evidence source required.
- **Dependencies:** E3-S1, E2-S1.
- **Deliverable:** `change-confidence-requirements-v1`.

### Epic E4: Submission Confidence Center (P1)

#### Story E4-S1: Preflight Check Matrix
- **Objective:** Define mandatory pass/fail checks before export approval.
- **Acceptance Criteria:**
  - Check groups: completeness, compliance, signatures, evidence coverage.
  - Failed checks must provide remediation pathway requirements.
- **Dependencies:** E1-S1.
- **Deliverable:** `preflight-check-matrix-v1`.

#### Story E4-S2: Final Sign-off Packet Definition
- **Objective:** Standardize contents of final readiness sign-off package.
- **Acceptance Criteria:**
  - Includes readiness summary, unresolved risks, evidence coverage, audit snapshot.
  - Includes required roles for sign-off.
- **Dependencies:** E4-S1.
- **Deliverable:** `submission-signoff-packet-v1`.

### Epic E5: Portfolio Command Surface (P2)

#### Story E5-S1: Program Readiness Requirements
- **Objective:** Define portfolio-level view requirements for leadership.
- **Acceptance Criteria:**
  - Captures readiness, blockers, due dates, and risk flags across projects.
  - Includes filtering requirements by submission type.
- **Dependencies:** E1-S1.
- **Deliverable:** `portfolio-readiness-requirements-v1`.

### Epic E6: Differentiation (P2)

#### Story E6-S1: Confidence Decomposition Contract
- **Objective:** Define explainable section-level confidence dimensions.
- **Acceptance Criteria:**
  - Dimensions: evidence strength, contradiction risk, compliance confidence, reviewer confidence.
  - Each dimension has explicit rationale field requirements.
- **Dependencies:** E2-S1, E3-S2.
- **Deliverable:** `confidence-decomposition-contract-v1`.

## 4) 30/60/90 Operating Cadence

### Day 0–30
- Complete E1 and E2 requirements artifacts and approvals.
- Baseline KPIs and instrumentation ownership.

### Day 31–60
- Complete E3 and E4 requirements artifacts.
- Run parity review checkpoints against competitor expectations.

### Day 61–90
- Complete E5 and E6 requirements artifacts.
- Prepare pilot metrics for differentiation claims.

## 5) KPI Framework (minimum set)

| KPI | Definition | Target Direction |
|---|---|---|
| Stage progression time | Median time from stage 1 to stage 4 | Down |
| Evidence lookup time | Median time to access supporting lineage | Down |
| Review cycle time | Median time to approve section/package | Down |
| Preflight first-pass success | % packages passing checks first attempt | Up |
| Post-signoff reopen rate | % approved items reopened | Down |

## 6) This Week: Assignment Matrix
- PM Lead: E1-S1, E1-S2
- Design Lead: E2-S1
- RA Lead: E4-S1
- QA Lead: E3-S1
- Analytics Lead: KPI baseline + dashboard specification

## 7) Downloadable Companion Files
- `docs/execution/BIOTECH_UI_RACK_AND_STACK_2026-03-25.csv`
- `docs/execution/BIOTECH_UI_EXECUTION_CHECKLIST_2026-03-25.md`
