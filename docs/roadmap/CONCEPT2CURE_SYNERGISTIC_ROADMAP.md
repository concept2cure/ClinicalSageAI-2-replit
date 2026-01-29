# Concept2Cure Synergistic Roadmap (Unified v3 + Claude UX + DVLP Learnings)
> **Generated:** 2026-01-28  
> **Scope:** Merge of Unified Roadmap Parts 1–5, v2→v3 Transformation, v3 Complete System, Claude UX Foundation, Complete Implementation Guide, plus DVLP-inspired roadmap injections.


## Table of Contents
1. Operating Rules for a Solo Codespace Build
2. North Star and Non-Negotiables
3. Target System Architecture
4. Canonical Data Model and Compliance Rails
5. Execution Plan (Phased Build in Codespaces)
6. DVLP-Inspired Enhancements: What to Do Now vs Later
7. Codespace Agent Runbooks (Copy/Paste Prompts)
8. Definition of Done, Metrics, and Validation
9. Appendices (Mappings to Source Roadmap Files)


## 1. Operating Rules for a Solo Codespace Build

### 1.1 Build Strategy
- **Foundation first, features second.** If tenant isolation, audit, and traceability aren't real, everything else is cosplay.
- **One "golden path" per submission type** before adding breadth (IND first, then 510(k), then NDA/BLA).
- **Every feature must ship with:** (a) data model, (b) UI entry point, (c) API surface, (d) audit trail, (e) tests.

### 1.2 Codespaces Workflow (You + Codespace Agent)
- You handle: environment variables, secrets, vendor account steps (OAuth apps, cloud dashboards), final review/merge.
- Agent handles: implementation tasks, migrations, unit tests, wiring routes/UI, docs updates.
- Use a strict loop:
  1) create branch → 2) implement → 3) run tests → 4) smoke test in dev → 5) PR → 6) merge.

### 1.3 Repository "Single Source of Truth"
Create a docs folder with these *canonical* files:
- `/docs/roadmap/CONCEPT2CURE_SYNERGISTIC_ROADMAP.md` (this document)
- `/docs/roadmap/ROADMAP_BACKLOG.md` (tickets list)
- `/docs/roadmap/ARCH_DECISIONS.md` (short ADRs)
- `/docs/roadmap/AGENT_RUNBOOKS.md` (prompts + commands)

> If something isn't in the backlog, it doesn't exist.

### 1.4 Required Tooling
- DB: Postgres (Neon/Supabase) + **RLS**, pgvector
- App: Next.js/React + Tailwind + shadcn/ui
- API: Node/Express or Next route handlers (match current repo)
- Workers: Node or Python (match current ingestion stack)
- Storage: S3-compatible (or Supabase Storage) + signed URLs
- Observability: structured logs + request IDs + basic tracing


## 2. North Star and Non-Negotiables

### 2.1 North Star
Build the **Intelligent Regulatory Operating System**:
- **Mission Control** for portfolios, risks, resources, timelines.
- **Workflow Orchestration** (submission-type playbooks + execution engine).
- **Intelligent Document System** (traceability, living docs, compliance scoring, auto-generated tables).
- **Claude-style UX**: Projects + Artifacts + split-screen chat that controls everything.

### 2.2 Compliance Non-Negotiables (21 CFR Part 11 + GxP Mindset)
- **Tenant isolation at the database layer** (RLS), not "app filtering."
- **Immutable audit trails** for: auth events, document edits, approvals, signatures, exports, system actions.
- **Electronic signatures**: signer identity, intent, meaning, timestamp, record version hash.
- **Data integrity**: hash fingerprints for source files and exported submissions.

### 2.3 DVLP Learnings (What Matters, Not the Buzzwords)
DVLP's real takeaway is not "blockchain." It's:
- **Workflow-as-contract**: milestones that trigger actions.
- **Trust rails**: provable provenance of data and decisions.
- **Asset lifecycle**: treat each submission/program as an "asset" with state, ownership, and history.
- **Marketplace hooks**: embed vendors/expert networks into the workflow (optional later).


## 3. Target System Architecture

### 3.1 Core UX Paradigm (Claude.ai for Regulatory)
- **Projects** = regulatory workspaces (client/program/submission scoped).
- **Artifacts** = living outputs (Word/PDF-like docs, matrices, reports, filings).
- **Split-screen**: chat on left, artifact/editor on right.
- **Artifact publishing + remixing**: clone artifacts into new projects with provenance.

### 3.2 Three-Layer System (v3)
1) **Layer 1 — Mission Control Dashboard**
   - Portfolio view, resource allocator, intelligence feeds.
2) **Layer 2 — Workflow Orchestration Engine**
   - Submission-type workflow definitions (IND/510k/NDA).
   - Engine that executes steps, assigns owners, captures approvals.
3) **Layer 3 — Intelligent Document System**
   - Source traceability
   - Living documents + change propagation
   - Real-time compliance scoring
   - Data integration pipelines (EDC/LIMS/CTMS)

### 3.3 Service Boundaries (Pragmatic Solo Build)
- **App/UI**: Next.js (Projects, Artifacts, Editor, Dashboards)
- **API**: submissions, documents, workflow, sources, audit, signatures
- **Workers**: ingestion, parsing, embeddings, table generation
- **DB**: authoritative state (workflows, docs, sources, audit, tenants)
- **Storage**: files + exports


## 4. Canonical Data Model and Compliance Rails

### 4.1 Core Entities (Minimum)
- `tenants` (orgs)
- `users`, `memberships` (tenant roles)
- `projects` (workspace; tenant-scoped)
- `submissions` (IND/510k/NDA; project-scoped)
- `workflow_definitions`, `workflow_runs`, `workflow_steps`, `step_runs`
- `artifacts` (documents/outputs), `artifact_versions`
- `sources` (uploaded files or external datasets), `source_versions` (hashes)
- `artifact_source_links` (traceability graph)
- `compliance_rules`, `compliance_scores`
- `audit_log` (immutable)
- `electronic_signatures`
- `export_jobs` (Word/PDF/eCTD exports)

### 4.2 RLS + Tenant Isolation
- Every table has `tenant_id`.
- RLS policy: only records matching `app.current_tenant`.
- Admin bypass only via explicit server-side session claims.

### 4.3 Trust Rails (DVLP-inspired, but practical)
Implement **hash-chained audit + record fingerprinting**:
- Every `audit_log` row includes `prev_hash` and `entry_hash`.
- Every `artifact_version` stores:
  - content hash (canonical serialization)
  - referenced `source_version` hashes
- Every export stores a **release hash**: "what exactly was submitted."

> This gives you DVLP-grade "provable" history without shipping a blockchain.

### 4.4 Workflow-as-Contract
- Each workflow step has:
  - `preconditions` (data present, approvals, signatures)
  - `effects` (create next task, trigger worker, notify user, lock version)
  - `sla` and escalation rules
- When preconditions are met, the engine auto-advances (or queues for approval).

### 4.5 Electronic Signatures
- Signature record includes: user_id, meaning (approve/author/release), timestamp, artifact_version_id, release_hash.
- Signature action writes an audit event and locks the signed version.


## 5. Execution Plan (Phased Build in Codespaces)

### Phase 0 — Repo + Environment Hardening (Day 1)
**Goal:** the project boots cleanly, tests run, DB connects, and CI is predictable.

**Tasks**
- [x] Add `.env.example` + env validation (fail fast)
- [x] Add `docker-compose.dev.yml` (optional) for local DB parity
- [x] Add scripts:
  - `npm run db:migrate`
  - `npm run db:seed`
  - `npm run test`
  - `npm run lint`
- [x] Configure Neon/Supabase DB + `pgvector`
- [x] Add request IDs + structured logging middleware
- [x] Add a "health" endpoint for API and workers

**Acceptance**
- `npm run dev` works in Codespaces
- migrations apply cleanly
- a seed tenant + user can login

**Status:** ✅ COMPLETE

---

### Phase 1 — Database Foundation + RLS + Audit (Week 1)
**Goal:** compliance-grade tenant isolation + immutable audit exists before fancy UI.

**Tasks**
- [x] Implement core schema (Section 4.1)
- [x] Enable **RLS on every tenant table**
- [x] Implement session → `SET app.current_tenant` on DB connection
- [x] Implement immutable `audit_log` with hash chaining (trust rails)
- [x] Implement file storage tables (`sources`, `source_versions`) + hashing
- [x] Implement RBAC: admin, manager, contributor, viewer
- [x] Add e-signature tables (even if UI ships later)

**Acceptance**
- Cross-tenant access is impossible (verified with tests)
- Every create/update/delete writes an audit entry
- Every uploaded file has a hash and version record

**Status:** ✅ COMPLETE

---

### Phase 2 — Submission Pyramids + Projects UX Foundation (Week 2)
**Goal:** Regulatory submission structures exist + user can create/switch projects instantly.

**Tasks**
- [x] Create 510(k) pyramid structure
- [x] Create IND pyramid structure
- [x] Create NDA/BLA pyramids
- [x] Create PMA pyramid
- [x] Create MAA pyramid
- [x] Create De Novo pyramid (extended)
- [x] Create Submission Pyramid Engine service
- [x] Claude-style left sidebar: project list + search + create modal
- [x] Project context switching (updates tenant/project scope)
- [x] Split-screen layout: chat (left) + artifact/editor (right)
- [x] Artifact panel: create/open artifacts, version list, export buttons
- [x] Persistence: project state restored on reload

**Acceptance**
- New project created in <10 seconds
- Switching projects updates context without refresh
- Artifact opens with version history
- All submission pyramid types available

**Status:** ✅ COMPLETE

---

### Phase 3 — Predictive Intelligence Engine (Weeks 3–4)
**Goal:** Risk detection engine with 50+ automated risk factors and proactive monitoring.

**Tasks**
- [x] Create risk factor definitions (510k-risks, ind-risks, project-health-risks)
- [x] Create automated risk detectors:
  - IFUConsistencyDetector
  - PredicateMonitor
  - CMCAnalyzer
  - ProtocolDesignAnalyzer
  - DeviceDescriptionChecker
- [x] Create PredictiveIntelligenceEngine (prediction generation, success probability)
- [x] Create ProactiveMonitoringService (scheduled monitoring, alerts)
- [x] Create OutcomeScenarioGenerator (realistic outcome scenarios)

**Acceptance**
- All risk detectors return structured results
- Prediction accuracy >70% (validated against historical data)
- Predictions generate in <5 seconds
- Proactive monitoring runs automatically
- Alerts trigger for high-severity risks

**Status:** ✅ COMPLETE

---

### Phase 4 — Workflow Orchestration Engine (Weeks 5–6)
**Goal:** IND workflow can run end-to-end as executable steps with owners, due dates, and auto-advancement.

**Tasks**
- [ ] Workflow definition format (JSON/YAML in DB)
- [ ] Execution engine:
  - step queue
  - precondition checks
  - auto-advance rules
  - manual approval gates
- [ ] Step templates for IND:
  - program intake
  - source ingestion
  - authoring plan
  - section drafting
  - review/signature
  - export/release
- [ ] UI: workflow timeline + step status + next actions
- [ ] Notifications (in-app first; email later)

**Acceptance**
- IND workflow run created automatically when an IND submission is created
- At least 10 core steps execute and advance predictably
- Audit trail captures every step transition and approval

**Status:** ⏳ NOT STARTED

---

### Phase 5 — Intelligent Document System (Week 7)
**Goal:** traceability + living docs + compliance scoring are real, not marketing.

**Tasks**
- [ ] Editor: unified doc editor (Google Docs style)
- [ ] Traceability UI:
  - highlight text → link to source
  - show source preview + hash + citation
- [ ] Change propagation:
  - when `source_version` updates, compute impacted artifacts/sections
  - create "suggested patch" drafts
- [ ] Compliance scoring:
  - rules engine (completeness, required sections, missing citations)
  - real-time dashboard

**Acceptance**
- A claim can be linked to a specific source hash
- Updating a source flags impacted sections within minutes
- Compliance score updates live

**Status:** ⏳ NOT STARTED

---

### Phase 6 — eCTD Co-Author + Document Drafting (Week 8)
**Goal:** generate and manage submission structures (IND first, then 510k/NDA).

**Tasks**
- [ ] Submission Pyramid schemas for IND/510k/NDA
- [ ] Auto-create artifact skeletons per submission type
- [ ] eCTD module scaffolding:
  - module map
  - file packaging
  - metadata
- [ ] Multi-Agent Council Implementation (Drafter, Reviewer, Statistician, Critic, Synthesizer)
- [ ] Export pipeline:
  - Word/PDF (initial)
  - eCTD packaging (next)

**Acceptance**
- Creating an IND submission generates required structure + artifacts
- Export produces a consistent release hash + signed versions
- Multi-agent council produces coherent output
- Generated documents require minimal human editing

**Status:** ⏳ NOT STARTED

---

### Phase 7 — Mission Control Dashboard + Lumen PM (Week 9)
**Goal:** portfolio home screen that answers "what is risky, late, blocked, and why".

**Tasks**
- [ ] Portfolio view: all projects/submissions + status
- [ ] Risk dashboard:
  - missing evidence
  - compliance gaps
  - workflow bottlenecks
- [ ] Resource allocator: who owns what, workload, SLAs
- [ ] Intelligence feeds (basic): regulatory updates, internal alerts
- [ ] PM Settings & Configuration UI

**Acceptance**
- In 30 seconds, a user can identify top 5 blockers across portfolio
- Risk scores are explainable (with links to evidence)

**Status:** ⏳ NOT STARTED

---

### Phase 8 — Communication Hub + HAQ Manager (Week 10)
**Goal:** manage health authority questions with traceability and response workflows.

**Tasks**
- [ ] HAQ intake (email/manual upload)
- [ ] Response workflow: assign, draft, review, sign, export
- [ ] Link responses to sources + prior submissions
- [ ] Timeline and audit
- [ ] FDA Communication tracking

**Acceptance**
- HAQs can be triaged and tracked to closure
- Every response is traceable and versioned

**Status:** ⏳ NOT STARTED

---

### Phase 9 — Data Ingestion Workers + Connectors (Weeks 11–12)
**Goal:** ingestion is reliable and creates structured, searchable intelligence.

**Tasks**
- [ ] Worker queue (bullmq/redis or current pattern)
- [ ] Ingestion pipelines:
  - PDF parsing
  - table extraction
  - embeddings
  - metadata normalization
- [ ] Connectors (start with 1):
  - CTMS/EDC export ingest (CSV)
  - or LIMS export ingest
- [ ] Auto-generated tables/figures in artifacts

**Acceptance**
- Upload → indexed → searchable in <5 minutes for typical docs
- Tables can be regenerated from data sources

**Status:** ⏳ NOT STARTED

---

### Phase 10 — Testing, Validation, Security Hardening, Deployment (Weeks 13–14)
**Goal:** production posture: quality + compliance evidence + deployable.

**Tasks**
- [ ] Unit + integration tests for RLS, workflow engine, traceability
- [ ] E2E tests for IND golden path
- [ ] Performance tests (ingestion + editor + dashboard)
- [ ] IQ/OQ/PQ validation packet (GxP)
- [ ] Security:
  - secrets handling
  - least-privileged tokens
  - rate limiting
  - audit log immutability enforcement
- [ ] Deployment:
  - staging + prod
  - DB migrations strategy
  - backup/restore

**Additional Security/Compliance Tasks**
- [ ] Encryption at rest (storage + DB) and in transit (TLS everywhere)
- [ ] Session controls: idle timeout, device/session revocation, MFA-ready hooks
- [ ] Tamper-evidence enforcement: audit_log append-only policy (no updates/deletes)
- [ ] Retention policies + legal hold (configurable)
- [ ] Export watermarking + provenance footer (release hash)

**Acceptance**
- A full IND project can be created, drafted, reviewed, signed, exported end-to-end
- Validation evidence exists for compliance-critical functions

**Status:** ⏳ NOT STARTED

---

### Phase 11 (Optional) — Marketplace + Funding Rails (Post-Foundation)
**Goal:** embed vendors and (optionally) financing into the same workflow rails — *only after the core product is stable.*

**Marketplace (Vendor/Expert Network)**
- [ ] Vendor onboarding: profile, capabilities, pricing model, NDAs, SLAs
- [ ] "Request work" workflow step type: scope → bid/accept → deliverables → approval
- [ ] Partner portal v2: white-label, client visibility, billing
- [ ] Take-rate billing: invoice generation + payouts (start manual)

**Funding Rails (Defer unless you have legal clearance)**
- [ ] Milestone escrow simulation (no public tokens): pledge → hold → release on signature
- [ ] Investor data room: release hashes + compliance scores + progress proofs
- [ ] KYC/AML + securities compliance plan (outside engineering scope, but required)

**Acceptance**
- A partner can be invited into a project with scoped access
- A "vendor task" can be created and completed through workflow
- Billing events are logged and auditable

**Status:** ⏳ FUTURE


## 6. DVLP-Inspired Enhancements: What to Do Now vs Later

### Do NOW (because it strengthens the foundation)
1) **Trust Rails (hash chaining + release hashes)** ✅ IMPLEMENTED
   - You already need this for Part 11-like defensibility.
2) **Workflow-as-Contract (milestone triggers)**
   - Makes your orchestration engine actually "autonomous."
3) **Submission-as-Asset lifecycle state machine**
   - Adds clarity to Mission Control and monetization later.

> These are low-risk, high-leverage because they piggyback on the core platform you're building anyway.

### Do LATER (after the core IND golden path ships)
4) **Marketplace (CRO/expert network in-workflow)**
   - Requires stable workflow engine, vendor onboarding, billing, and governance.
5) **Embedded finance / fractional investment mechanics**
   - Requires legal/regulatory work, KYC/AML, securities constraints, and a mature product.
6) **AFO-style "project-as-entity" governance**
   - Do this when you have repeated success patterns and want to scale via partners/funders.

### Gating Criteria (don't start "later" items until these are true)
- IND golden path works end-to-end with signatures + exports.
- Audit trail and traceability are validated and trusted.
- A working partner portal exists (read-only at minimum).
- You have at least 2–3 real-world projects to inform marketplace needs.


## 7. Codespace Agent Runbooks (Copy/Paste Prompts)

### Runbook A — Phase 1 (DB + RLS + Audit) ✅ COMPLETE
**Prompt to agent:**
- Implement the schema in Section 4.1 with RLS on all tenant tables.
- Add immutable audit_log with hash chaining (prev_hash/entry_hash).
- Add tests that prove cross-tenant reads fail.
- Add file hashing on upload: write to source_versions with sha256.
- Update docs: record new env vars and migration commands.

**Commands**
```bash
npm run db:migrate
npm run test
npm run lint
npm run dev
```

### Runbook B — Claude-Style Projects + Artifacts UI ✅ COMPLETE
**Prompt to agent:**
- Build the left sidebar Projects nav (search, create modal, switch).
- Build split-screen layout (chat left, artifact/editor right).
- Persist project selection in URL + local storage.
- Add artifact list + version history panel.

### Runbook C — Predictive Intelligence Engine ✅ COMPLETE
**Prompt to agent:**
- Create risk factor definitions (50+ factors across 510k, IND, project health).
- Implement automated detectors (IFU, Predicate, CMC, Protocol, Device Description).
- Create PredictiveIntelligenceEngine with success probability calculation.
- Create ProactiveMonitoringService with scheduled cycles and alerts.
- Create OutcomeScenarioGenerator with detailed scenario modeling.

### Runbook D — Workflow Engine (NEXT)
**Prompt to agent:**
- Create workflow_definitions + workflow_runs tables and API.
- Implement executor that advances steps based on preconditions.
- Implement IND workflow template with 10 steps and approvals.
- Add UI timeline and next-actions.


## 8. Definition of Done, Metrics, and Validation

### 8.1 "Done" Means
- Feature is wired end-to-end: DB + API + UI + audit + tests.
- Has a rollback plan (migration down or safe forward-only).
- Has a demo script: how to show it in 5 minutes.

### 8.2 Metrics That Matter
- **Time-to-first-draft** per submission type
- **Citations per claim** coverage
- **Change propagation latency** (source change → flagged impacts)
- **Workflow throughput** (steps closed per day)
- **Audit completeness** (% actions logged)
- **Export integrity** (release hash stability)
- **Prediction accuracy** (>70% target)
- **Risk detection latency** (<5 seconds)

### 8.3 Validation Evidence (IQ/OQ/PQ)
- IQ: environment, versions, dependencies
- OQ: workflows, traceability, signatures, exports
- PQ: real-world scenario walkthrough (IND golden path)


## 9. Appendices

### 9.1 Source Roadmap Files Merged Here
- CONCEPT2CURE_UNIFIED_ROADMAP_PART1–5.md
- CONCEPT2CURE_V2_TO_V3_TRANSFORMATION.md
- CONCEPT2CURE_V3_COMPLETE_SYSTEM.md
- CONCEPT2CURE_CLAUDE_UX_FOUNDATION.md
- CONCEPT2CURE_COMPLETE_IMPLEMENTATION_GUIDE.md
- CONCEPT2CURE_DVLP_ROADMAP_INJECTIONS.md

### 9.2 Where DVLP Injections Land
- **Phase 1:** trust rails (hash chaining), provable audit ✅
- **Phase 3:** predictive intelligence engine ✅
- **Phase 4:** workflow-as-contract (milestone triggers)
- **Phase 7:** asset lifecycle in mission control
- **Phase 11+ (optional):** marketplace + embedded finance

### 9.3 Implementation Status Summary

| Phase | Name | Status | Completion |
|-------|------|--------|------------|
| 0 | Repo + Environment Hardening | ✅ COMPLETE | 100% |
| 1 | Database Foundation + RLS + Audit | ✅ COMPLETE | 100% |
| 2 | Submission Pyramids + Projects UX | ✅ COMPLETE | 100% |
| 3 | Predictive Intelligence Engine | ✅ COMPLETE | 100% |
| 4 | Workflow Orchestration Engine | ⏳ NOT STARTED | 0% |
| 5 | Intelligent Document System | ⏳ NOT STARTED | 0% |
| 6 | eCTD Co-Author + Document Drafting | ⏳ NOT STARTED | 0% |
| 7 | Mission Control + Lumen PM | ⏳ NOT STARTED | 0% |
| 8 | Communication Hub + HAQ Manager | ⏳ NOT STARTED | 0% |
| 9 | Data Ingestion Workers | ⏳ NOT STARTED | 0% |
| 10 | Testing, Validation, Deployment | ⏳ NOT STARTED | 0% |
| 11 | Marketplace + Funding Rails | ⏳ FUTURE | 0% |

### 9.4 "Later" Roadmap Placeholder (Post-v3.0)
- Vendor marketplace module
- Partner portal v2 (white-label, billing)
- Funding rails (milestone escrow, syndicated funding)
- AFO governance templates (entity ops, IP, cap table, dissolution)

### 9.5 Files Created in Phase 3

**Risk Factor Definitions:**
- `services/ai/risk-factors/510k-risks.ts` - 15 risk factors
- `services/ai/risk-factors/ind-risks.ts` - 18 risk factors
- `services/ai/risk-factors/project-health-risks.ts` - 17 risk factors
- `services/ai/risk-factors/index.ts` - Central export

**Automated Detectors:**
- `services/ai/detectors/IFUConsistencyDetector.ts`
- `services/ai/detectors/PredicateMonitor.ts`
- `services/ai/detectors/CMCAnalyzer.ts`
- `services/ai/detectors/ProtocolDesignAnalyzer.ts`
- `services/ai/detectors/DeviceDescriptionChecker.ts`
- `services/ai/detectors/index.ts`

**Core Services:**
- `services/ai/PredictiveIntelligenceEngine.ts`
- `services/ai/ProactiveMonitoringService.ts`
- `services/ai/OutcomeScenarioGenerator.ts`
- `services/ai/index.ts` - Main export with factory functions

---

*Last Updated: 2026-01-28*
*Next Phase: Phase 4 — Workflow Orchestration Engine*
