# PDEV → IND Workflow — Architecture finding

> Branch: `claude/pdev-ind-workflow-core-F3koK`
> Date: 2026-05-20
> Scope: Map every PDEV-to-IND requirement from the brief against the codebase, mark **what exists, what is partial, what is missing**, and decide **extend / repair / consolidate / replace** for each.

This document is the gate before any new code. It also defines the minimum bridge work this branch ships, and what is explicitly deferred to follow-on work (largely because the design system has not released the UI surfaces yet — Phases 3+ are "in design, do not pre-build" per `CLAUDE.md`).

---

## 1. Methodology

Four parallel codebase audits were run before any file was written:

1. PDEV program & workstream data models.
2. Document lifecycle, versioning, eCTD/IND module mapping, export pipelines.
3. Workflow state machines, approvals, e-signatures, audit trail / 21 CFR Part 11.
4. AI/RI drafting, FDA interaction tracking, evidence/citation/provenance, contradiction detection.

The findings below are the synthesis of those four passes, cross-checked against `shared/schema.ts` (383 `pgTable` calls), `shared/schema/*` (29 domain files), `migrations/` (46 SQL files), `server/routes/*`, `server/services/*`, and `server/bootstrap/register-*-routes.ts`.

---

## 2. Headline finding

> **The platform already has 80–85 % of the PDEV → IND spine in real, production-grade code.** The dominant risk on this branch is **rebuilding what already exists**, not "starting from zero". The CLAUDE.md search-before-build rule is correct: every domain in the brief has at least a partial implementation, most have a real one.

What is genuinely missing is the **PDEV activity registry** and the **unified orchestration layer** that joins the existing primitives into the CIRM-style PDEV → IND view. Everything downstream of that — state machine, audit, e-sig, evidence, contradictions, FDA Q&A, eCTD module mapping — is real.

---

## 3. Domain-by-domain audit

Each row marks status against the brief.
Legend — **R** = real / production-grade, **P** = partial / wired but incomplete, **S** = stub / schema-only, **M** = missing.

### 3.1 Program / project models

| Item | Status | Where it lives | Decision |
|---|---|---|---|
| Top-level program/sponsor/product/modality/indication | **R** | `shared/schema/programs.ts → regulatoryPrograms` (UUID PK, programType, productType, agency, predicates, status, phase, settings, team) | **Extend** — this is the right home for the PDEV program. Do not create a parallel `pdev_programs` table. |
| Multi-tenant project hierarchy | **R** | `shared/schema.ts → projects` (org, parent, depth, path, code, status, priority, type, progress, team) | Reuse; PDEV programs map to projects via `regulatoryPrograms.id`. |
| IND-specific project metadata | **R** | `ind_projects`, `ind_submissions`, `ind_applications`, `ind_documents`, `ind_templates`, `ind_template_usage_logs`, `ind_package_plans`, `ind_package_plan_regions`, `ind_package_plan_modalities`, `ind_package_plan_requirements`, `ind_package_plan_timelines`, `ind_package_plan_documents` | Reuse; the PDEV orchestrator reads these. |
| Q-Submission (Pre-Sub / INTERACT / SIR / SRD / Agreement / Informational) | **R** | `shared/schema/q-sub.ts → qSubmissions, qSubMeetings, qSubQuestions, qSubCommitments, qSubTimelineEntries` with `Q_SUB_TYPES`, `Q_SUB_STAGES`, `QUESTION_STATUSES`, `DOSSIER_LINK_KINDS` closed enums | Reuse — this is the canonical Pre-IND / INTERACT machinery. Do not duplicate. |
| Workstream rollup (CMC / Nonclinical / Clinical / Regulatory) as a first-class object | **M** | — | **Build** — the only genuine model gap. Implemented as a closed-enum registry + a per-program activity state table, layered on top of the existing program. |

### 3.2 Document inventory & lifecycle

| Item | Status | Where it lives | Decision |
|---|---|---|---|
| Documents table with state, version, module, region, compliance level | **R** | `shared/schema.ts → documents` (line 1720) | Reuse. |
| Immutable document version chain | **R** | `documentVersions` with SHA-256 `checksum`, `approvedBy`, `approvedAt`, `changeType`, `isPublished` | Reuse. |
| Unified document fabric | **R** | `shared/schema/unified_workflow.ts → unifiedDocuments, moduleDocuments, workflowDocumentVersions, documentAuditLogs` | Reuse. |
| Document → eCTD module/granule mapping | **R** | `ectdModules`, `ectdGranules`, `ectdTemplates`, `ectdCompilations` + `ectd_documents`, `ectd_document_versions`, `ectd_document_metadata`, `ectd_audit_trail` (SQL) | Reuse. |
| CMC inventory (drug substance, analytical methods, stability, mfg process, specifications, regulatory docs, compliance tracking) | **R** | `shared/cmc-schema.ts` (333 lines) + `shared/schema/cmc-os.ts` | Reuse. |
| Nonclinical inventory (pilot tox, DRF, GLP tox, PK/PD, species rationale, safety margins) | **P** | Stubs in `ectd-stubs/`, `migrations/20260508_preclinical_provenance.sql`, `server/routes/preclinical` | **Repair / extend** — preclinical provenance ingestion exists; the *governed document set* for nonclinical is not yet enumerated. The new PDEV registry enumerates them; documents themselves slot into existing `documents` / `unifiedDocuments`. |
| Clinical inventory (CDP, protocol synopsis, full protocol, endpoint rationale, statistical assumptions, trial startup, site/access, safety monitoring, IB summary) | **P** | `csr-knowledge-db.ts`, `cdisc-reference.ts`, protocol analyzer services exist; canonical clinical PDEV documents not enumerated | **Repair / extend** — same as nonclinical: enumerate in registry, store via existing primitives. |
| Regulatory inventory (INTERACT, Pre-IND, briefing book, FDA questions, IND readiness, IND module map, cover letter, M1–M5) | **R** | `qSubmissions` family for INTERACT/Pre-IND; `ind_package_plan_documents` for IND; `ectdModules` + `ectdGranules` for M1–M5; `regulatory-correspondence.ts` route | Reuse. |
| Export pipelines (DOCX / PDF / ZIP / signed URL / governance) | **R** | `server/services/export-service.ts`, `server/services/compute/exportGovernance.ts`, `ectd-export.ts`, `ind-pdf.ts`, `export-routes.ts`; `server/routes/ind-autodraft.ts`, `ind-generation.ts` | Reuse. |
| eCTD assembly readiness as a *computable view* | **P** | `ind_package_plan_documents` tracks per-document state with eCTD section; no single endpoint returns M1/M2/M3/M4/M5 readiness with broken-dependency / contradiction overlay | **Build** — a thin read-side aggregator. |

### 3.3 Workflow, approval, audit, Part 11

| Item | Status | Where it lives | Decision |
|---|---|---|---|
| Approval orchestrator (start, approve, reject, delegate, history) | **R** | `server/services/workflow/ApprovalOrchestrator.ts` (18 KB), `workflowTemplates`, `workflowSteps`, `documentWorkflows`, `workflowApprovals`, `workflowHistory` | Reuse. |
| Workflow runs / approval checkpoints / readiness rules / readiness evaluations | **R** | `shared/schema/orchestration.ts → workflowRuns, approvalCheckpoints, readinessRules, readinessEvaluations, projectIntelligenceSummaries` | Reuse — this IS the readiness engine the brief asks for. |
| Decision lineage / governed decision transitions (durable event log of every state change) | **R** | `migrations/0011_governed_decision_transitions.sql`, `server/services/governed-decision-repository.ts` (26.8 KB), `server/services/workflow/DecisionLineageService.ts` (19.8 KB), `DecisionLineageMap.tsx` UI | Reuse. |
| Tamper-proof audit trail (hash chain, HMAC, dual-write) | **R** | `server/lib/tamper-proof-audit.ts`, `server/services/auditService.ts`, `server/startup/audit-trail.ts`, tables `audit_logs`, `audit_trail`, `sharepoint_audit_log` | Reuse. |
| Electronic signature (Part 11) | **R** | `shared/schema.ts → electronic_signatures` (12 columns incl. signatureType, signaturePurpose, signatureLevel, authenticationMethod, signatureHash, isValid, ipAddress, deviceInfo); routes `server/routes/esignature.ts` (`/verify-password`, `/verify-mfa`, `/sign`) | Reuse. |
| Reason-for-change capture on UI mutations | **P** | Schema supports it (`signature_meaning`, `reason`); confirmation UI for governed mutations is incomplete per `REGULATORY_UX_AUDIT_2026-02-13.md` | Deferred — depends on the design system regulated-action confirmation pattern (`regulatory-compliance-ux` skill). |

### 3.4 AI / RI drafting, FDA interactions, evidence, contradictions

| Item | Status | Where it lives | Decision |
|---|---|---|---|
| Conversational RI assistant ("AnA") with threads, streaming, provenance | **R** | `server/routes/ana-ri.ts`, `server/routes/chat/{send-message,stream,threads,provenance}.ts`, `server/services/ana-ri/orchestrator.ts`, tables `concept2cure_conversations`, `concept2cure_messages`, `concept2cure_artifacts`, `concept2cure_artifact_versions` | Reuse. |
| AI generation records (prompt, model, latency, tokens, citations, run id) | **R** | `concept2cure_messages` (modelUsed, latencyMs, tokenCount), `concept2cure_artifacts` (citations, citationRunId, contentHash), `dataLineageRecords` (retrieval/generation run IDs, transformation type, confidence, AI model) | Reuse. |
| AI output promoted to governed artifact (not orphan chat) | **R** | `ARCHITECTURE-AI-ACTIONS.md` documents the promotion pipeline; `concept2cure_artifacts` is the landing table | Reuse — this is the contract the new PDEV writes must follow. |
| Evidence / citation / provenance graph | **R** | `shared/evidenceSchema.ts` (`EvidenceNode`, 67 evidence types, FDA 510(k) section mappings), `dataLineageRecords`, `concept2cure_artifacts.citations`, `server/services/external-evidence-service/` (Firecrawl + PubMed + openFDA + ClinicalTrials.gov) | Reuse. |
| Contradiction engine (cross-artifact, structured-first, severity, authority states, consequence paths) | **R** | `server/services/contradiction-engine-service.ts`, `contradiction-consequence-service.ts`, `cmc-impact-contradiction-engine.ts`, `assumption-decision-contradiction.ts` route; nightly scan workflow | Reuse — exceeds the brief. Just needs a PDEV-shaped read endpoint. |
| FDA interaction tracker (INTERACT, Pre-IND, IND submission, IRs, holds, clearance) | **R** | `qSubmissions` + family covers INTERACT / Pre-Sub / SIR / SRD / Agreement / Informational, with `qSubMeetings`, `qSubQuestions`, `qSubCommitments`, `qSubTimelineEntries`. `fda_communications` table separately tracks raw correspondence. `regulatory-correspondence.ts` route. `industry-context-templates.ts` provides Pre-IND templates. | **Consolidate read view** — the data is real; what is missing is a single endpoint that returns "all FDA touchpoints for program X" across both stores. |

### 3.5 Cross-cutting

| Item | Status | Where it lives | Decision |
|---|---|---|---|
| Readiness scoring service | **R** | `readinessRules`, `readinessEvaluations`, `projectIntelligenceSummaries`, `server/routes/intelligence.ts` (project-level), `cmcReadinessScore` on `ind_package_plans` | **Consolidate** — exists, but no PDEV-workstream rollup. New thin service computes per-workstream readiness from existing inputs. |
| Document dependency graph / contradiction registry | **R** | Contradiction service emits records; no read-side `pdev_contradiction_registry` view | **Consolidate read view**. |
| Migration prefix discipline (`scripts/ci/check-migration-prefix-collisions.mjs`) | **R** | Established date-prefixed convention `YYYYMMDD_*.sql` | Use `20260520_pdev_workflow_activities.sql`. |
| Orphan-import guard (`scripts/check-mdx-orphans.sh`) | **R** | New routes must be mounted and consumed in the same PR; new files need a real importer | Comply — every new route is mounted in `register-regulatory-routes.ts`; every new service has a route consumer. |
| UI surfaces (PDEV dashboard, workstream views, contradiction registry, IND assembly view) | **N/A** | Phases 3+ in design only per `CLAUDE.md` / `HANDOFF.md` | **Defer** — building UI without a design kit violates the design-system contract. Backend exposes the API; UI ships when its phase ships. |

---

## 4. What this branch ships

This branch is the **backend spine** plus the **closed-enum registry** that everything else hangs off. UI is intentionally **not** built (Phase 3 Projects detail is "in design — do not pre-build"; PDEV surfaces are not yet in the kit at all).

### 4.1 New schema (one file, one migration)

- `shared/schema/pdev-workflow.ts` — Drizzle table definitions plus the canonical activity registry (closed enum, ~56 activities × 4 workstreams × stage-aware).
- `migrations/20260520_pdev_workflow_activities.sql` — creates:
  - `pdev_program_activities` (per-program state of each registry activity).
  - `pdev_readiness_snapshots` (point-in-time workstream rollups for trend visibility; complements `readinessEvaluations`, does not duplicate).
- The registry itself is a TypeScript closed enum (no table), per the project rule "port the enums, leave the demo rows behind".

### 4.2 New services (`server/services/pdev/`)

- `pdev-activity-registry.ts` — exports the canonical CIRM-aligned PDEV activities, their workstream, stage gate, required documents (by code → existing template ids where possible), eCTD destination, and dependencies.
- `pdev-orchestrator.ts` — read-side orchestrator. Given a `regulatoryPrograms.id`, joins `regulatoryPrograms` + `indPackagePlans` + `qSubmissions` + `fda_communications` + `documents` + `unifiedDocuments` + `dataLineageRecords` + contradiction registry into one PDEV view.
- `pdev-readiness-service.ts` — computes per-workstream readiness from existing inputs (`readinessEvaluations`, `ind_package_plan_requirements`, `pdev_program_activities`).
- `pdev-ind-assembly.ts` — computes M1/M2/M3/M4/M5 assembly readiness with broken-dependency overlay.
- `pdev-fda-interactions.ts` — unifies `qSubmissions` family + `fda_communications` into one chronological interaction stream for a program.
- `pdev-contradiction-bridge.ts` — adapter exposing the existing contradiction engine output as a PDEV-shaped registry view.

### 4.3 New routes (`server/routes/pdev/`)

All mounted under `/api/pdev`, auth-gated via `authenticateToken`, registered from `server/bootstrap/register-regulatory-routes.ts`.

- `GET  /api/pdev/registry` — canonical activity registry (closed enum).
- `GET  /api/pdev/programs/:programId` — unified program view.
- `GET  /api/pdev/programs/:programId/workstreams` — 4-workstream rollup.
- `GET  /api/pdev/programs/:programId/workstreams/:workstream` — drill-down (CMC | nonclinical | clinical | regulatory).
- `GET  /api/pdev/programs/:programId/readiness` — per-workstream readiness scores.
- `GET  /api/pdev/programs/:programId/ind-assembly` — M1–M5 readiness.
- `GET  /api/pdev/programs/:programId/fda-interactions` — chronological FDA touchpoint stream.
- `GET  /api/pdev/programs/:programId/contradictions` — contradiction registry for the program.
- `POST /api/pdev/programs/:programId/activities/:activityKey/state` — update one activity's state (audit-logged through existing `auditService`).
- `POST /api/pdev/programs/:programId/readiness/snapshot` — materialize a readiness snapshot.

Every write goes through the existing `auditService` (dual-write hash-chain) and is mapped to a `governed_decision_transitions` row through `governed-decision-repository`, so no new audit machinery is created.

### 4.4 Tests

- `server/services/pdev/__tests__/pdev-activity-registry.test.ts` — enum shape + coverage assertions.
- `server/services/pdev/__tests__/pdev-readiness-service.test.ts` — rollup math against fixtures.
- `server/services/pdev/__tests__/pdev-orchestrator.test.ts` — orchestrator joins return shape.

### 4.5 Verification

- `pnpm typecheck` (full repo).
- `pnpm lint` (server scope).
- `pnpm test` for the new files.
- Smoke check: route is mounted under `/api/pdev`, registry endpoint returns the canonical activities.

---

## 5. What this branch deliberately does **not** ship

This is honest scoping. Each deferral has a reason rooted in the project's own rules.

| Brief item | Status here | Reason |
|---|---|---|
| PDEV dashboard, workstream drill-downs, contradiction registry, IND assembly view, FDA interaction tracker — all UI | **Not built** | Phase 3+ surfaces are "in design — do not pre-build" per `CLAUDE.md` / `HANDOFF.md`. Building UI without a kit violates the design-system contract and creates regression risk (see 2026-04-26 token bug). |
| Full AI drafting hook into PDEV activities (`/draft this nonclinical IND summary into Module 4 of program X`) | **Shipped (backend) — 2nd pass** | `pdev-ai-drafting` service generates a governed artifact bound to a PDEV activity via the existing `executeGovernedAnaOperation` pipeline. Route: `POST /api/pdev/programs/:id/activities/:key/ai-draft`. UI command-binding ships when the AnA dock pane lands. |
| eCTD backbone *compile* invocation | **Shipped (backend) — 2nd pass** | `pdev-ectd-compile` calls the existing `generateEctdPackage` only when PDEV IND-assembly readiness ≥ threshold (default 90 %). The endpoint stays labelled as *compile* (readiness-gated, audit-logged), not new publishing. Route: `POST /api/pdev/programs/:id/ind-assembly/compile`. |
| Auto-conversion of FDA feedback to downstream tasks | **Shipped (backend) — 2nd pass** | `pdev-fda-feedback-rollup` proposes activity matches for unrolled `q_sub_commitments` using a deterministic token-overlap heuristic; the apply step appends the commitment to activity notes, advances state to `agency_feedback_received`, and marks the commitment `rolled_in`. Routes: `GET /api/pdev/programs/:id/fda-feedback/proposals`, `POST /api/pdev/programs/:id/fda-feedback/apply`. |
| Evidence-to-activity wiring | **Shipped (backend) — 2nd pass** | `pdev-evidence-attach` connects `evidence_objects` to PDEV activities via the existing `evidence_links` table (`targetType='pdev_activity'`). On first attach, advances activity state to `evidence_linked` if currently `not_started` / `drafting`. Routes: `POST/DELETE/GET /api/pdev/programs/:id/activities/:key/evidence`. |
| Reason-for-change confirmation dialogs everywhere | **Not built** | E-sig backend supports it; the dialog is a `regulatory-compliance-ux` skill concern and ships with each governed mutation surface. |
| "21 CFR Part 11 compliant" certification claim | **Not claimed** | Honest label is **Part 11-aligned electronic record governance**, per the project's own discipline (`AUDIT-AI-UBIQUITY.md`). |

---

## 6. Next-build sequence (follow-on PRs)

In dependency order, when the relevant design phase ships:

1. **AI drafting → PDEV activity bridge.** Adds a `targetActivityKey` to the AI generation request; on accept, the artifact is filed against the PDEV activity and lifecycle-tracked. Backend hook is here in this PR; the conversation surface is a kit-gated UI change.
2. **PDEV workstream UI** (Phase 4 or later) — once a kit lands, port verbatim.
3. **IND assembly view UI** — same gate.
4. **Reason-for-change confirmation dialogs** on every PDEV mutation surface, per `regulatory-compliance-ux` skill.
5. **Real eCTD publishing** if/when an ICH eCTD 4.0 backbone vendor / library is integrated. Until then, the endpoint stays labelled as readiness.

---

## 7. Files touched in this PR

**Pass 1 — spine:**

- `PDEV_IND_WORKFLOW_AUDIT.md` (this file).
- `shared/schema/pdev-workflow.ts` (new — Drizzle schema for activity state).
- `migrations/20260520_pdev_workflow_activities.sql` (new).
- `server/services/pdev/pdev-activity-registry.ts` (new — closed enum).
- `server/services/pdev/pdev-orchestrator.ts` (new).
- `server/services/pdev/pdev-readiness-service.ts` (new).
- `server/services/pdev/pdev-ind-assembly.ts` (new).
- `server/services/pdev/pdev-fda-interactions.ts` (new).
- `server/services/pdev/pdev-contradiction-bridge.ts` (new).
- `server/routes/pdev/pdev-routes.ts` (new — single router for the family).
- `server/bootstrap/register-regulatory-routes.ts` (edited — mounts the family).
- `shared/schema/index.ts` (edited — re-exports PDEV types).
- `server/services/pdev/__tests__/{pdev-activity-registry,pdev-orchestrator}.test.ts` (new).

**Pass 2 — backend completion (everything but UI):**

- `server/services/pdev/pdev-ai-drafting.ts` (new — governed AI draft bound to a PDEV activity).
- `server/services/pdev/pdev-ectd-compile.ts` (new — readiness-gated eCTD compile bridge).
- `server/services/pdev/pdev-fda-feedback-rollup.ts` (new — propose + apply Q-Sub commitment → activity rollup).
- `server/services/pdev/pdev-evidence-attach.ts` (new — evidence_objects ↔ PDEV activity wiring).
- `server/routes/pdev/pdev-routes.ts` (edited — adds 7 routes for the new services).
- `server/services/pdev/__tests__/{pdev-ai-drafting,pdev-fda-feedback-rollup}.test.ts` (new).

**Pass 4 — depth + verification:**

- `server/services/pdev/pdev-state-guard.ts` (new — dependency-graph gate for state promotions).
- `server/services/pdev/pdev-provenance-trace.ts` (new — single trace tree across activity-state + evidence + artifacts + lineage + audit).
- `server/routes/pdev/pdev-routes.ts` (edited — adds `force` to state body, adds `/provenance` route, gate-rejects with `409` blockers list).
- `server/services/ana-ri/pdev-command-handlers.ts` (edited — adds `pdev.activity.provenance`, gate-rejects state mutations with `force`-override path; 17 commands total).
- `server/services/pdev/__tests__/pdev-state-guard.test.ts` (new — 13 tests).
- `scripts/pdev_smoke.mjs` (new — real-DB 8-step walkthrough covering the brief's smoke-test requirement; runs via `pnpm smoke:pdev`).
- `package.json` (edited — adds `smoke:pdev` script).

**Pass 3 — AnA conversational surface for PDEV:**

The CIRM brief requires that "AnA drives everything through natural conversation."
Every PDEV verb is now a registered AnA command, discoverable by the
existing LLM tool-use surface via `COMMAND_REGISTRY` and dispatched via
`command-executor.ts`. Same governance contract as the MDX commands:
read-only verbs are open; mutations require `confirm: 'yes'` + `reason`;
`pdev.ind_assembly.compile` enforces a 30-char reason floor.

16 commands registered (audit prefix `agent.ana.pdev.*`):

| Command | Class | What AnA can now do in conversation |
|---|---|---|
| `pdev.registry.list` | read | "What PDEV activities exist for Nonclinical?" |
| `pdev.program.get` | read | "Show me the PDEV state for OR-801." |
| `pdev.program.readiness` | read | "What is blocking IND for OR-801?" |
| `pdev.program.workstream` | read | "What is the CMC status?" |
| `pdev.program.ind_assembly` | read | "How ready is OR-801 for IND assembly?" |
| `pdev.program.fda_interactions` | read | "Walk me through every FDA interaction on OR-801." |
| `pdev.program.contradictions` | read | "Show me the critical contradictions." |
| `pdev.fda_feedback.proposals` | read | "What FDA commitments need to be rolled into PDEV?" |
| `pdev.activity.evidence_list` | read | "What evidence is attached to nonclinical.glp_tox?" |
| `pdev.activity.set_state` | governed | "Mark cmc.formulation_development as approved." |
| `pdev.activity.ai_draft` | governed | "Draft my GLP tox summary into Module 4." |
| `pdev.activity.evidence_attach` | governed | "Attach PMID 12345678 to the endpoint rationale." |
| `pdev.activity.evidence_detach` | governed | "Detach that evidence — it's been superseded." |
| `pdev.fda_feedback.apply` | governed | "Roll up these two FDA commitments." |
| `pdev.ind_assembly.compile` | governed (high) | "Compile the IND eCTD for OR-801." |
| `pdev.readiness.snapshot` | governed | "Snapshot readiness now for the weekly RA review." |

- `server/services/ana-ri/pdev-command-handlers.ts` (new).
- `server/services/ana-ri/command-executor.ts` (edited — imports + merges PDEV metadata + handlers into the dispatch).
- `server/services/ana-ri/__tests__/pdev-command-handlers.test.ts` (new).
