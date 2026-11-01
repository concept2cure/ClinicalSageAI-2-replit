# R1 inventory: every server route, whether a screen calls it, and what production does with it

**Package:** R1 (Reach), `docs/design/ONE_DESIGN_PLAN.md` §3. **Commit measured:** `18261a908`, 2026-11-01.
**Scope of this filing:** the inventory only. It changes no code. Each reach is done afterwards, in the plan
package that owns the screen, by the session that owns that package's files (plan §4.6: never two sessions on
one file).

## What already exists (RULE 3)

- `scripts/ci/audit-route-mounts.mjs` audits *where* routers are mounted. It does not ask whether a client calls a
  route.
- `scripts/ci/check-client-reachability.mjs` traces *client files* from `client/src/main.tsx`. It does not look at
  the server.
- `server/services/entitlements/launch-scope-api.ts` (`launchScopeApiVerdict`) and `api-prefix-map.ts` decide what
  production serves. This inventory runs that same function for every route, so its production column is the
  gate's own verdict, not a re-implementation.
- `LAUNCH_EXCLUDED_API` in that file already records some dead roots, with reasons (for example `/api/chat/stream`).
- No existing tool joins the three. Searches run: `_router.stack`, `listEndpoints`, `route inventory`, `uncalled`,
  `orphan` and `reach` under `scripts/` and `server/`. Nothing found does this.

## Method (reproducible: `method/`)

1. **Mounted routes, from the running server.** `method/trace.cjs` is preloaded into the server
   (`NODE_OPTIONS=--require`). It records each router's creating file, its routes and every `use()` mount.
   `method/compose.py` joins them into full paths. This is the server's own table, not a text search:
   **3923 handlers under `/api`**.
2. **Client callers.** `method/match.py` turns every string or template literal in `client/src` and `shared/`
   (tests excluded) that names an API path into a pattern, with `${…}` standing for one or more segments. It
   tests each route against those patterns. A route counts as **called** if any pattern matches it.
3. **Production verdict.** `method/verdict.ts` runs `launchScopeApiVerdict` with the real prefix map and
   `NEVER_GATED`:
   - `launch`: served;
   - `out-of-scope`: refused with 403;
   - `unmapped`: refused when `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`;
   - `never-gated` and `infrastructure`: always served.
4. **Owning package.** The route file is matched against each package's `paths` in `docs/design/one-design-plan.json`.

**Limits.** "Not called" means no literal in the client names the path:
- A URL assembled from variables declared in another file reads as not called. This **under**-counts callers, so
  each row must be checked before a reach is built.
- AnA tools and the MCP connector call *services*, not routes. A route that is not called can still have its
  capability reachable through AnA. A reach decides whether the screen needs it as well.

## Results

| Client caller | Production verdict | Handlers |
|---|---|---:|
| called | launch | 958 |
| called | out-of-scope | 148 |
| called | never-gated | 76 |
| called | unmapped | 34 |
| called | infrastructure | 14 |
| not called | unmapped | 1386 |
| not called | out-of-scope | 593 |
| not called | launch | 555 |
| not called | never-gated | 119 |
| not called | infrastructure | 40 |

- **1230 handlers are called by a screen** and **2693 are not.**
- **236 route files (1765 handlers) have no client caller at all.**

### 1. Called by a screen, refused in production: 182 handlers

These are doors a client can see and production refuses. Most callers are surfaces that are themselves outside
the launch scope (locked in production), so a customer never reaches them. **The rows whose caller is a launch
screen are defects (F1).** The design session is walking the running app with `LAUNCH_SCOPE_ENFORCE=on`; this
list is its static counterpart.

| Handlers | Verdict | Route file | Example route | Caller |
|---:|---|---|---|---|

| 21 | out-of-scope | `server/routes/pdev/pdev-routes.ts` | `GET /api/pdev/programs/:programId` | `client/src/concept2cure/pdev/hooks/usePdevData.ts` |
| 14 | out-of-scope | `server/routes/intelligent-reports.ts` | `GET /api/intelligent-reports/:reportId/attestations` | `client/src/concept2cure/v2/surfaces/ReportGovernance.tsx` |
| 10 | out-of-scope | `server/routes/submission-twin.ts` | `POST /api/submission-twin/assess/:packageId` | `client/src/concept2cure/v2/surfaces/SubmissionTwin.tsx` |
| 7 | out-of-scope | `server/routes/biopharma/bla-workbench.ts` | `POST /api/biopharma/bla/analytical-similarity` | `client/src/concept2cure/v2/surfaces/BlaAssessmentWorkbench.tsx` |
| 7 | out-of-scope | `server/routes/deep-research.ts` | `GET /api/deep-research/connectors` | `client/src/concept2cure/v2/surfaces/DeepResearch.tsx` |
| 6 | out-of-scope | `server/routes/biopharma-specialty.routes.ts` | `GET /api/biopharma/orphan` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 6 | out-of-scope | `server/routes/quality-management-api.ts` | `GET /api/quality/dashboard/:qmpId` | `client/src/concept2cure/v2/surfaces/QmpWorkspace.tsx` |
| 5 | unmapped | `server/routes/nda-cockpit.routes.ts` | `GET /api/nda-cockpit/m1` | `client/src/concept2cure/v2/surfaces/NdaCockpit.tsx` |
| 5 | out-of-scope | `server/routes/orchestration.ts` | `POST /api/orchestration/continuity` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 4 | out-of-scope | `server/routes/cro.ts` | `GET /api/cro/studies` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 4 | unmapped | `server/routes/labeling-pi.routes.ts` | `GET /api/labeling-pi` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 4 | out-of-scope | `server/routes/pharmacovigilance-routes.ts` | `POST /api/pharmacovigilance/calculate-deadline` | `client/src/concept2cure/v2/surfaces/PvCockpit.tsx` |
| 3 | unmapped | `server/routes/clinical-operations-routes.ts` | `POST /api/clinical-operations/deviations` | `client/src/concept2cure/v2/surfaces/ClinicalOps.tsx` |
| 3 | out-of-scope | `server/routes/nonclinical.ts` | `GET /api/nonclinical/studies` | `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` |
| 3 | out-of-scope | `server/routes/orchestration.ts` | `POST /api/orchestration/cancel/:id` | `client/src/concept2cure/v2/surfaces/Orchestration.tsx` |
| 3 | out-of-scope | `server/routes/precedent-engine.ts` | `POST /api/precedent-engine/check-claim` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 3 | out-of-scope | `server/routes/regulatory-precedent-intelligence.ts` | `GET /api/regulatory-precedent-intelligence/confidence/calibration-report` | `client/src/concept2cure/v2/surfaces/FilingStrategy.tsx` |
| 3 | out-of-scope | `server/routes/safety-narrative.ts` | `GET /api/safety-narratives/cases` | `client/src/concept2cure/v2/surfaces/SafetyNarrative.tsx` |
| 2 | unmapped | `server/routes/analytics-routes.ts` | `POST /api/analytics/analyze-protocol-text` | `client/src/concept2cure/v2/surfaces/ReportEngine.tsx` |
| 2 | out-of-scope | `server/routes/c2c/templates.ts` | `GET /api/c2c/templates` | `client/src/concept2cure/v2/surfaces/AuthoringEngine.tsx` |
| 2 | out-of-scope | `server/routes/c2c/templates.ts` | `POST /api/c2c/templates/extract` | `client/src/concept2cure/v2/surfaces/TemplateLibrary.tsx` |
| 2 | unmapped | `server/routes/cmc-changes.routes.ts` | `GET /api/cmc-changes` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 2 | out-of-scope | `server/routes/cro.ts` | `GET /api/cro/clients` | `client/src/concept2cure/v2/surfaces/CroPortfolio.tsx` |
| 2 | out-of-scope | `server/routes/enablement.ts` | `GET /api/enablement/certifications` | `client/src/concept2cure/v2/surfaces/Training.tsx` |
| 2 | out-of-scope | `server/routes/evidence.ts` | `GET /api/evidence` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 2 | out-of-scope | `server/routes/labeling-smpc.routes.ts` | `GET /api/labeling-smpc` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 2 | unmapped | `server/routes/maa-module1.routes.ts` | `GET /api/maa-module1/:market` | `client/src/concept2cure/v2/surfaces/MaaCockpit.tsx` |
| 2 | out-of-scope | `server/routes/market-access.routes.ts` | `GET /api/market-access` | `client/src/concept2cure/v2/surfaces/MarketAccess.tsx` |
| 2 | unmapped | `server/routes/reg-change.routes.ts` | `GET /api/reg-change` | `client/src/concept2cure/v2/surfaces/RegChange.tsx` |
| 2 | out-of-scope | `server/routes/rim.ts` | `GET /api/rim/products/:id/market-dossier` | `client/src/concept2cure/v2/surfaces/Registrations.tsx` |
| 2 | out-of-scope | `server/routes/saved-precedent-queries.ts` | `GET /api/saved-precedent-queries` | `client/src/concept2cure/mdx/surfaceIds.ts` |
| 2 | out-of-scope | `server/routes/saved-precedent-queries.ts` | `DELETE /api/saved-precedent-queries/:id` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 1 | out-of-scope | `server/routes/ai-actions.ts` | `POST /api/ai-actions/execute` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 1 | unmapped | `server/routes/batch-draft-routes.ts` | `GET /api/batch-draft/spine` | `client/src/concept2cure/v2/surfaces/BatchDraft.tsx` |
| 1 | out-of-scope | `server/routes/biopharma/programs.ts` | `GET /api/biopharma` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/change-assessment.routes.ts` | `GET /api/change-assessment` | `client/src/concept2cure/v2/surfaces/ChangeAssessment.tsx` |
| 1 | out-of-scope | `server/routes/citations.ts` | `POST /api/citations/verify` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | unmapped | `server/routes/ana-intelligence.ts` | `POST /api/claude/batch` | `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx` |
| 1 | out-of-scope | `server/routes/client-portal.ts` | `GET /api/client-portal/overview` | `client/src/concept2cure/v2/surfaces/ClientPortal.tsx` |
| 1 | out-of-scope | `server/routes/c2c/exports.ts` | `POST /api/concept2cure/artifacts/export-pptx` | `client/src/concept2cure/v2/surfaces/LabelingPi.tsx` |
| 1 | out-of-scope | `server/routes/c2c/artifacts.ts` | `GET /api/concept2cure/projects/all/artifacts-summary` | `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` |
| 1 | unmapped | `server/routes/cro-portfolio.routes.ts` | `GET /api/cro-portfolio` | `client/src/concept2cure/v2/surfaces/CroPortfolio.tsx` |
| 1 | out-of-scope | `server/routes/csr-builder-routes.ts` | `GET /api/csr-builder` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/routes/csr-workflow-routes.ts` | `GET /api/csr-workflow/board` | `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` |
| 1 | out-of-scope | `server/routes/decision-lineage.routes.ts` | `GET /api/decision-lineage` | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx` |
| 1 | out-of-scope | `server/routes/decision-lineage.ts` | `GET /api/decision-lineage/verify-chain` | `client/src/concept2cure/v2/fixtures/decision-lineage-data.ts` |
| 1 | out-of-scope | `server/routes/deep-research-board.routes.ts` | `GET /api/deep-research/board` | `client/src/concept2cure/v2/surfaces/DeepResearch.tsx` |
| 1 | unmapped | `server/routes/doc-journey.routes.ts` | `GET /api/doc-journey` | `client/src/concept2cure/v2/surfaces/DocJourney.tsx` |
| 1 | out-of-scope | `server/routes/enablement.ts` | `GET /api/enablement` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | unmapped | `server/routes/evidence-asks.routes.ts` | `GET /api/evidence-asks` | `client/src/concept2cure/v2/surfaces/Evidence.tsx` |
| 1 | unmapped | `server/routes/evidence-objects.routes.ts` | `GET /api/evidence-objects` | `client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx` |
| 1 | out-of-scope | `server/routes/evidence-ask.ts` | `POST /api/evidence/ask` | `client/src/concept2cure/v2/surfaces/Evidence.tsx` |
| 1 | out-of-scope | `server/routes/global-markets.ts` | `GET /api/global-markets` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/global-ri/catalog.routes.ts` | `GET /api/global-ri/catalog` | `client/src/hooks/useGlobalRiCatalog.ts` |
| 1 | out-of-scope | `server/routes/ind-lifecycle/documents.routes.ts` | `POST /api/ind-lifecycle/safety-report` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/investigator-brochure.routes.ts` | `GET /api/investigator-brochure` | `client/src/concept2cure/v2/surfaces/InvestigatorBrochure.tsx` |
| 1 | unmapped | `server/routes/lifecycle.ts` | `GET /api/lifecycle/renewals` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 1 | out-of-scope | `server/routes/mdx-submission-gateway.ts` | `GET /api/mdx/gateways` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/routes/mdx-qms.ts` | `GET /api/mdx/qms/readiness` | `client/src/concept2cure/quality/qmsApproval.ts` |
| 1 | unmapped | `server/routes/nonclinical-summary.routes.ts` | `GET /api/nonclinical-summary` | `client/src/concept2cure/v2/surfaces/Nonclinical.tsx` |
| 1 | out-of-scope | `server/routes/orchestration-checkpoints.ts` | `GET /api/orchestration/checkpoints` | `client/src/concept2cure/v2/surfaces/Orchestration.tsx` |
| 1 | out-of-scope | `server/routes/pharmacovigilance-board.routes.ts` | `GET /api/pharmacovigilance/board` | `client/src/concept2cure/v2/surfaces/BiopharmaSpecialty.tsx` |
| 1 | unmapped | `server/routes/precedent-engine-board.ts` | `GET /api/precedent-engine-board` | `client/src/concept2cure/v2/surfaces/PrecedentEngine.tsx` |
| 1 | out-of-scope | `server/routes/program-journey.routes.ts` | `GET /api/program-journey` | `client/src/concept2cure/v2/surfaces/BiopharmaJourney.tsx` |
| 1 | out-of-scope | `server/routes/project-sections.ts` | `GET /api/project-sections` | `shared/constants/ui-surface-registry.ts` |
| 1 | unmapped | `server/routes/registrations-standards.ts` | `GET /api/registrations/data-standards` | `client/src/concept2cure/v2/surfaces/Registrations.tsx` |
| 1 | out-of-scope | `server/routes/regulatory-workspace-routes.ts` | `GET /api/regulatory-workspace` | `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` |
| 1 | out-of-scope | `server/routes/report-os.ts` | `GET /api/report-os/portfolio` | `shared/constants/ui-surface-registry.ui-v2.ts` |
| 1 | out-of-scope | `server/routes/report-os.ts` | `GET /api/report-os/portfolio/org` | `client/src/concept2cure/v2/surfaces/AnaCommand.tsx` |
| 1 | unmapped | `server/routes/research-admin.routes.ts` | `GET /api/research-admin` | `client/src/concept2cure/v2/surfaces/ResearchAdmin.tsx` |
| 1 | unmapped | `server/routes/shadow-review.routes.ts` | `GET /api/shadow-review` | `client/src/concept2cure/v2/surfaces/ShadowReview.tsx` |
| 1 | unmapped | `server/routes/source-tracer-routes.ts` | `GET /api/source-tracer/sections` | `client/src/concept2cure/v2/surfaces/SourceTracer.tsx` |
| 1 | out-of-scope | `server/routes/misc-inline-routes.ts` | `GET /api/templates` | `shared/constants/ui-surface-registry.ts` |
| 1 | out-of-scope | `server/api/templates/routes.ts` | `POST /api/templates` | `shared/constants/ui-surface-registry.ts` |
| 1 | unmapped | `server/routes/tenant-export.ts` | `GET /api/tenant-export/full` | `shared/authoring/figure-refs.ts` |

### 2. Not called, but served in production: the reach candidates

These are capabilities already inside the launch scope that no screen uses. They are R1's main work. Each is
reached in the screen of the package that owns it, or put to the founder for retirement.

| Owning package | Handlers |
|---|---:|
| none (no package path claims the file) | 302 |
| S3 | 90 |
| S5 | 64 |
| S4 | 39 |
| S7 | 27 |
| S12 | 26 |
| S8 | 20 |
| S10 | 12 |
| S1 | 9 |
| S9 | 2 |
| S6 | 1 |

By route file (largest first):

| Not called | Route file | Packages | Example |
|---:|---|---|---|
| 48 | `server/routes/ivd-lifecycle.ts` | — | `POST /api/ivd-lifecycle/authoring/emdr` |
| 45 | `server/routes/submissions.ts` | S5 | `GET /api/submissions/:id` |
| 39 | `server/routes/biostatPlatform.ts` | S3 | `GET /api/biostat/continuum/:threadId` |
| 29 | `server/routes/ana-ri.ts` | S4 | `GET /api/ana-ri/actions` |
| 19 | `server/routes/mdx-rbm.ts` | S8 | `GET /api/mdx/rbm-assessments/:id` |
| 17 | `server/routes/ivdr-routes.ts` | — | `GET /api/ivdr/cdx-workflows` |
| 15 | `server/routes/biostat-design-stats.ts` | S3 | `POST /api/biostat/assurance` |
| 14 | `server/routes/submission-ops.ts` | S5 | `DELETE /api/submission-ops/artifact-section-map/:mappingId` |
| 13 | `server/routes/manufacturing-routes.ts` | — | `GET /api/manufacturing/ai/review` |
| 13 | `server/routes/users.ts` | — | `GET /api/user` |
| 12 | `server/routes/ivdr-binder-routes.ts` | — | `GET /api/ivdr/binder` |
| 12 | `server/routes/regulatory-correspondence.ts` | S10 | `GET /api/regulatory-correspondence/analytics/deficiency-patterns` |
| 11 | `server/routes/diagnostics-performance.ts` | — | `POST /api/diagnostics-performance/analytical/detection-capability` |
| 10 | `server/routes/coauthor.ts` | — | `POST /api/coauthor/documents/:docId/compile` |
| 10 | `server/routes/taskManagement.routes.ts` | — | `DELETE /api/task-management/tasks/:taskId` |
| 9 | `server/routes/ana-biostats.ts` | S3, S4 | `POST /api/ana-biostats/compare` |
| 9 | `server/api/cmc/module3OperatingSystemRoutes.ts` | S7, S12 | `POST /api/cmc/module3-os/compile/:projectId` |
| 9 | `server/routes/fda-forms.routes.ts` | — | `GET /api/fda-forms/applicable` |
| 9 | `server/routes/irb.ts` | — | `POST /api/irb/submissions/:id/amendments` |
| 8 | `server/routes/cer-routes.ts` | — | `POST /api/cer/faers/data` |
| 8 | `server/routes/clients-routes.ts` | — | `DELETE /api/clients/:id` |
| 8 | `server/routes/project-rules.ts` | — | `DELETE /api/project-rules/:ruleId` |
| 7 | `server/routes/cerv2-ai-routes.ts` | — | `POST /api/cerv2/ai/analyze-section` |
| 7 | `server/routes/mdx-ivdr.ts` | — | `GET /api/mdx/ivdr/:programId` |
| 7 | `server/routes/protocol-consent.ts` | S3 | `PATCH /api/protocol-consent/elements/:id` |
| 6 | `server/routes/mdx-cdx.ts` | — | `GET /api/mdx/cdx/:programId` |
| 6 | `server/routes/unifiedTasks.routes.ts` | — | `GET /api/regulatory/tasks/:id` |
| 5 | `server/routes/c2c/documents.ts` | S1 | `GET /api/c2c/documents/:id` |
| 5 | `server/routes/company-document-governance.ts` | — | `PUT /api/client-branding/company-documents/branding-policy` |
| 5 | `server/api/cmc/routes.ts` | S7, S12 | `GET /api/cmc/projects/:projectId/process-capability` |
| 5 | `server/routes/ind-forms.routes.ts` | — | `POST /api/ind-forms/1572/pdf-all` |
| 5 | `server/routes/mdx-labeling.ts` | — | `GET /api/mdx/labeling/:id` |
| 5 | `server/routes/protocol-amendments.ts` | S3 | `GET /api/protocol-amendments/amendments/:id` |
| 5 | `server/routes/protocol-deviations.ts` | S3 | `PATCH /api/protocol-deviations/capa/:id/status` |
| 5 | `server/routes/statistical-defensibility.ts` | — | `POST /api/statistical-defensibility/consistency` |
| 5 | `server/routes/tenants-simple.ts` | — | `DELETE /api/tenants/:id` |
| 4 | `server/routes/cerv2-sections.ts` | — | `DELETE /api/cerv2-sections/:sectionId` |
| 4 | `server/routes/cerv2-document-routes.ts` | — | `GET /api/cerv2/documents` |
| 4 | `server/routes/company-document-designs.ts` | — | `GET /api/client-branding/company-documents/designs/:id` |
| 4 | `server/api/cmc/sourceEvidenceRoutes.ts` | S7, S12 | `GET /api/cmc/module3-os/source-evidence/:projectId` |
| 4 | `server/routes/c2c/reviews.ts` | S1 | `PATCH /api/concept2cure/review-tasks/:taskId` |
| 4 | `server/routes/csr-jobs.ts` | — | `GET /api/csr/jobs/:jobId` |
| 4 | `server/routes/csr-jobs-assembly.ts` | — | `GET /api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle` |
| 4 | `server/routes/mdx-clia.ts` | — | `GET /api/mdx/clia/:id` |
| 4 | `server/routes/tenant-config.ts` | — | `GET /api/tenant-config/:tenantId/settings` |
| 3 | `server/routes/company-documents.ts` | — | `POST /api/client-branding/company-documents/legal-documents` |
| 3 | `server/api/cmc/batchRecordRoutes.ts` | S7, S12 | `PUT /api/cmc/batch-records/:id` |
| 3 | `server/api/cmc/specificationRoutes.ts` | S7, S12 | `PUT /api/cmc/specifications/:id` |
| 3 | `server/routes/human-factors.ts` | — | `POST /api/human-factors/hfe-completeness` |
| 3 | `server/routes/mdx-notifications.ts` | — | `PUT /api/mdx/notification-subscriptions/:category` |
| 3 | `server/routes/mdx-udi.ts` | — | `GET /api/mdx/udi/:id` |
| 3 | `server/routes/predicate-intelligence.ts` | — | `GET /api/predicate-intelligence/candidates/:id` |
| 3 | `server/routes/projects-management.ts` | — | `DELETE /api/projects/:projectId` |
| 3 | `server/routes/protocol-reviews.ts` | S3 | `PATCH /api/protocol-reviews/comments/:id/resolve` |
| 2 | `server/routes/510k-estar-routes.ts` | — | `POST /api/510k/estar/registration/assess` |
| 2 | `server/routes/authoring-actions.ts` | — | `GET /api/authoring-actions/decision-context/:projectId` |
| 2 | `server/routes/biostat-bridge.ts` | S3 | `GET /api/biostat-bridge/computation-runs/:runId/reproduce` |
| 2 | `server/routes/company-document-identity.ts` | — | `GET /api/client-branding/company-documents/legacy-adoption` |
| 2 | `server/routes/ectd-compile.ts` | S5 | `GET /api/ectd-compile/:projectIdent/filed-state` |
| 2 | `server/routes/esignature.ts` | — | `POST /api/esignature/verify-mfa` |

### 3. Route files with no client caller at all: 236

These files are candidates for the founder to retire (RULE 6: nothing new; each is reached or retired). The full
list is in `inventory.json`. The 40 largest:

| Handlers | Route file | Production verdicts | Packages |
|---:|---|---|---|
| 71 | `server/src/routes/stability.router.ts` | unmapped | — |
| 68 | `server/routes/ana-features.ts` | out-of-scope | S4 |
| 51 | `(app-level / unattributed)` | infrastructure, never-gated, out-of-scope, unmapped | — |
| 48 | `server/routes/ivd-lifecycle.ts` | launch | — |
| 38 | `server/routes/qc.routes.ts` | unmapped | — |
| 33 | `server/routes/ana-cortex.ts` | unmapped | S4 |
| 33 | `server/routes/client-intelligence.ts` | unmapped | S1 |
| 33 | `server/routes/resolution.ts` | unmapped | — |
| 30 | `server/routes/grants.ts` | unmapped | — |
| 27 | `server/routes/operating-system.ts` | unmapped | — |
| 26 | `server/routes/cortexManagementRoutes.ts` | unmapped | — |
| 26 | `server/routes/grdheRoutes.ts` | unmapped | — |
| 26 | `server/routes/regulatory-graph.ts` | unmapped | — |
| 26 | `server/routes/regulatory-intelligence.ts` | out-of-scope | — |
| 25 | `server/routes/assumption-decision-contradiction.ts` | out-of-scope | — |
| 21 | `server/routes/ana-cortex-ft.ts` | unmapped | S4 |
| 21 | `server/routes/ind-lifecycle/registers.routes.ts` | out-of-scope, unmapped | S5 |
| 21 | `server/routes/defense-packet.ts` | out-of-scope | — |
| 20 | `server/routes/snowglobe.ts` | unmapped | — |
| 19 | `server/routes/global-compliance.ts` | unmapped | — |
| 18 | `server/routes/moduleIntegrationRoutes.ts` | unmapped | — |
| 17 | `server/src/routes/control-plane.router.ts` | unmapped | — |
| 16 | `server/routes/conversation-os.ts` | unmapped | — |
| 16 | `server/routes/unifiedTasks.routes.ts` | launch, out-of-scope, unmapped | — |
| 15 | `server/routes/audit-services.ts` | unmapped | — |
| 15 | `server/routes/docx-factory.ts` | unmapped | — |
| 14 | `server/routes/intelligence.ts` | out-of-scope | — |
| 14 | `server/routes/knowledge-base.ts` | unmapped | — |
| 13 | `server/routes/account-intelligence.ts` | unmapped | — |
| 13 | `server/routes/manufacturing-routes.ts` | launch | — |
| 12 | `server/routes/c2c/context-intelligence.ts` | unmapped | S1 |
| 12 | `server/routes/evidence-management.routes.ts` | unmapped | — |
| 12 | `server/routes/ivdr-binder-routes.ts` | launch | — |
| 12 | `server/routes/tenant-ctq-factors.ts` | out-of-scope, unmapped | — |
| 12 | `server/routes/regulatory-digital-twin.ts` | unmapped | — |
| 11 | `server/routes/biotech-artifacts.ts` | unmapped | — |
| 11 | `server/routes/change-propagation.ts` | out-of-scope | — |
| 11 | `server/routes/client-branding.ts` | unmapped | — |
| 11 | `server/routes/committees.ts` | out-of-scope | — |
| 11 | `server/routes/coverage-analysis.ts` | out-of-scope | — |

## What happens next (R1)

1. **Defects first (F1).** Check every row of §1 whose caller is a launch screen against the running app with
   `LAUNCH_SCOPE_ENFORCE=on`. That walk is shared with the design session.
2. **Reach, package by package (§2).** For each route file, confirm the row is truly not called (the limits above).
   Then name the screen in the owning package that should call it, and reach it there under that package's plan
   ID, in a file no other session holds.
3. **Retirement list (§3) for the founder.** No file is deleted by this package without a founder decision. That
   follows the working agreement: name the replacement path, or the deletion is a product decision.

## Files

- `inventory.json`: every handler, with method, path, route file, production verdict, claiming surfaces, owning
  packages and the first client caller found.
- `method/`: the trace, compose, match and verdict scripts used to produce it.
