# RLS_ENFORCE=on Fail-Closed Audit — Route-Layer Census

**Status:** Findings (decision-ready)
**Date:** 2026-08-07
**Scope:** every route mount in the seven `register-*-routes.ts` bootstrap files
**Method:** a multi-agent census read all `app.use(...)` / `mountAll(...)` mount
entries across the bootstrap registrars, classified each by whether it opens a
tenant scope on the request path (AsyncLocalStorage via `runWithTenantScope`
and/or `req.dbClient`), and traced each router's data access down to the pool /
drizzle / service / store layer to decide the verdict it would produce under
`RLS_ENFORCE=on`. Findings were then reconciled across the eight per-group
classifications into the single census below; the disagreement/data-quality
flags in §6 record where the sub-agents diverged and how the discrepancy was
resolved.

**Why this matters.** Under `RLS_ENFORCE=on` (production-mandatory),
`server/db/poolInstrumentation.ts` throws `[tenant-rls] FAIL-CLOSED` on any
non-infrastructure query that runs with no active `getTenantScope()`. A mount
that authenticates but never opens a tenant scope therefore returns a 500 on
its first DB-touching request. This audit answers one question precisely: **with
the flag on, how many mounted route surfaces fail closed, and why?**

---

## 1. COUNTS

| Verdict | Count | % |
|---|---|---|
| **FAILS_CLOSED** | **329** | **79.7%** |
| SAFE_NO_TENANT_DB | 76 | 18.4% |
| SCOPED_OK | 6 | 1.5% |
| NEEDS_VERIFY | 2 | 0.5% |
| **Total classified mount entries** | **413** | |

Unit = classified mount **entry**. Gateway/composite routers were broken out
into multiple entries, so the entry count exceeds raw `app.use()` lines (see §6
data-quality flags).

By register file:

| Register file(s) | FC | SAFE | SCOPED | NV | Total |
|---|---|---|---|---|---|
| register-inline-routes.ts (grp 1+2) | 136 | 11 | 0 | 0 | 147 |
| register-document-routes.ts + register-regulatory-routes.ts (grp 3)¹ | 78 | 17 | 1 | 0 | 96 |
| register-core-routes.ts (grp 4) | 22 | 6 | 0 | 0 | 28 |
| register-clinical-intel-routes.ts + register-ind-lifecycle-routes.ts (grp 5) | 24 | 8 | 0 | 0 | 32 |
| register-governance-routes.ts + register-advanced-platform-routes.ts (grp 6) | 32 | 23 | 0 | 0 | 55 |
| register-platform-routes.ts + register-ai-routes.ts (grp 7) | 13 | 10 | 5 | 1 | 29 |
| register-project/concept2cure/admin/tenant-routes.ts (grp 8) | 24 | 1 | 0 | 1 | 26 |
| **TOTAL** | **329** | **76** | **6** | **2** | **413** |

¹ grp 3 did not split the two files; per-file attribution unavailable. **8** of
the 329 FC are already fixed on open PRs (#1276, #1277) → **321 remaining**. Of
those 321, a few are not live production 500s: **2 FENCED** (not mounted in
prod), **~5 GATED** (flag-off = not FC), **1 BROKEN** (graphrag 500s
regardless), **~3 public-library functional** (csr_reports, no tenant leak). Net
live tenant-route 500s ≈ **~310**.

**SCOPED_OK (6, for reference):** `/api/v1` public-api (grp3,
`runWithTenantScope`) · `/api/admin` (grp7, securityHealth
`runWithSystemTenantScope`) · `/api/auth`, `/api/v1/auth` (preAuthScope) ·
`/api/auth/sso` (own `runWithTenantScope`) · `/api` global auth gate
(`runWithPreAuthScope`).

**Why-code legend** (used throughout §2): **GP** = unscoped global pool /
`getPool()` / `query()` · **GD** = unscoped global drizzle `db` · **SVC** =
delegates to a service / view-assembler / store that hits the global pool/db
unscoped · **RQ** = `requestDb(req)` / `getDb(req)` with no
`requireTenantContext` → `MissingRequestDbContextError` · **STORE** =
`createFeatureStore` / storage layer on global db · **GOV** = `governed()`
wrapper calls `pool.connect()` *before* `setTenantContextTx` (session var, not
ALS) → connect rejects first · **MIX** = pool+drizzle mix · **BROKEN** = pool
never wired. Flags: **✓#1276 / ✓#1277** = already fixed on an open PR ·
**FENCED** = not mounted in production · **GATED:FLAG** = FC only when the named
feature flag is on · **SYSTEM** = cross-tenant / pre-auth — must NOT get a
per-user scope.

---

## 2. FAILS_CLOSED INVENTORY (grouped by register file)

### register-inline-routes.ts — 136 FC

**Grp 1 (L121–L829), 63:** the whole clinical-ops / protocol / research-admin suite.
`/api/device-projects`—device-projects.ts—GD · `/api/ana-cortex`—ana-cortex.ts—GD · `/api/ana-1-0-ri-cortex`—ana-cortex.ts—GD · `/api/stability`—src/routes/stability.router.ts—GP · `/api`(csr-intelligence)—csr-intelligence-routes.ts—GP *(csr_reports public-lib: functional 500, not leak)* · `/api/csr-real-data`—csr-analytics.ts—GP *(public-lib)* · `/api`(audit-trail)—audit-trail-routes.ts—GP · `/api/evidence`—evidence-ask.ts—GP · `/api/esignature`—esignature.ts—GP · `/api/dossier-readiness`—dossier-readiness.ts—GP · `/api/authoring`—authoring.router.ts—GP · `/api/authoring-actions`—authoring-actions.ts—GD · `/api/data-origins`—data-origins.routes.ts—SVC · `/api/c2c/actions`—c2c/actions.ts—GP · `/api/c2c/governance`—c2c/governance.ts—GP · `/api/c2c/commitments`—c2c/commitments.ts—GP · `/api/study-design`—study-design.ts—GP · `/api/financial-disclosures`—financial-disclosures.ts—GOV · `/api/ha-interactions`—ha-interactions.ts—GP · `/api/iacuc`—iacuc.ts—GP · `/api/irb`—irb.ts—GP · `/api/ibc`—ibc.ts—GP · `/api/nonclinical`—nonclinical.ts—GP · `/api/change-assessment`—change-assessment.routes.ts—GP · `/api/enablement`—enablement.ts—GP · `/api/translation`—translation.routes.ts—SVC/GD · `/api/etmf`—etmf.routes.ts+etmf.ts—MIX · `/api/regulatory-assessments`—regulatory-assessments.routes.ts—SVC/GD · `/api/grants`—grants.ts—GOV · `/api/coverage-analysis`—coverage-analysis.ts—GP · `/api/committees`—committees.ts—GP · `/api/grant-finder`—grant-finder.ts—GP · `/api/citi-training`—citi-training.ts—GOV/SVC · `/api/protocol-portfolio`—protocol-portfolio.ts—SVC · `/api/protocol-development`—protocol-development.ts—GOV · `/api/protocol-risks`—protocol-risks.ts—GOV · `/api/protocol-amendments`—protocol-amendments.ts—GOV · `/api/protocol-deviations`—protocol-deviations.ts—GOV · `/api/protocol-reviews`—protocol-reviews.ts—GOV · `/api/protocol-consent`—protocol-consent.ts—GOV · `/api/dmsp`—dmsp.ts—GOV · `/api/other-support`—other-support.ts—GOV · `/api/biosketch`—biosketch.ts—GOV · `/api/invention-disclosures`—invention-disclosure.ts—GOV · `/api/export-control`—export-control.ts—GOV · `/api/research-agreements`—research-agreements.ts—GOV · `/api/protocol-templates`—protocol-templates.ts—GOV · `/api/protocol-milestones`—protocol-milestones.ts—GOV · `/api/protocol-export`—protocol-export.ts—SVC · `/api/protocol-soa`—protocol-soa.ts—GOV · `/api/protocol-budget`—protocol-budget.ts—GOV · `/api/rim`—rim.ts—GOV · `/api/inspections`—inspections.ts—GOV · `/api/controlled-substances`—controlled-substances.ts—GOV · `/api/lifecycle`—lifecycle.ts—GOV · `/api/research-compliance`—research-compliance.ts—GOV · `/api/effort-certification`—effort-certification.ts—GP · `/api/research-security`—research-security.ts—GP · `/api/c2c/study-twin`—c2c/study-twin.ts—GP · `/api/c2c/documents`—c2c/documents.ts—GP · `/api/c2c/projects`—c2c/projects.ts—GP · `/api/evidence-objects`—evidence-objects.routes.ts—GP · `/api/nda-cockpit`—nda-cockpit.routes.ts—GP

**Grp 2 (L840+), 73:** view-assembler suite, MDX device suite, biopharma, workflow/orchestration.
`/api/evidence-asks`—evidence-asks.routes.ts—SVC · `/api/doc-journey`—doc-journey.routes.ts—SVC · `/api/agency-meetings`—agency-meetings.routes.ts—GP · `/api/design-controls`—design-controls.routes.ts—GP · `/api/cro-portfolio`—cro-portfolio.routes.ts—SVC · `/api/reg-change`—reg-change.routes.ts—SVC · `/api/decision-lineage`—decision-lineage.routes.ts—SVC · `/api/dossier-map`—dossier-map.routes.ts—SVC · `/api/ind-checklist`—ind-checklist.routes.ts—SVC · `/api/program-journey`—program-journey.routes.ts—SVC · `/api/market-access`—market-access.routes.ts—SVC · `/api/shadow-review`—shadow-review.routes.ts—SVC · `/api/labeling-pi`—labeling-pi.routes.ts—SVC · `/api/protocol-dev`—protocol-dev.routes.ts—SVC · `/api/research-admin`—research-admin.routes.ts—SVC · `/api/investigator-brochure`—investigator-brochure.routes.ts—SVC · `/api/nonclinical-summary`—nonclinical-summary.routes.ts—SVC · `/api/maa-module1`—maa-module1.routes.ts—GP · `/api/labeling-smpc`—labeling-smpc.routes.ts—GP · `/api/cmc-changes`—cmc-changes.routes.ts—SVC · `/api/c2c/templates`—c2c/templates.ts—SVC · `/api/biopharma/bla`—biopharma/bla-workbench.ts—GP · `/api/biopharma/ctd`—biopharma/ctd.ts—GP · `/api/biopharma/pediatric|orphan|supplements|prea-milestones|orphan-rpd|orphan-advocacy` (6)—biopharma-specialty.routes.ts—GP · `/api/biopharma`—biopharma/programs.ts—GP · `/api/ana/platform`—ana-platform-control.ts—GD/SVC · `/api/ai-actions`—ai-actions.ts—GD/SVC · `/api/orchestration`—orchestration.ts—GD · `/api/orchestration/checkpoints`—orchestration-checkpoints.ts—GP · `/api/regulatory-submissions`—regulatorySubmissions.ts—GD **GATED:UNIFIED_REGULATORY_SUBMISSIONS** · `/api/submission-ops`—submission-ops.ts—MIX · `/api/regulatory-programs`—regulatory-programs.ts—MIX · `/api/saved-precedent-queries`—saved-precedent-queries.ts—GD · **`/api/mdx` × 28 routers**: mdx-ana-drafts.ts **✓#1277**, mdx-vault.ts **✓#1277**, mdx-engineering, mdx-udi, mdx-risk-management, mdx-rbm, mdx-rbm-data, mdx-software, mdx-ivd-performance, mdx-ivdr, mdx-clia, mdx-cdx, mdx-ldt, mdx-submission-gateway, mdx-notifications, mdx-audit, mdx-admin, mdx-templates, mdx-postmarket, mdx-clinical-studies, mdx-ana-memory, mdx-qms, mdx-labeling, mdx-search, mdx-analytics, mdx-imports — all GP; **mdx-industry-context, mdx-client-review — RQ** · `/api/regulatory-correspondence`—regulatory-correspondence.ts—MIX · `/api/510k-workflow`—510k-workflow-routes.ts—MIX · `/api/pma-workflow`—pma-workflow-routes.ts—GP · `/api/fda-forms`—fda-forms.routes.ts—GD · `/api/field-sync`—fieldSync.routes.ts—GD · `/api/content-assembly`—contentAssembly.routes.ts—GD · `/api`(misc-inline)—misc-inline-routes.ts—MIX *(authMiddleware on 1 sub-route only; vault/templates/drafting unscoped)*

### register-document-routes.ts + register-regulatory-routes.ts — 78 FC
`/api/document-authoring`—documentAuthoring.routes.ts—GD · `/api/document-authoring/workspace`—document-authoring-workspace.routes.ts—GD · `/api/coauthor`—coauthor.ts—GD · `/api/ectd-documents`—ectd-documents.ts—GD · `/api/ectd-compile`—ectd-compile.ts—GP · `/api/ectd/export`—ectd-export.ts—SVC/MIX · `/api/csr/jobs`—csr-jobs.ts—GD · `/api/charters`—charters.ts—RQ+GP · `/api/ectd-submissions`—ectd-submission-agent.routes.ts—SVC/GP · `/api/ectd`(preflight)—ectd-export.ts—MIX *(thin: preflight leaf may be pure-validate)* · `/api/submission-orchestrator`—submission-orchestrator.ts—GP · `/api/submissions`—submission-sign-release.ts—SVC/GD · `/api/haq-manager`—haq-manager.ts—STORE · `/api/ind-pdf`—ind-pdf.ts—GP · `/api/ind-sections`—ind-sections.ts—GP · `/api/project-sections`—project-sections.ts—GP · `/api/device-data-center`—document-data-center.ts—SVC/GD · `/api/evidence`—evidence.ts—GD · `/api/evidence-search`—evidence-search.ts—GD *(PG fallback branch)* · `/api/content-plan`—content-plan.js—GP · `/api/smart-blocks`—smart-blocks.js—GP · `/api/evidence-management`—evidence-management.routes.ts—GD · `/api/evidence-fabric`—evidence-fabric.ts—GD · `/api/docx-factory`—docx-factory.ts—GD · `/api/knowledge-base`—knowledge-base.ts—GD · `/api/predicate-intelligence`—predicate-intelligence.ts—GD · `/api/regulatory-graph`—regulatory-graph.ts—GD · `/api/change-propagation`—change-propagation.ts—RQ+GP · `/api/standards`—standards.ts—GD · `/api/pccp`—pccp.ts—GD · `/api/gspr`—gspr-postmarket.ts—SVC/GD · `/api/post-market`—post-market.ts—SVC/GD · `/api/evidence-sufficiency`—evidence-sufficiency.ts—GD · `/api/q-sub`—q-sub.ts—GP · `/api/capa-mdr`—capa-mdr.ts—SVC/GD · `/api/design-risk`—design-risk.ts—SVC/GP · `/api/qms`—qms.ts—SVC/GP · `/api/ivd-lifecycle`—ivd-lifecycle.ts—SVC/GP · `/api/ivd-assessments`—ivd-assessments.ts—SVC/GP · `/api/tenant-export`—tenant-export.ts—GP **SYSTEM (cross-tenant export)** · `/api/ana-tool-policy`—ana-tool-policy.ts—GP · `/api/ana`—ana-mdx-context.ts—GP · `/api/510k/projects`—k510-document-preview.ts—GD · `/api/programs`—se-matrix.ts+defense-packet.ts—GD · `/api/demo`—seed-demo.ts—GD **GATED:DEMO_ROUTES_ENABLED** · `/api/cerv2-sections`—cerv2-sections.ts—GD **✓#1276** · `/api/cerv2-versions`—cerv2-versions.ts—GD · `/api/biostat`—biostatPlatform.ts—GD · `/api/ana-biostats/governed-documents`—ana-biostats-governed-documents.ts—GD · `/api/corpus`—corpus-routes.ts—GD · `/api/api-keys`—api-keys.ts—SVC/GP · `/api/ctd`—ctd-onboarding.ts—SVC/GP · `/api/cortex`—cortex-unified.ts—GP · `/api/cortex/management`—cortexManagementRoutes.ts—GP · `/api`(folder-management)—folder-management.js—GP · `/api/510k/estar`—510k-estar-routes.ts—SVC/GD · `/api/cerv2/ai`—cerv2-ai-routes.ts—SVC/GP · (root) Doc Orchestration—documentOrchestrationRoutes.ts—GD · (root) ESG Submission—esgSubmissionRoutes.ts—GD · `/api/medical-devices`—medical-device-routes.js—SVC/GD · `/api/ivdr`—ivdr-routes.ts+ivdr-binder-routes.ts—GP *(requireIVDRAccess gate itself queries unscoped)* · `/api/manufacturing`—manufacturing-routes.ts—GP · `/api/csr-workflow`—csr-workflow-routes.ts—GD/SVC · `/api/review`—review-board-routes.ts—RQ **✓#1276** · `/api/regulatory-workspace`—regulatory-workspace-routes.ts—GP · `/api/audit-trail`—audit-trail-ledger.routes.ts—GP · `/api/task-management`—taskBoard.routes.ts—RQ **✓#1276** · `/api/artifacts-center`—artifacts-center-routes.ts—GP · `/api/project-home`—project-home-routes.ts—GP · `/api/ivd-completeness`—ivd-completeness-routes.ts—RQ **✓#1276** · `/api/batch-draft`—batch-draft-routes.ts—RQ **✓#1276** · `/api/clinical-operations`—clinical-operations-routes.ts—GP · `/api/cer`—cer-routes.ts—GP · `/api/preclinical`—preclinical.ts—MIX **GATED:PRECLINICAL_INGEST_ENABLED** · `/api/grdhe`—grdheRoutes.ts—SVC/GD · `/api/cerv2`—cerv2-document-routes.ts—GD · `/api/pdev`—pdev/pdev-routes.ts—GD · `/api/regulatory/documents`—document-lifecycle.ts—GD *(getDb falls back to global in prod)*

### register-core-routes.ts — 22 FC
`/api/templates`—api/templates/routes.ts—GD · `/api/test-assembly`—test-assembly.ts—GP **FENCED** · `/api`(phase3)—api/ai/phase3-routes.js—GD · `/api/enterprise`—api/enterprise/routes.js—MIX *(rbac requirePermission select; /status endpoint OK)* · `/api/enterprise/rbac`—api/enterprise/rbac-routes.js—MIX · `/api/cmc`(core)—api/cmc/routes.ts—MIX · `/api/cmc`(projects)—api/cmc/projectRoutes.ts—GD · `/api/cmc/blueprint`—blueprintRoutes.ts—GP · `/api/cmc/specifications`—specificationRoutes.ts—GP · `/api/cmc/batch-records`—batchRecordRoutes.ts—GP · `/api/cmc/workflows`—workflowRoutes.ts—MIX · `/api/cmc/module3-os`(OS)—module3OperatingSystemRoutes.ts—GP · `/api/cmc/module3-os`(BuildState)—module3BuildStateRoutes.ts—GP · `/api/cmc/module3-os`(Convergence)—module3ConvergenceRoutes.ts—GP · `/api/cmc/module3`(AutoDraft)—module3AutoDraftRoutes.ts—SVC · `/api/cmc/documents`—documentRoutes.ts—GP · `/api/cmc/module3-board`—cmc-module3-board.routes.ts—GP · `/api/intelligent-docs`—intelligentDocs.ts—GD · `/api/control-plane`—src/routes/control-plane.router.ts—SVC/GP *(static endpoints OK)* · `/api/pm-settings`—src/routes/pm-settings.router.ts—GD *(also no mount auth)* · `/api/tasks`—taskManagement.routes.ts—STORE/GD · `/api/regulatory/tasks`—unifiedTasks.routes.ts—MIX

### register-clinical-intel-routes.ts + register-ind-lifecycle-routes.ts — 24 FC
`/api/ind`—ind.ts—GP · `/api/ind-wizard`—ind-unified.ts—GP/MIX · `/api/ind-submissions`—ind-submissions.routes.ts—STORE · `/api/ind-database`—ind-database.routes.ts—GD · `/api/documents`—documents-unified.ts→document-routes.ts—RQ **(NO auth middleware at all)** · `/api`(RTM export)—rtm-export.ts—GD · `/api/intelligence`—intelligence.ts—SVC/GD · `/api/protocol`—protocol_routes.ts—GP · `/api/qc`—qc.routes.ts—STORE · `/api/module-integration`—moduleIntegrationRoutes.ts—GD · `/api/regulatory`—regulatoryRoutes.ts—GD · `/api/csr-builder`+`/api/csr`—csr-builder-routes.ts—GD · `/api/source-tracer`—source-tracer-routes.ts—SVC/GP · `/api/insights-canvas`—insights-canvas-routes.ts—SVC/GD · `/api/c2c/project-vault`—c2c/project-vault.ts—GP · `/api/mdx-rbm`—mdx-rbm-board.ts—RQ · `/api/governed-intelligence-inconsistency`—governed-intelligence-inconsistency-routes.ts—MIX · `/api/deep-research/board`—deep-research-board.routes.ts—SVC/GP · `/api/precedent-engine-board`—precedent-engine-board.ts—SVC/GP · `/api/conversation-thread`—conversation-thread-routes.ts—RQ · `/api/clinical-regulatory-evidence`—clinical-regulatory-evidence-routes.ts—SVC/GP **GATED:ENABLE_CLINICAL_REGULATORY_GRAPH** · `/api/ind-forms`—ind-forms.routes.ts—GD · `/api/ind-master-data`—ind-master-data.routes.ts—SVC/GD · `/api/ind-lifecycle`—ind-lifecycle.routes.ts—SVC/MIX

### register-governance-routes.ts + register-advanced-platform-routes.ts — 32 FC
`/api/operating-system`—operating-system.ts—SVC/GD · `/api/governed-intelligence`—assumption-decision-contradiction.ts—SVC/GD · `/api/client-intelligence`—client-intelligence.ts—GD · `/api/account-intelligence`—account-intelligence.ts—SVC/GD · `/api/precedent-engine`—precedent-engine.ts—SVC/GD · `/api/submission-center`—submissionCenter.routes.ts—GP · `/api/submissions`—submissions.ts—MIX *(generateSection; pathway endpoints pure)* · `/api/innovation`—innovation-routes.ts—GP · `/api/regulatory-intelligence`—regulatory-intelligence.ts—SVC/GD · `/api/external-intelligence`—external-intelligence-routes.ts—SVC/GP · `/api/human-factors`—human-factors.ts—GP · `/api/integration-test`—integration-test.ts—GP **FENCED** · `/api/realtime-collab`—realtime-collab.ts—SVC/GD · `/api/graphrag`—graphrag.ts—**BROKEN** *(req.app.pool undefined; 500s regardless)* · `/api/compliance`—global-compliance.ts—GP · `/api/regulatory-digital-twin`—regulatory-digital-twin.ts—GD · `/api/submission-twin`—submission-twin.ts—SVC/GD · `/api/cro`—cro.ts—RQ · `/api/part11`—part11-compliance.ts—GP · `/api/mission-control`—mission-control.ts—STORE **GATED:ENABLE_MISSION_CONTROL_STATIC_DATA** · `/api/snowglobe`—snowglobe.ts—RQ · `/api/task-management`—taskManagement.routes.ts—GD *(distinct router from grp3 taskBoard)* · `/api/unified-tasks`—unifiedTasks.routes.ts—SVC/GD · `/api/approval-workflows`—approval-workflow.ts—GD · `/api/client-branding`—client-branding.ts—STORE · `/api/inline-annotations`—inline-annotations.ts—STORE · `/api/decision-lineage`—decision-lineage.ts—SVC/GD · `/api/data-lineage`—data-lineage.ts—SVC/GD *(GET /perspectives pure)* · `/api`(workspaceSummary)—workspace-summary.ts—GP · `/api`(chatActions)—chat-actions.ts—GP · `POST /api/workspace/projects`—register-advanced-platform-routes.ts inline—GP · `GET /api/workspace/projects`—register-advanced-platform-routes.ts inline—GP

### register-platform-routes.ts + register-ai-routes.ts — 13 FC
`/api/health/full`—lib/health-check.ts—GP **(distinct bug: non-exact probe `SELECT 1 as check, NOW() as time` → reports DB unhealthy 503; fix = exact probe or add to INFRASTRUCTURE_QUERIES)** · `/api/users`,`/api/user`—users.ts—GD *(no mount auth)* · `/api/setup`—setup.ts—GD **SYSTEM (first-run install; breaks entirely; no org yet)** · `/scim/v2`—scim.ts—GP **SYSTEM (cross-org config tables)** · `/api/admin/scim-tenants`—admin/scim-tenants.ts—GP **SYSTEM** · `/api/admin/audit`—admin/audit-siem.ts—GP **SYSTEM (cross-org via JWT WHERE)** · `/api/admin/scim-ip-allowlist`—admin/scim-ip-allowlist.ts—GP **SYSTEM** · `/api/ana`—ana-features.ts—MIX *(~40 requireOrganizationContext routes unscoped; the 1 requireTenantContext route is OK)* · `/api/ana-ri`—ana-ri.ts(+ana-ri/*)—GP · `/api/firecrawl`—firecrawl.ts—GP · `/api/external-evidence`—external-evidence.ts—GP · `/api/chat`—chat.ts(+chat/*)—GP · `/api/ai`—ai-claims-routes.ts—GP

### register-project/concept2cure/admin/tenant-routes.ts — 24 FC
`/api/projects`—projects-management.ts—GD *(bare app.use)* · `/api/project-hierarchy`—project-hierarchy.ts—GP · `/api/project-rules`—project-rules.ts—GP · `/api/sentinel`—sentinel-routes.ts—SVC/GP · `/api/project-modules`—project-modules.ts—SVC/GD · `/api/quality`—quality-management-api.ts—RQ **✓#1277** · `/api/analytics`—analytics-routes.ts—GD *(csr_reports; manual orgId filter, no scope)* · `/api/concept2cure`—concept2cure.ts—MIX · `/api/concept2cure/compute`—compute.ts—SVC/GP · `/api/concept2cure`(schedule-of-events)—project-schedule-of-events.ts—GP · `/api/admin/master`—admin/master-admin.ts—GP **SYSTEM (cross-tenant orgs/users)** · `/api/admin/business`—admin/business-center.ts—GP **SYSTEM** · `/api/admin/access`—admin/access-management.ts—GP **SYSTEM** · `/api/organizations`—organizations-routes.ts—GD · `/api/clients`—clients-routes.ts—GD · `/api/client-portal`—client-portal.ts—GP · `/api/onboarding`—onboarding-proposals.ts—RQ · `/api/tenant-users`—tenant-users.ts—GP · `/api/tenant-section-gating`—tenant-section-gating.ts—GP · `/api/tenant-config`—tenant-config.ts—RQ · `/api/tenant-stats`—tenant-stats.ts—GD · `/api/tenant-traceability`—tenant-traceability.ts—RQ · `/api/tenant-quality-validation`—tenant-quality-validation.ts—RQ · `/api/tenant-ctq-factors`—tenant-ctq-factors.ts—RQ

**Highest blast-radius (fix/verify first):** `/api/chat`, `/api/ana`,
`/api/ana-ri` (core AI) · `/api/documents` (core docs, and unauthenticated) ·
`/api/projects`, `/api/organizations`, `/api/clients`, `/api/concept2cure`
(core entities) · `/api/setup` (blocks first-run install) · the 28-router
`/api/mdx` device suite · the ~15-router `/api/cmc` suite · the ~20-router
protocol-* suite · the `/api/tenant-*` + `/api/admin/*` admin family (also the
SYSTEM carve-out class).

---

## 3. ALREADY FIXED ON OPEN PRs (do not double-count) — 8 mounts

- **PR #1276** (5): `/api/cerv2-sections` (cerv2-sections.ts), `/api/batch-draft` (batch-draft-routes.ts), `/api/ivd-completeness` (ivd-completeness-routes.ts), `/api/task-management` (**taskBoard.routes.ts**, grp3/register-regulatory), `/api/review` (review-board-routes.ts). All in register-document/regulatory group.
- **PR #1277** (3): `/api/quality` (quality-management-api.ts, grp8), `/api/mdx`→mdx-vault.ts, `/api/mdx`→mdx-ana-drafts.ts (grp2).

**→ 329 − 8 = 321 FAILS_CLOSED remaining.**

⚠️ **De-dup warning:** `/api/task-management` exists **twice** as distinct
routers — **taskBoard.routes.ts** (grp3, RQ, on #1276) and
**taskManagement.routes.ts** (grp6, GD, *not* covered). PR #1277 fixes only **2
of ~28** DB-touching `/api/mdx` routers; the other 26 (mdx-engineering, mdx-udi,
mdx-rbm, mdx-qms, mdx-clinical-studies, mdx-search, etc.) remain FC. Confirm the
PR mounts don't need `requireTenantContext` re-checked against the new central
fix (see the systemic-fix design).

---

## 4. NEEDS_VERIFY (2) + thin-evidence residuals

**NEEDS_VERIFY:**
1. **`/api/auth/enterprise`** — authEnterprise.ts (grp7). Opens no scope of its
   own, but sits under the `/api/auth` prefix and *likely* inherits the pre-auth
   ALS scope via the `preAuthScope` mount's `next()` chain → probably would NOT
   500. Cross-mount inheritance is implicit/fragile (sibling sso.ts declares its
   own scope). **Action: add a test; make the scope explicit.**
2. **`/api/tenants`** — tenants-simple.ts (grp8). MIXED. GET/PUT/DELETE use a
   **separate `postgres`-js connection** that bypasses the instrumented pool →
   those work. **POST create** calls `assertCanAdmitNewTenant()` on the shared
   instrumented `db` unscoped → **that path FC**. **Action: reviewer decision —
   the create path needs a system scope; the bypass connection is itself an RLS-
   governance gap worth a separate look.**

**Thin evidence / residual risk (classified but flagged by the sub-agents):**
- `/api/ectd`(preflightRouter) grp3 — whether the preflight leaf actually queries or pure-validates (module-level DB present).
- `/api/cerv2/export` grp3 (SAFE) — confirm export handler never reads a document from DB.
- `/api/ana-biostats` grp3 (SAFE) — only orchestrator + document-generator opened; other sub-engines not each verified.
- `/api/gcc` grp3 (SAFE) — drafting sub-router `server/api/drafting/routes.js` not opened.
- `/api/conversation-os` grp6 (SAFE) — retrievalService ingestion path if a vector store is later added.
- Mixed mounts where only *some* endpoints fail: `/api/enterprise`, `/api/control-plane` (grp4), `/api/submissions`, `/api/data-lineage` (grp6), `/api/ana` (grp7) — static/in-memory endpoints keep working; verdict reflects ≥1 DB endpoint failing.

---

## 5. RECOMMENDATION — systemic fix, not more per-router tranches

**The FAILS_CLOSED fraction is 329/413 = ~80%, and the mechanism is uniform**
(no ALS tenant scope on the request path; `authenticateToken` / `authMiddleware`
both call a bare `next()`). This is a whole-application outage class, not a set
of point defects. At the #1276/#1277 cadence (5–7 routers per PR) the remaining
~321 mounts need **~50 PRs** — not viable against a production-mandatory flag,
and it guarantees inconsistent handling of the carve-out classes. **Adopt a
central fix.**

The full implementation spec for that central fix is in
[`docs/architecture/RLS_ROUTE_LAYER_SYSTEMIC_FIX_DESIGN.md`](../architecture/RLS_ROUTE_LAYER_SYSTEMIC_FIX_DESIGN.md).
In brief, the audit's conclusions that shape it:

**Do the central fix, but at the right layer.** A change to
`authenticateToken` / `authMiddleware` alone (open `runWithTenantScope` **and**
set `req.dbClient` around `next()`) is **necessary but not sufficient**, because
a large subset of FC mounts run **no auth middleware at all** (bare `app.use` /
`mountAll` with no group middleware): essentially all of the grp8 project/tenant
family, grp5 `/api/documents`·`/api/intelligence`·`/api/protocol`·`/api/qc`·
`/api/module-integration`·`/api/regulatory`, most grp2 mdx-*/orchestration
routers, and many grp3 "none (mountAll)" mounts. Those never touch the auth
middleware and would stay broken.

**Recommended: inject a scope-opening middleware at the registrar/`mountAll`
layer** (wrap every tenant mount so it runs `requireTenantContext`-equivalent
logic that both opens the ALS scope and sets `req.dbClient`), combined with the
auth-middleware change for defense-in-depth. Make the middleware **idempotent** —
detect an already-active scope and not clobber it — so the 6 self-scoped mounts
survive. Two mechanics the fix MUST include or it is incomplete:
- **Set `req.dbClient`**, not just the ALS scope — otherwise the **~24 `RQ`
  (requestDb/getDb) routers** (quality, review, taskBoard, ivd-completeness,
  batch-draft, charters, change-propagation, mdx-industry-context,
  mdx-client-review, mdx-rbm, conversation-thread, cro, snowglobe, onboarding,
  tenant-config, tenant-traceability, tenant-quality-validation,
  tenant-ctq-factors, documents, …) stay broken.
- **Fix the shared `governed()` helper** (grp1 protocol-*/grants/rim/
  citi-training/financial-disclosures, ~20 routers): it calls `pool.connect()`
  *before* `setTenantContextTx`, so `connect()` rejects first. It must use the
  request-scoped client / run inside the ALS scope, or these fail even with a
  scope open upstream.

**Do NOT blanket per-user-scope these classes** (route them to
`runWithSystemTenantScope` or exclude):
1. **Cross-tenant admin/system consoles:** `/api/admin/master`·
   `/api/admin/business`·`/api/admin/access` (grp8), `/scim/v2`·
   `/api/admin/scim-tenants`·`/api/admin/scim-ip-allowlist`·`/api/admin/audit`
   (grp7), `/api/tenant-export` (grp3). These read across orgs; a caller-org
   scope would wrongly restrict or misattribute them.
2. **Pre-auth / no-tenant-yet:** `/api/setup` (no org exists at first-run —
   system scope), `/api/users` (no auth mount), and the auth family `/api/auth`·
   `/api/v1/auth`·`/api/auth/sso`·`/api/auth/enterprise` (already handle pre-auth
   scope — leave as-is).
3. **Public/global-library reads:** csr-intelligence-routes.ts, csr-analytics.ts,
   analytics-routes.ts (query `csr_reports`, which has no `organization_id`). A
   per-user org scope may RLS-filter these to empty — give them a system/public
   read scope. (These are functional 500s today, not tenant leaks.)
4. **Already self-scoped — do not double-wrap:** `/api/v1` (public-api),
   `/api/admin` (securityHealth), `/api/auth/sso`, and the `requireTenantContext`
   route inside `/api/ana`.

**Independent one-offs (fix regardless of the scope work):** `/api/health/full`
(use the exact-match infra probe string), `/api/graphrag` (wire the pool — it
500s from `undefined` today).

**Keep #1276/#1277 as-is** (they're correct point fixes) but **fold their
pattern into the central middleware** so they become the last of the tranche
PRs, not the template for 50 more. Verify the two duplicate-name routers
(`/api/task-management` taskManagement.routes.ts in grp6; the other `/api/tasks`·
`/api/unified-tasks` task services) are swept in by the central fix rather than
left as look-alikes.

---

## 6. DATA-QUALITY / DISAGREEMENT FLAGS

- **Grp 3 internal inconsistency:** its summary says "70 mounts (39+31), ~55 FAILS_CLOSED, ~13 SAFE," but its enumerated `mounts` array has **96 entries → 78 FC / 17 SAFE / 1 SCOPED**. I used the 96-entry array (the "70" counts raw `app.use()` lines; gateway/composite routers — `/api/ectd` ×3, `/api/programs`, etc. — were broken out). The two register files were **not** split, so per-file FC attribution within grp3 is unavailable.
- **Entry-vs-registration counting:** the 413 total counts classified **entries**; it exceeds the number of `app.use()` lines because gateways and multi-path mounts (`/api/time,/api/diag`; `/api/login,/logout,/register`; `/api/csr-builder + /api/csr`) are broken out. Treat 413 as "classified surfaces," not "router registrations."
- **Grp 7:** its summary says 11 SAFE / 30 total; the array has **10 SAFE / 29 entries** (time+diag and login+logout+register are combined entries). Counts above use enumerated entries.
- **Grp 4:** its summary says "19 FC (plus 3 duplicate-path entries)"; **22 entries carry verdict FAILS_CLOSED**. The 3 "duplicates" are the `/api/ai` auth-gate (a middleware, not a router) and the `/api/ai`↔`/api/ai-assistance` alias; `/api/test-assembly` is FENCED. I counted the 22 verdict-tagged entries and annotated the caveats.
- **Two `/api/task-management` routers** and overlapping task services (`/api/tasks`, `/api/regulatory/tasks`, `/api/unified-tasks`) — genuine duplicates across grp3/grp4/grp6; ensure the PR/central fix covers all, not just the taskBoard one.
- **Production-conditional FC** (not live 500s): FENCED — test-assembly (grp4), integration-test (grp6). GATED — regulatory-submissions, demo, preclinical, clinical-regulatory-evidence, mission-control. BROKEN-regardless — graphrag. These are in the 329 count but flagged inline.
