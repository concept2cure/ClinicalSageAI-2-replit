# Projects Subsystem — Context Isolation, Fidelity, and Build-Gap Audit

**Date:** 2026-04-22
**Scope:** Data model, services, routes, memory system, RIM wiring, context assembly, authorization, and multi-tenancy boundaries for the Projects subsystem.
**Out of scope:** UI (explicit user directive — do not touch UI).

---

## A. How a Project is Composed Today

### Core entity
- **`projects`** (`shared/schema.ts:5034`) — root. Scoped by `organizationId` (required) and optional `clientWorkspaceId`. Hierarchy via `parentProjectId`, `depth` (0=Program, 1=Project, 2=Study, 3=Sub-project), and materialized `path`. Carries `status`, `priority`, `type`, `progress`, `riskLevel`, `riskAssessment`, `qualityTargets`, `moduleReferences`, `metadata`.

### Intelligence layer
- **`projectIntelligenceProfiles`** (`shared/schema.ts:15641`) — continuity object. Dual-scoped (`projectId` + `organizationId`). Stores regulatory strategy, target indication/population, endpoints, constraints, timeline, plus AI-learned `learnedInsights`, `keyDecisions`, `openQuestions`, `riskFactors`. Ingestion stats (`totalDocumentsIngested`, `totalTokensProcessed`, `lastDocumentIngestedAt`) and project-persona custom instructions.
- **`projectMemoryEntries`** (`shared/schema.ts:15704`) — knowledge atoms. Links to profile + project + org. Categories (strategy, clinical, regulatory, design, risk, decision, endpoint, manufacturing) with `confidenceScore`, `importanceLevel`, `isVerifiedByUser`, and a **1536-dim pgvector `embedding`** for semantic search.
- **`projectIngestedDocuments`** (`shared/schema.ts:15751`) — ingestion audit. `fileName`, `fileType`, `extractedText`, `tokenCount`, `pageCount`, `processingStatus`, `memoryEntriesGenerated`, uploader + timestamps.

### Regulatory charter stack (`shared/schema/project-charter.ts`)
- **`projectCharters` (line 56)** — submission type, region, FDA division/branch, product info, pathway-specific JSON configs (`indConfig`, `ndaConfig`, `blaConfig`, `k510Config`, `pmaConfig`, `deNovoConfig`), `regulatoryStrategy`, `criticalSuccessFactors`, `riskMitigationPlan`, `customInstructions`. Approval workflow (`approvalStatus`: draft/pending_review/approved/locked) + 21 CFR Part 11 fields (`contentHash` SHA-256, `version`, `approvedBy`, `approvedAt`, signature fields).
- **`charterSections` (line 158)** — hierarchical blocks; nested via `parentSectionId`. Version chain via `version`, `contentHash`, `previousVersionHash`. Status machine: empty/draft/review/approved/locked with `statusTransitionLog`.
- **`timelinePhases` (line 220)** — cross-functional schedule (CMC, nonclinical, clinical, regulatory, medical writing, biostat, QA). `predecessors`, `blockedBy` (PhaseBlocker[]), `deliverables` (PhaseDeliverable[]), `gateRequirements`, `ownerRole`.
- **`projectCommitments` (line 293)** — 20+ categories (regulatory_submission, agency_engagement, clinical_hold_response, fda_deficiency_response, ectd_assembly, safety_report, pediatric_commitment, rems_commitment, post_market_commitment, …). 21 CFR Part 11 signatures, fulfillment proofs (`fulfillmentProof`, `fulfillmentArtifactId`, `fulfillmentArtifactHash`), approval chain, dependencies (`blockedByCommitments`, `isCriticalPath`), waivers + extensions.
- **`regulatoryMeetings` (line 609)** — pre_ind, end_of_phase_*, pre_nda, pre_bla, pre_pma, type_a/b/c, advisory_committee, correspondence. Captures `meetingMinutes`, `keyDecisions`, `actionItems`, `fdaFeedback`, `majorConcerns`; links `briefingDocumentId`, `minutesDocumentId`.
- **`charterAuditEvents` (line 683)** — immutable 21 CFR Part 11 event ledger. Full-snapshot `previousValues` / `newValues`, `contentHashBefore` / `contentHashAfter`, `ipAddress`, `reason`, high-precision timestamps.

### Access control
- **`projectVisibilitySettings`** (`shared/schema.ts:5093`) — `visibility` (private | org_public), unique per project.
- **`projectMembers`** (`shared/schema.ts:5132`) — explicit membership, `role` (owner/edit/use), `status` (active/revoked), invitation tracking.

### Services & routes
- **Routes:** `projects-management.ts`, `project-hierarchy.ts`, `workspace-projects.ts`, `project-modules.ts`, `project-sections.ts`, `project-rules.ts`, `device-projects.ts`, `510k-project.routes.ts`.
- **Services:** `ProjectRollupService` (hierarchy rollup), `project-intelligence-service.ts` (continuity), `client-intelligence-memory.ts` (ingest + extract), `lumen-context-builder.ts` (AnA context assembly), full `server/services/intelligence/` RIM stack.

---

## B. Context Isolation Boundaries — What IS Enforced

1. **Tenant (org) isolation — enforced.** `server/utils/tenantContext.ts:7-44` resolves `organizationId` from JWT, never from headers. Header/query overrides are explicitly logged and ignored (line 18-23). `projects-management.ts:65-74` confirms dual-filter pattern on org + workspace.
2. **Sub-tenant (clientWorkspace) — enforced where used.** `project-hierarchy.ts:62-68` filters programs on both `organizationId` and `clientWorkspaceId`. Not universal — some routes pass `null` silently.
3. **Project intelligence — enforced.** `project-intelligence-service.ts:93-125` dual-keys every profile read on `projectId` + `organizationId`. Memory-count query at line 148-149 preserves the pair.
4. **Thread-to-project — enforced.** `chat/threads.ts:36-50` filters `ai_threads` on `project_id` + `organization_id`; message listing (line 79-82) re-verifies org ownership before returning content.
5. **RIM signals — enforced.** `intelligence/rim.ts:86-96` pins `organizationId` + `projectId` into an immutable `RIMContext`. Signal capture (`signal-capture.ts:57-58`) carries provenance; persistence failures surface (line 104-108) instead of silently succeeding.
6. **Charter/commitment — enforced by schema reference** (no route surface yet). `projectCharters` and `projectCommitments` both carry `organizationId` + `projectId` columns and are indexed; `charterAuditEvents` chains org via charter FK.
7. **Task/module rollup — mostly enforced.** `project-rollup-service.ts:87-109` scopes root and descendant queries on `organization_id`. **Gap** in batch task query — see section C.

---

## C. Context Isolation Gaps — Where Isolation Is Weak or Bypassable

1. **🟠 Working memory query unscoped.** `working-memory.ts getLatestWorkingMemoryByThread()` selects from `conversation_working_memory` on `thread_id` only — no `organization_id` filter. If thread IDs ever collide across orgs (sequential IDs, test harness reuse, or future migrations), memory leaks cross-tenant. Add `AND organization_id = $2`.
2. **🟠 Project rollup batch task count unscoped.** `project-rollup-service.ts:175-186` queries `unified_tasks WHERE project_id = ANY($1)` without `organization_id`. Safe only because the caller pre-filters `projectIds`. One upstream mistake → cross-org aggregation. Add explicit `AND organization_id = $2`.
3. **🔴 Vector similarity search scoping unverified.** `projectMemoryEntries.embedding` is stored, but no code in the audited paths shows the pgvector `<->` search query. If any RAG pipeline runs `ORDER BY embedding <-> $1` without `WHERE organizationId = $2 AND projectId = $3`, semantic retrieval leaks across projects/orgs and poisons AI context. **Must be audited explicitly.**
4. **🟡 Account-canon scoping unclear.** `accountCanonItems` (`shared/schema.ts:15813`) is org-scoped via `clientIntelligenceProfiles`. `lumen-context-builder.ts:34` imports `resolveAccountContext`, but it's not confirmed the call sites always pass the current-request `organizationId`. A missing org filter would mix account knowledge across tenants.
5. **🟡 Commitment queries by `charterId` only.** `projectCommitments.charterId` FK implicitly scopes to a project (charters are 1:1 with projects), but any query that joins on `charterId` without also constraining `projectId` could drift if the 1:1 assumption is ever broken.
6. **🟡 RIM interceptors fire-and-forget.** `rim-interceptors.ts:44-86` swallow persistence failures with a `console.warn`. Not a leak, but signal loss silently degrades project intelligence fidelity.
7. **⚠ Project-module assignment not verified.** `project-modules.ts` POST handler was not confirmed to assert `module.organizationId === project.organizationId`. If absent, a user could attach a module owned by another org.

---

## D. High-Fidelity Surface Area — What Data Is Actually Attached to a Project

**Regulatory / submission context:** submission type, region, FDA division/branch, product name + type, indication, target population, therapeutic area, development stage, device classification, product codes, predicates, pathway-specific configs (IND/NDA/BLA/510k/PMA/De Novo), critical success factors, risk mitigation plan, team roles (7 defined).

**Charter & timeline:** submission strategy, target dates, 4-level project hierarchy, phases with cross-functional dependencies/deliverables/gates/ownerRole, slack days, critical path, regulatory meetings (pre-IND, EOP2, pre-NDA, advisory committee, type A/B/C correspondence).

**Commitments & obligations:** 20+ regulatory commitment categories, fulfillment proofs with artifact hashing, approval chains, waivers/extensions, 21 CFR Part 11 signatures, dependencies, critical-path tracking.

**Project intelligence:** learned insights (confidence-scored), key decisions with rationale + source, open questions + priority, risk factors with likelihood/impact/mitigation, ingestion stats, project persona + custom instructions.

**Memory atoms:** per-project knowledge atoms across 8 categories, 1536-dim embeddings, confidence + importance + user-verified flags, source-document traceability.

**Hierarchy & rollup:** materialized paths, weighted progress, budget rollup, worst-case risk, task counts, milestone completion, up to 4 levels of nesting.

**Access & collaboration:** explicit project members with role-based access, visibility settings, invitation tracking.

**Audit trail:** charter modifications with full snapshots and content hashing, section version history with transition logs, commitment fulfillment signatures, immutable event ledger (21 CFR Part 11).

**Intelligence signals (RIM):** judgment reports (6-model framework), pattern matches (20+ patterns), compliance-scan results, evidence chains with confidence, recurring pattern trends.

**Documents:** ingested documents with extraction metadata, processing status/errors, memory-entry generation counts.

---

## E. Not Fully Built — Concrete Gaps & Stubs

1. **🔴 Charter/commitment/meeting/phase API routes — MISSING.** Schema is complete; no `charters.routes.ts`, `commitments.routes.ts`, `timeline.routes.ts`, or `regulatory-meetings.routes.ts` in `server/routes/`. Without routes, the entire high-fidelity regulatory workspace is trapped in the schema.
2. **🟡 Commitment fulfillment workflow — stub.** Columns (`fulfillmentProof`, `fulfillmentArtifactId`, `fulfillmentArtifactHash`, `fulfillmentApprovedBy`, `fulfillmentApprovedAt`) exist; no `POST /api/commitments/:id/fulfill` + approval chain + artifact verification.
3. **🟡 21 CFR Part 11 e-signature enforcement — partial.** `signedBy`, `signedAt`, `signatureIntent`, `passwordChallengeUsed` exist on commitments and sections; no password-challenge-on-sign implementation confirmed.
4. **🟡 Phase gate enforcement — absent.** `timelinePhases.gateRequirements` captured; no service evaluates gates before allowing phase entry.
5. **🟡 Cross-functional blocking enforcement — absent.** `timelinePhases.blockedBy` (`PhaseBlocker[]`) captured; no service marks phases blocked when upstream deliverables are incomplete.
6. **🟡 RIM interceptor wiring — partial.** Chat interceptor wired (`chat/send-message.ts:29` → `interceptChatResponse`). Compliance-scan and artifact-change interceptors were not confirmed to be called from their respective routes.
7. **🟡 Project intelligence enrichment trigger — missing.** `enrichProjectIntelligence()` exists (`project-intelligence-service.ts:181`); no auto-wiring after document ingestion or memory-entry creation.
8. **🟡 Charter approval workflow — absent.** Fields exist (`approvalStatus`, `reviewRequestedBy`, `approvedBy`, `approvalComment`); no request-review → approve → lock transition, no audit wiring at transitions.
9. **🟡 Regulatory-meeting action-item tracking — absent.** `actionItems` with `dueDate` + `status` stored; no overdue-monitoring or alerting service.
10. **🟡 RIM pattern registry persistence — unclear.** `persistPatterns()` exists in `rim-integration.ts`; it is not confirmed to be called from the orchestrator after each run.
11. **🔴 Vector similarity search — unverified.** Embeddings stored; search queries not confirmed to include `WHERE organizationId = ? AND projectId = ?`. Treat as unverified until a grep for `<->` or equivalent search path proves scoping.
12. **🟡 Account-canon usage in context builder — unverified.** Trace `resolveAccountContext` in `lumen-context-builder.ts` and confirm the current-request `organizationId` is always passed.
13. **🟡 Project-module org check — unverified.** `project-modules.ts` POST handler should assert `module.organizationId === project.organizationId`; not confirmed.
14. **🟡 Orphaned CTD onboarding tables.** `ctdOnboardingProjects`, `ctdOnboardingDocuments`, `ctdComplianceGaps` exist without routes. Either route them or archive.

---

## F. Risk Summary — Top 5

1. **🔴 Charter/commitment API exposure is zero.** The most ambitious part of the project data model — regulatory charter, sections, phases, commitments, meetings, audit events — has no HTTP surface. Projects cannot be configured through an approved charter flow. **Highest-leverage unblock.**
2. **🟠 Cross-tenant leaks via under-scoped queries.** Working-memory thread lookup and rollup batch task query lack explicit `organization_id` filters. Each relies on a caller-side invariant. These are silent failure modes — fix defensively.
3. **🔴 Vector search scoping unverified.** A single unscoped pgvector query in a RAG path would inject other projects' memory into AnA's context. Must be audited and proven before trusting semantic retrieval.
4. **🟠 RIM persistence failures are silent.** Non-blocking interceptors drop signals on `console.warn`. Projects can appear less informed than they are, with no alert. Mark runs `degraded`, add retry, expose a signal-loss metric.
5. **🟡 Phase-gate and cross-functional blocking logic is schema-only.** The structure to enforce regulatory discipline is there; the enforcement is not. Without this, phases and commitments are narrative fields rather than governed state.

---

## Recommended Prioritization (Non-UI)

1. Audit and harden scoping on `conversation_working_memory`, pgvector searches, and `project-rollup-service` batch queries. Add assertions + tests. *(Security-critical; low LOC.)*
2. Ship charter/commitment/phase/meeting CRUD routes wired to `charterAuditEvents` on every state transition. *(Unblocks the designed workspace.)*
3. Wire compliance-scan and artifact-change RIM interceptors; mark RIM runs `degraded` when persistence fails. *(Closes silent data loss.)*
4. Implement phase-gate and cross-functional-blocker enforcement services. *(Converts captured data into governed state.)*
5. Confirm `enrichProjectIntelligence()` auto-triggers after ingestion; confirm `resolveAccountContext()` always receives the request org. *(Small fixes, large fidelity gain.)*
