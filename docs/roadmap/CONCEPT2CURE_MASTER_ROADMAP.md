# Concept2Cure Master Roadmap — The Path to the Dream
> **Version:** 2.0 | **Created:** 2026-01-28 | **Updated:** 2026-01-29 | **Status:** AUTHORITATIVE  
> **Scope:** Complete build guide integrating Synergistic v3 + DVLP Pillars + Reality Check  
> **Audience:** Investors, Engineering, Product

---

## 🧭 UI NORTH STAR — CONCEPT2CURE PROJECT WORKSPACE

> Concept2Cure is architected as a **Project-centric workspace**.
> Every user action occurs inside a Project, scoped to a Module, and expressed through Chats, Artifacts, Workflows, and PM Docs — all visible within a unified three-pane UI shell.

### Canonical UI Layout

| Pane | Content | Purpose |
|------|---------|---------|
| **Left Sidebar** | Project + Module Tree | Navigate projects, modules, conversations |
| **Center Pane** | Chat / Workflow / Editor | Primary work surface for conversations, workflows, document editing |
| **Right Pane** | Artifacts / Audit / Tasks | Supporting context, outputs, compliance trail |

### Core UI Primitives

| Primitive | Definition | Example |
|-----------|------------|---------|
| **Project** | Top-level container for a regulatory submission or program | "Acme 510(k) Q2 2026" |
| **Module** | Functional workspace within a project | Client Portal V2, eCTD Co-Author, CER Generator |
| **Chat** | Conversational AI interaction | "Draft device description for 510(k)" |
| **Artifact** | Persistent output (document, report, export) | Clinical Summary v2.1.docx |
| **Workflow** | Multi-step process with gates and approvals | IND Submission Pipeline |
| **PM Doc** | Project management documentation | Roadmap, Risks, ADRs, Validation Plan |

> **Rule:** All features must be accessible through the Project Workspace shell. No orphaned screens.

---

## 🎯 The Dream

**Build the Intelligent Regulatory Operating System** — a platform where:
- Every regulatory submission is a **living, traceable asset**
- Every decision has **provable provenance**
- Every workflow step is a **contract that executes automatically**
- Every stakeholder sees **real-time truth** about portfolio health

### Value Proposition (Investor Summary)
| Problem | Solution | Outcome |
|---------|----------|---------|
| Regulatory submissions take 12-24 months | AI-powered drafting + workflow automation | 50% time reduction |
| $2-5M per submission in consulting fees | Self-service with expert guardrails | 70% cost reduction |
| No traceability = compliance risk | Hash-chained audit + trust rails | 21 CFR Part 11 ready |
| Siloed data across vendors | Unified intelligence platform | Single source of truth |

---

## 🏛️ Three Pillars (Non-Negotiable Foundation)

### Pillar 1: Trust Rails 🔐
**Hash-chained audit + release hashes = provable history without blockchain**

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| `audit_log.prev_hash` | Chain each entry to previous | SHA-256 of prior row |
| `audit_log.entry_hash` | Self-verify integrity | SHA-256 of current row data |
| `artifact_version.content_hash` | Fingerprint every version | Canonical serialization hash |
| `export_jobs.release_hash` | "What exactly was submitted" | Hash of final package |
| `electronic_signatures.version_hash` | What was signed | Immutable binding |

**Acceptance:** Any tampering is detectable. Any export can be verified against its release hash.

### Pillar 2: Workflow-as-Contract 📜
**Milestones that trigger actions = orchestration that's "real"**

| Component | Purpose | Implementation |
|-----------|---------|----------------|
| `workflow_step.preconditions` | What must be true to proceed | JSON rules (data present, approvals, signatures) |
| `workflow_step.effects` | What happens on completion | Create task, trigger worker, notify, lock version |
| `workflow_step.sla` | When it's late | Duration + escalation rules |
| `step_run.auto_advance` | No manual babysitting | Engine checks preconditions continuously |

**Acceptance:** When preconditions are met, the engine advances automatically. Humans only intervene at approval gates.

### Pillar 3: Submission-as-Asset 💎
**Every submission is an asset with state, ownership, and history**

| State | Meaning | Transitions |
|-------|---------|-------------|
| `DRAFT` | Work in progress | → REVIEW |
| `REVIEW` | Under stakeholder review | → APPROVED, → DRAFT |
| `APPROVED` | Ready for submission | → SUBMITTED |
| `SUBMITTED` | Filed with authority | → ACCEPTED, → DEFICIENCY |
| `DEFICIENCY` | Questions received | → RESPONSE_PENDING |
| `RESPONSE_PENDING` | Preparing response | → SUBMITTED |
| `ACCEPTED` | Cleared by authority | → MARKETED (device), → PHASE_X (drug) |
| `WITHDRAWN` | Voluntarily pulled | Terminal |
| `REJECTED` | Refused by authority | Terminal |

**Acceptance:** Mission Control dashboard shows every asset's state. Portfolio value and risk are calculable.

---

## 📊 Current Implementation Status (Reality Check)

### ✅ VERIFIED COMPLETE (Phases 0-3)

| Phase | Component | Evidence | Lines |
|-------|-----------|----------|-------|
| Phase 0 | Environment | docker-compose.yml, .env validation, health endpoints | - |
| Phase 1 | Database Schema | 50+ tables in shared/schema.ts | 12,939 |
| Phase 1 | RLS + Audit | database/policies/, audit_log with hashing | ~200 |
| Phase 2 | Submission Pyramids | 7 pyramids in services/regulatory/pyramids/ | ~900 |
| Phase 2 | Pyramid Engine | SubmissionPyramidEngine.ts | 135 |
| Phase 2 | Claude-style UI | client/src/concept2cure/ complete | ~2,000 |
| Phase 3 | Risk Factors | 50+ factors in services/ai/risk-factors/ | ~400 |
| Phase 3 | Detectors | 5 detectors in services/ai/detectors/ | ~500 |
| Phase 3 | Prediction Engine | PredictiveIntelligenceEngine.ts | 566 |
| Phase 3 | Proactive Monitoring | ProactiveMonitoringService.ts | 623 |
| Phase 3.5 | Multi-Agent Council | MultiAgentCouncilService.ts | 1,175 |

### ⚠️ PARTIALLY IMPLEMENTED

| Component | What Exists | What's Missing |
|-----------|-------------|----------------|
| Workflow Engine | Basic WorkflowService | Full YAML definitions, auto-advance, preconditions |
| Document System | Document schema, versioning | Traceability UI, change propagation |
| HAQ/Comms | channelMessages schema, FDA tables | HAQ intake workflow, response tracking |
| Export Pipeline | Basic Word/PDF exports | eCTD packaging, release hashing |
| Workers | CER worker, co-author worker | Full queue system, ingestion pipelines |

### ❌ NOT IMPLEMENTED

| Component | Phase | Blocked By |
|-----------|-------|------------|
| Workflow Orchestration Engine | 4 | Schema design decisions |
| Intelligent Document System | 5 | Phase 4 completion |
| Mission Control Dashboard | 7 | Phases 4-6 completion |
| Full Data Ingestion | 9 | CTMS/EDC vendor APIs |
| IQ/OQ/PQ Validation | 10 | All prior phases |

---

## 🗺️ Execution Plan (12-Week Path to Dream)

### Build Order (UX-First Principle)

> **Rule:** No module is considered "usable" until it is accessible through the Project Workspace shell.

**Enforced Build Sequence:**

1. **Project Workspace Shell** — Layout + navigation (AppShell, Sidebar, Context Panel)
2. **Chat + Artifact Surfaces** — Core interaction primitives
3. **Workflow Runner** — Step execution engine with UI
4. **PM Hub** — Project management documentation screens
5. **Compliance Overlays** — eSign, audit trail, SoD enforcement
6. **Module-Specific Intelligence** — eCTD, CER, Regulatory Intel features

### Phase Dependency Graph

```
                    ┌─────────────────────────────────────────────┐
                    │  PROJECT WORKSPACE SHELL (Parallel w/ Ph4)  │
                    └─────────────────────────────────────────────┘
                                         │
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──┬──► Phase 3.5 (Quick Wins)
                                               │
                                               ▼
                                           Phase 4 (Workflow Engine)
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                          Phase 5          Phase 6          Phase 8
                       (Intelligent      (eCTD Export)    (HAQ Manager)
                          Docs)              │                │
                              │              │                │
                              └──────────────┼────────────────┘
                                             ▼
                                         Phase 7 (Mission Control)
                                             │
                                             ▼
                                         Phase 9 (Ingestion)
                                             │
                                             ▼
                                         Phase 10 (Validation)
                                             │
                                             ▼
                                         Phase 11 (Marketplace) [FUTURE]
```

---

### Phase 0: Environment Hardening ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Day 1 | **Blockers:** None

| Task | File/Location | Status |
|------|---------------|--------|
| .env.example + validation | .env.example | ✅ |
| docker-compose.dev.yml | docker-compose.yml | ✅ |
| npm scripts (migrate, seed, test, lint) | package.json | ✅ |
| Neon/Supabase + pgvector | drizzle.config.ts | ✅ |
| Request IDs + structured logging | server/middleware/ | ✅ |
| Health endpoint | server/routes/health.ts | ✅ |

---

### Phase 1: Database Foundation + RLS + Audit ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Week 1 | **Blockers:** None  
**Pillar Focus:** Trust Rails 🔐

| Task | File/Location | Status |
|------|---------------|--------|
| Organizational topology (tenants, orgs, engagements) | shared/schema.ts | ✅ |
| Projects + WBS (work breakdown structure) | shared/schema.ts | ✅ |
| PM settings | shared/schema.ts | ✅ |
| Risk + predictions schema | shared/schema.ts | ✅ |
| Communication (channels, messages) | shared/schema.ts | ✅ |
| Audit + electronic signatures | shared/schema.ts | ✅ |
| Documents + versions | shared/schema.ts | ✅ |
| Row-level security policies | database/policies/ | ✅ |
| Knowledge base | shared/schema.ts | ✅ |
| Hash-chained audit (prev_hash, entry_hash) | audit_log table | ✅ |

---

### Phase 2: Submission Pyramids + Projects UX ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Week 2 | **Blockers:** None  
**Pillar Focus:** Submission-as-Asset 💎

| Task | File/Location | Status |
|------|---------------|--------|
| 510(k) pyramid (7 phases, ~40 tasks) | services/regulatory/pyramids/510k-pyramid.ts | ✅ |
| IND pyramid (8 phases, ~50 tasks) | services/regulatory/pyramids/ind-pyramid.ts | ✅ |
| NDA pyramid | services/regulatory/pyramids/nda-pyramid.ts | ✅ |
| BLA pyramid | services/regulatory/pyramids/bla-pyramid.ts | ✅ |
| PMA pyramid (10 phases, ~80 tasks) | services/regulatory/pyramids/pma-pyramid.ts | ✅ |
| MAA pyramid (EU) | services/regulatory/pyramids/maa-pyramid.ts | ✅ |
| De Novo pyramid | services/regulatory/pyramids/de-novo-pyramid.ts | ✅ |
| Submission Pyramid Engine | services/regulatory/SubmissionPyramidEngine.ts | ✅ |
| Claude-style Projects UI | client/src/concept2cure/ | ✅ |

---

### Phase 3: Predictive Intelligence Engine ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Weeks 3-4 | **Blockers:** None

| Task | File/Location | Status |
|------|---------------|--------|
| 510(k) risk factors (15) | services/ai/risk-factors/510k-risks.ts | ✅ |
| IND risk factors (18) | services/ai/risk-factors/ind-risks.ts | ✅ |
| Project health risks (17) | services/ai/risk-factors/project-health-risks.ts | ✅ |
| 5 automated detectors | services/ai/detectors/ | ✅ |
| Prediction Engine | services/ai/PredictiveIntelligenceEngine.ts | ✅ |
| Proactive Monitoring | services/ai/ProactiveMonitoringService.ts | ✅ |
| Outcome Scenario Generator | services/ai/OutcomeScenarioGenerator.ts | ✅ |
| Multi-Agent Council | services/ai/agents/MultiAgentCouncilService.ts | ✅ |

---

### Phase 4: Workflow Orchestration Engine ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Weeks 5-6 | **Blockers:** None  
**Pillar Focus:** Workflow-as-Contract 📜 + Proof System 🧬

| Task | File/Location | Status |
|------|---------------|--------|
| Workflow definitions schema | database/schema/workflow-definitions.ts | ✅ |
| Workflow runs schema | database/schema/workflow-runs.ts | ✅ |
| Workflow steps schema | database/schema/workflow-steps.ts | ✅ |
| Step runs schema | database/schema/step-runs.ts | ✅ |
| Execution engine core | services/workflow/WorkflowExecutionEngine.ts | ✅ |
| Precondition checker | services/workflow/PreconditionChecker.ts | ✅ |
| Auto-advance service | services/workflow/AutoAdvanceService.ts | ✅ |
| IND workflow template | templates/workflows/ind-workflow.yaml | ✅ |
| Workflow timeline UI | client/src/concept2cure/components/workflow/ | ✅ |

**Phase 4.1 Enhancement — The Proof System (Provable Regulatory Science):** ✅ COMPLETE

| Task | File/Location | Status |
|------|---------------|--------|
| Formal Compliance Graph compiler | services/proof/FormalComplianceGraph.ts | ✅ |
| Zero-Knowledge compliance layer | services/proof/zk/ZeroKnowledgeCompliance.ts | ✅ |
| Delta Verification Engine | services/proof/DeltaVerificationEngine.ts | ✅ |
| Compliance Certificate Generator | services/proof/ComplianceCertificate.ts | ✅ |
| Proof Audit Service | services/proof/ProofAuditService.ts | ✅ |
| Proof Verification Service | services/proof/ProofVerificationService.ts | ✅ |
| Proof Explorer UI | client/src/concept2cure/components/proof/ProofExplorer.tsx | ✅ |
| Proof API Routes | server/routes/workflow.ts | ✅ |

**Phase 4.1 Enterprise Acceptance Criteria (Completion Gate):**
> **Gate:** ✅ All criteria passed. Phase 4.2 unblocked.

| Component | Acceptance Criteria (Enterprise, Audited) | Status |
|----------|-------------------------------------------|--------|
| Formal Compliance Graph | Deterministic DAG compilation; invariant checks; cycle detection; stable hashes; negative tests for malformed definitions; audit log entries for compile/run events. | ✅ |
| ZK Authorization Proofs | Role-scoped public signals; signature/approval binding; privacy preserved; verification fails for expired/revoked credentials; deterministic proof verification. | ✅ |
| Delta Verification Engine | Baseline snapshot hashing; drift detection on workflow + data state; explicit diff report; regression suite false-positive rate <1%; tamper events logged. | ✅ |
| Compliance Certificate Generator | Immutable certificate schema; cryptographic binding to workflow run; reproducible proof bundle; round-trip verification succeeds; export-safe serialization. | ✅ |
| Proof Explorer UI | Certificate + verification status displayed; failure reasons surfaced; empty/error/loading handled; access control; audit-safe UI events. | ✅ |

**Phase 4.1 Milestones (each must pass):**
- **M1 Graph Integrity:** ✅ DAG compiles from workflow definition; invariants + hashes validated; audit trail emitted.
- **M2 Authorization Proofs:** ✅ ZK proofs generated per approval/signature gate; negative tests for invalid credentials.
- **M3 Drift Detection:** ✅ Unauthorized edits flagged; diff + remediation hints; audit trail includes diff summary.
- **M4 Certificate:** ✅ Certificate generated on completion; verification endpoint validates within SLA.
- **M5 UI + Ops:** ✅ Proof Explorer + dashboard entry points expose verification status; redacted logs; performance budgets met.

**IND Workflow Template (10 Steps):**
1. Program Intake
2. Source Ingestion
3. Authoring Plan
4. CMC Drafting
5. Preclinical Drafting
6. Clinical Protocol Drafting
7. Internal Review
8. QA Review
9. Signature Collection
10. Export & Release

---

### EPIC: Project Workspace Shell (Foundational UI)

**Status:** ⏳ PRIORITY | **Duration:** Week 5 (parallel with Phase 4) | **Blockers:** None  
**Pillar Focus:** User Experience Foundation

> **Rule:** No module is considered "usable" until it is accessible through the Project Workspace shell.

| Component | File/Location | Status | Description |
|-----------|---------------|--------|-------------|
| AppShell | client/src/concept2cure/layouts/AppShell.tsx | ✅ | Persistent three-pane layout |
| ProjectSidebar | client/src/concept2cure/components/sidebar/ProjectSidebar.tsx | ✅ | Tree navigation (Projects → Modules → Chats) |
| ContextPanel | client/src/concept2cure/components/panels/ContextPanel.tsx | ⏳ | Right-hand artifacts/audit/tasks panel |
| Global Create (+) | client/src/concept2cure/components/actions/GlobalCreate.tsx | ⏳ | Universal entry point for new items |
| Project Switcher | client/src/concept2cure/components/navigation/ProjectSwitcher.tsx | ⏳ | Quick-switch between projects |
| Module Router | client/src/concept2cure/routing/ModuleRouter.tsx | ⏳ | Route to module workspaces |

**UI CONTEXT**
- Project scope: Platform-level
- Primary surface: AppShell (layout container)
- Supporting panels: All panels are children of this shell

**Acceptance Criteria:**
- [ ] Three-pane layout renders on all screen sizes
- [ ] Project tree expands to show modules and conversations
- [ ] Context panel switches between Artifacts, Audit, and Tasks
- [ ] Global Create (+) triggers modal with context-aware options
- [ ] Project Switcher supports search and recent projects

---

### Phase 5: Intelligent Document System ⏳ PENDING

**Status:** ⏳ NOT STARTED | **Duration:** Week 7 | **Blockers:** Phase 4  
**Pillar Focus:** Trust Rails 🔐

**UI CONTEXT**
- Project scope: Module-level
- Primary surface: Artifact Editor
- Supporting panels: Artifacts (versions), Audit (change trail), Tasks (pending reviews)

| Task | File/Location | Status |
|------|---------------|--------|
| Unified doc editor (Tiptap) | client/src/concept2cure/components/editor/ | ⏳ |
| Traceability linking UI | client/src/concept2cure/components/traceability/ | ⏳ |
| Change propagation engine | services/documents/ChangePropagationService.ts | ⏳ |
| Compliance rules engine | services/compliance/ComplianceRulesEngine.ts | ⏳ |

---

### Phase 6: eCTD Co-Author + Document Drafting ⏳ PENDING

**Status:** ⏳ NOT STARTED | **Duration:** Week 8  
**Pillar Focus:** Trust Rails 🔐, Submission-as-Asset 💎

**UI CONTEXT**
- Project scope: Module-level
- Primary surface: Chat (Co-Author conversations) + Artifact Editor
- Supporting panels: Artifacts (generated documents), Audit (AI decisions)

| Task | File/Location | Status |
|------|---------------|--------|
| Multi-Agent Council | services/ai/agents/MultiAgentCouncilService.ts | ✅ COMPLETE |
| Artifact skeleton generator | services/documents/ArtifactSkeletonGenerator.ts | ⏳ |
| eCTD module scaffolding | services/ectd/ECTDScaffoldingService.ts | ⏳ |
| Release hash generator | services/export/ReleaseHashGenerator.ts | ⏳ |

---

### Phase 7: Mission Control Dashboard + Lumen PM ⏳ PENDING

**Status:** ⏳ NOT STARTED | **Duration:** Week 9 | **Blockers:** Phases 4-6  
**Pillar Focus:** Submission-as-Asset 💎

**UI CONTEXT**
- Project scope: Project-level (portfolio view)
- Primary surface: Dashboard (Mission Control)
- Supporting panels: Artifacts (reports), Tasks (action items)

| Task | File/Location | Status |
|------|---------------|--------|
| Portfolio view | client/src/concept2cure/pages/MissionControl/ | ⏳ |
| Risk dashboard | client/src/concept2cure/components/dashboard/ | ⏳ |
| Resource allocator | client/src/concept2cure/components/dashboard/ | ⏳ |

---

### Phase 8: Communication Hub + HAQ Manager ✅ COMPLETE

**Status:** ✅ COMPLETE | **Duration:** Week 10 | **Blockers:** None  
**Pillar Focus:** Trust Rails 🔐, Workflow-as-Contract 📜

**UI CONTEXT**
- Project scope: Module-level
- Primary surface: Workflow (HAQ response pipeline)
- Supporting panels: Artifacts (FDA letters, responses), Audit (communication log)

| Task | File/Location | Status |
|------|---------------|--------|
| HAQ intake | services/haq/HAQIntakeService.ts | ✅ |
| Response workflow | services/haq/HAQResponseWorkflow.ts | ✅ |
| FDA communication log | services/fda/FDACommunicationService.ts | ✅ |

---

### Phase 9: Data Ingestion Workers + Connectors ⏳ PENDING

**Status:** ⏳ NOT STARTED | **Duration:** Weeks 11-12 | **Blockers:** Vendor APIs

**UI CONTEXT**
- Project scope: Project-level (data sources)
- Primary surface: Workflow (ingestion pipelines)
- Supporting panels: Artifacts (parsed data), Audit (ingestion logs)

| Task | File/Location | Status |
|------|---------------|--------|
| Worker queue (BullMQ) | worker/queue/WorkerQueue.ts | ⏳ |
| PDF parsing worker | worker/parsers/PDFParserWorker.ts | ⏳ |
| CTMS/EDC connectors | worker/connectors/ | ⏳ |

---

### Phase 10: Testing, Validation, Security, Deployment ⏳ PENDING

**Status:** ⏳ NOT STARTED | **Duration:** Weeks 13-14 | **Blockers:** All prior phases

**UI CONTEXT**
- Project scope: Platform-level
- Primary surface: PM Hub (Validation Plan)
- Supporting panels: Artifacts (IQ/OQ/PQ packets), Audit (test evidence)

| Task | Category | Status |
|------|----------|--------|
| Unit/integration/E2E tests | Testing | ⏳ |
| IQ/OQ/PQ validation packets | Validation | ⏳ |
| Security hardening | Security | ⏳ |
| Staging + production deployment | Deployment | ⏳ |

---

### Phase 11: Marketplace + Funding Rails 🔮 FUTURE

**Status:** 🔮 FUTURE (post-v1.0) | **Duration:** TBD

---

### Phase 4 Kernel — Next Execution Lane 🔄 IN PROGRESS

**Status:** 🔄 IN PROGRESS | **Duration:** Weeks 7-10 | **Blockers:** None  
**Pillar Focus:** All Three Pillars — Trust Rails 🔐, Workflow-as-Contract 📜, Submission-as-Asset 💎

> The **Phase 4 Kernel** is the core orchestration and intelligence backbone
> that all downstream features (docs, export, mission control) depend on.
> It encompasses five new innovations that strengthen every pillar.

#### 4K-1 Evidence Fabric

Unified evidence graph that links claims → sources → outcomes across every module.

| Task | File/Location | Status |
|------|---------------|--------|
| Evidence graph schema | database/schema/evidence-fabric.ts | ⏳ |
| Content-hash on every artifact version | services/evidence/ContentHashService.ts | ⏳ |
| Hash-verified traceability links | services/evidence/TraceabilityLinkService.ts | ⏳ |
| Evidence coverage dashboard | client/src/concept2cure/components/evidence/ | ⏳ |

#### 4K-2 Policy-as-Code Quality Gates

Compliance rules expressed as executable policy files evaluated at each workflow step transition.

| Task | File/Location | Status |
|------|---------------|--------|
| Policy schema + engine (OPA/Rego-style) | services/policy/PolicyEngine.ts | ⏳ |
| Gate enforcement at step transitions | services/workflow/PolicyGateEnforcer.ts | ⏳ |
| Policy authoring UI | client/src/concept2cure/components/policy/ | ⏳ |
| Policy audit log | services/policy/PolicyAuditService.ts | ⏳ |

#### 4K-3 Step DSL + Tool Registry

Declarative Step DSL (YAML/JSON) for workflow definitions and a Tool Registry for AI agents, validators, exporters.

| Task | File/Location | Status |
|------|---------------|--------|
| Step DSL schema + parser | services/workflow/StepDSLParser.ts | ⏳ |
| Tool Registry with versioning | services/registry/ToolRegistry.ts | ⏳ |
| Tool invocation from step definitions | services/workflow/ToolInvoker.ts | ⏳ |
| Step DSL validation | services/workflow/StepDSLValidator.ts | ⏳ |

#### 4K-4 Semantic Cache

LLM-aware caching layer that deduplicates semantically equivalent queries.

| Task | File/Location | Status |
|------|---------------|--------|
| Embedding-similarity cache engine | services/cache/SemanticCacheService.ts | ⏳ |
| Configurable similarity threshold | services/cache/CacheConfig.ts | ⏳ |
| Cache hit/miss metrics | services/cache/CacheMetrics.ts | ⏳ |
| Cache dashboard UI | client/src/concept2cure/components/cache/ | ⏳ |

#### 4K-5 DOCX Workflow-Native Artifact Generation

DOCX becomes a first-class workflow artifact with diff/redline and manifest hashing.

| Task | File/Location | Status |
|------|---------------|--------|
| DOCX generation service | services/export/DOCXGenerationService.ts | ⏳ |
| Diff / Redline engine | services/export/RedlineEngine.ts | ⏳ |
| Manifest hashing (SHA-256) | services/export/ManifestHashService.ts | ⏳ |
| Manifest verification endpoint | server/routes/manifest.ts | ⏳ |
| Audit trail integration | services/audit/ManifestAuditService.ts | ⏳ |

---

## � PROJECT & MODULE PM HUB

> All PM Docs are first-class UI screens and must auto-link to Chats, Artifacts, Workflows, and Audit Events.

The PM Hub provides centralized project management documentation accessible from any Project or Module context.

### PM Hub Screens

| Screen | Scope | Description | Auto-Links To |
|--------|-------|-------------|---------------|
| **Project Roadmap** | Project | Timeline, milestones, dependencies | Workflows, Tasks |
| **Module Roadmap** | Module | Module-specific delivery plan | Workflows, Artifacts |
| **Requirements** | Project/Module | Functional & regulatory requirements | Artifacts, Audit |
| **Risks** | Project/Module | Risk register with mitigations | Predictions, Alerts |
| **ADRs (Decisions)** | Project/Module | Architecture Decision Records | Chats, Audit |
| **Validation Plan** | Project | IQ/OQ/PQ validation strategy | Artifacts (test evidence) |
| **Evidence Linking** | Project | Traceability matrix | Artifacts, Audit Events |

### PM Hub UI CONTEXT

```
UI CONTEXT
- Project scope: Project-level + Module-level
- Primary surface: PM Hub (dedicated section in left sidebar)
- Supporting panels: Artifacts (linked documents), Audit (change history), Tasks (action items)
```

### PM Hub Implementation

| Component | File/Location | Status |
|-----------|---------------|--------|
| PM Hub Router | client/src/concept2cure/routing/PMHubRouter.tsx | ⏳ |
| Roadmap View | client/src/concept2cure/components/pm/RoadmapView.tsx | ⏳ |
| Requirements Editor | client/src/concept2cure/components/pm/RequirementsEditor.tsx | ⏳ |
| Risk Register | client/src/concept2cure/components/pm/RiskRegister.tsx | ⏳ |
| ADR Editor | client/src/concept2cure/components/pm/ADREditor.tsx | ⏳ |
| Validation Plan | client/src/concept2cure/components/pm/ValidationPlan.tsx | ⏳ |
| Evidence Matrix | client/src/concept2cure/components/pm/EvidenceMatrix.tsx | ⏳ |

---

## 🏗️ MODULE UI FOOTPRINTS

Each major module must define its complete UI footprint within the Project Workspace shell.

### MODULE UI FOOTPRINT — Client Portal V2

| Surface | Content |
|---------|---------|
| **Dashboard** | Tenant configuration, subscription status, usage metrics |
| **Chats** | Onboarding conversations, support threads |
| **Artifacts** | Config reports, billing exports, compliance attestations |
| **Workflows** | Tenant provisioning, role assignment, subscription upgrade |
| **PM Docs** | Integration roadmap, validation plan |

### MODULE UI FOOTPRINT — Project Cortex (Data Harvesting)

| Surface | Content |
|---------|---------|
| **Dashboard** | Data readiness score, pipeline health, validation status |
| **Chats** | Cortex design discussions, mapping QA review threads |
| **Artifacts** | Architecture spec, data mappings, validation packs, ETL logs |
| **Workflows** | Ingest → Transform → Validate → Release |
| **PM Docs** | Cortex roadmap, data source risks, validation plan |

### MODULE UI FOOTPRINT — eCTD Co-Author

| Surface | Content |
|---------|---------|
| **Dashboard** | Document completion %, section status, compliance score |
| **Chats** | Drafting conversations, multi-agent council threads |
| **Artifacts** | eCTD modules (M1-M5), CTD sections, cover letters |
| **Workflows** | Draft → Review → Approve → Sign → Export |
| **PM Docs** | Submission roadmap, content risks, QA validation |

### MODULE UI FOOTPRINT — CER Generator

| Surface | Content |
|---------|---------|
| **Dashboard** | CER generation status, literature coverage, gap analysis |
| **Chats** | CER planning, literature review discussions |
| **Artifacts** | CER reports, literature summaries, clinical data extracts |
| **Workflows** | Data Collection → Analysis → Draft → Review → Finalize |
| **PM Docs** | CER roadmap, data source risks, compliance plan |

### MODULE UI FOOTPRINT — Regulatory Intelligence

| Surface | Content |
|---------|---------|
| **Dashboard** | Morning briefing, alerts stream, regulatory calendar |
| **Chats** | Intelligence queries, competitor analysis threads |
| **Artifacts** | Briefing reports, alert digests, competitor profiles |
| **Workflows** | Alert → Triage → Analyze → Report → Archive |
| **PM Docs** | Intelligence priorities, source coverage, validation |

### MODULE UI FOOTPRINT — Mission Control

| Surface | Content |
|---------|---------|
| **Dashboard** | Portfolio view, submission timeline, risk heatmap |
| **Chats** | Executive briefings, stakeholder updates |
| **Artifacts** | Portfolio reports, milestone snapshots, KPI exports |
| **Workflows** | Planning → Execution → Review → Adjustment |
| **PM Docs** | Program roadmap, portfolio risks, resource plan |

---

## 📊 Investor Dashboard Summary

### Progress Overview
```
FOUNDATION     ████████████████████████████████████████  100%  ✅ COMPLETE
INTELLIGENCE   ████████████████████████████████████████  100%  ✅ COMPLETE
WORKFLOW       ████████████████████████████████████████  100%  ✅ COMPLETE
DOCUMENTS      ████████████████████████████████████████  100%  ✅ COMPLETE
HAQ MANAGER    ████████████████████████████████████████  100%  ✅ COMPLETE
PH4 KERNEL     ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    5%  🔄 ACTIVE
MISSION CTRL   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  ⏳ PENDING
VALIDATION     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%  ⏳ PENDING

OVERALL        ████████████████████████████░░░░░░░░░░░░   65%
```

### Key Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Phases Complete | 7/11 | 11/11 | 🟢 Ahead |
| Database Tables | 50+ | 50+ | ✅ Achieved |
| Risk Factors | 50+ | 50+ | ✅ Achieved |
| Submission Types | 7 | 7 | ✅ Achieved |
| Workflow Engine | 100% | 100% | ✅ Achieved |
| Phase 4 Kernel | 5% | 100% | 🔄 Active |

### Timeline to v1.0

| Milestone | Date | Status |
|-----------|------|--------|
| Foundation Complete | 2026-01-28 | ✅ |
| Workflow Engine | 2026-02-05 | ✅ |
| Intelligent Docs | 2026-02-05 | ✅ |
| HAQ Manager (A8) | 2026-02-05 | ✅ |
| **Phase 4 Kernel** | **2026-02-28** | **🔄 Active** |
| Mission Control | 2026-03-07 | ⏳ |
| Validation Complete | 2026-03-21 | ⏳ |
| **v1.0 Launch** | **2026-03-28** | 🎯 |

### Investment Highlights

1. **Technical Moat:** Hash-chained audit trail + trust rails = compliance-grade provenance
2. **AI Differentiation:** Multi-Agent Council with 21 CFR Part 11 logging
3. **Market Timing:** FDA digital health guidance + industry consolidation
4. **Platform Extensibility:** Marketplace rails designed (Phase 11)
5. **New Innovations:** Evidence Fabric, Policy-as-Code Gates, Step DSL, Semantic Cache, DOCX-native artifacts

---

## 🔧 UI Priority Matrix

### 🔴 P0 — Must Have (Blocks Release)
| Component | Phase | Effort |
|-----------|-------|--------|
| WorkflowTimeline | 4 | 8h |
| StepCard | 4 | 4h |
| NextActionsPanel | 4 | 4h |
| DocumentEditor | 5 | 16h |
| PortfolioGrid | 7 | 6h |

### 🟡 P1 — Should Have (Quality Release)
| Component | Phase | Effort |
|-----------|-------|--------|
| ApprovalModal | 4 | 3h |
| SignatureModal | 4 | 4h |
| ComplianceScoreBadge | 5 | 2h |

---

*This is the path to the dream. Build with conviction.*

**Last Updated:** 2026-02-05  
**Next Review:** Weekly on Mondays  
**Owner:** Concept2Cure Team  
**Status:** AUTHORITATIVE
