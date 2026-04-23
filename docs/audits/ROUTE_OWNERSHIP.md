# Route Ownership — Truth Table

**Authoritative as of:** 2026-04-22 (Phase 6 complete)
**Composition root:** `server/startup/routes.ts`

Every `/api/*` (and `/uploads`) mount in the pre-start and post-start
registration sequence is listed below with its owner module. If a path
is not here, it is either (a) registered in an unlisted inline-endpoint
module (`server/startup/inline-endpoints.ts`), (b) mounted by middleware
(e.g. `/api` auth gate inside `registerPlatformRoutes`), or (c) a bug
that should be tracked.

## Pre-start registrations (before HTTP listen)

Ordered exactly as `registerPreStartRoutes` executes. Startup order is
significant — auth gates, static-data guards, and feature flags depend
on it.

| # | Path prefix | Owner module | Family function |
| --- | --- | --- | --- |
| 1 | `/api/auth`, `/api/v1/auth`, `/api/users`, `/api/user`, `/api` auth gate, SSO, health probes | `bootstrap/register-platform-routes.ts` | `registerPlatformRoutes` |
| 2 | `/api/device-projects` | `bootstrap/register-inline-routes.ts` | `registerInlineEarlyRoutes` |
| 3 | Core templates, AI assistance, CMC, intelligent docs, PM settings, control plane | `bootstrap/register-core-routes.ts` | `registerCoreRoutes` |
| 4 | Foresight deprecation routes | `bootstrap/register-integrations-routes.ts` | `registerIntegrationRoutes` |
| 5 | `/api/ana-cortex`, `/api/ana-1-0-ri-cortex` | `bootstrap/register-inline-routes.ts` | `registerInlineAnaIntelligenceRoutes` |
| 5 | `/api/nano-banana` | `bootstrap/register-inline-routes.ts` | `registerInlineAnaIntelligenceRoutes` |
| 5 | `/api/predictive-sections` | `bootstrap/register-inline-routes.ts` | `registerInlineAnaIntelligenceRoutes` |
| 5 | `/api/foresight-ai/feedback` (deprecated alias → `foresight-feedback`) | `bootstrap/register-inline-routes.ts` | `registerInlineAnaIntelligenceRoutes` |
| 5 | `/api/biotech-rag` | `bootstrap/register-inline-routes.ts` | `registerInlineAnaIntelligenceRoutes` |
| 6 | FDA 510k, CERV2, IVDR, Manufacturing, PV, ClinOps, CER, GRDHE | `bootstrap/register-regulatory-routes.ts` | `registerRegulatoryRoutes` |
| 7 | `/` (License), `/api/module-subscriptions`, `/api/billing`, `/api/deep-research`, `/api/intelligent-reports`, `/api/safety-narratives`, `/api/statistical-defensibility`, `/api/conversation-health`, `/api/billing` (dashboard), `/api/report-os` | `bootstrap/register-inline-routes.ts` | `registerInlineLitCommerceRoutes` |
| 7 | `/api/stability` | `bootstrap/register-inline-routes.ts` | `registerInlineLitCommerceRoutes` |
| 8 | eCTD, GCC, Cortex, Evidence, Authoring, Biostat | `bootstrap/register-document-routes.ts` | `registerDocumentRoutes` |
| 9 | `/uploads` (static file serving) | `bootstrap/register-inline-routes.ts` | `registerInlinePlatformFacadesRoutes` |
| 9 | CSR intelligence routes (`/api/...`) | `bootstrap/register-inline-routes.ts` | `registerInlinePlatformFacadesRoutes` |
| 9 | `/api/csr-real-data` | `bootstrap/register-inline-routes.ts` | `registerInlinePlatformFacadesRoutes` |
| 9 | Audit trail (`/api/...`) | `bootstrap/register-inline-routes.ts` | `registerInlinePlatformFacadesRoutes` |
| 9 | AnA 1.0 RI inline facades (`/api/...`) | `bootstrap/register-inline-routes.ts` | `registerInlinePlatformFacadesRoutes` |
| 10 | `/api/ana` (features), `/api/ana-ri` (+ circuit breaker), `/api/firecrawl`, `/api/external-evidence`, `/api/chat`, `/api/ind-generation`, `/api/regulatory` (registry), `/api/ai` (claims), `/api/claude` (intelligence) | `bootstrap/register-ai-routes.ts` | `registerAiRoutes` |
| 11 | `/api/concept2cure` | `bootstrap/register-concept2cure-routes.ts` | `registerConcept2CureRoutes` |
| 12 | Admin routes | `bootstrap/register-admin-routes.ts` | `registerAdminRoutes` |
| 13 | `/api/authoring` | `bootstrap/register-inline-routes.ts` | `registerInlineAiWorkflowRoutes` |
| 13 | `/api/authoring-actions` | `bootstrap/register-inline-routes.ts` | `registerInlineAiWorkflowRoutes` |
| 13 | `/api/ana/platform` | `bootstrap/register-inline-routes.ts` | `registerInlineAiWorkflowRoutes` |
| 13 | `/api/ai-actions` (+ Redis + queue + SSE init) | `bootstrap/register-inline-routes.ts` | `registerInlineAiWorkflowRoutes` |
| 13 | `/api/orchestration` | `bootstrap/register-inline-routes.ts` | `registerInlineAiWorkflowRoutes` |
| 14 | Governance + intelligence bundle | `bootstrap/register-governance-routes.ts` | `registerGovernanceRoutes` |
| 15 | `/api/regulatory-submissions` | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |
| 15 | `/api/submission-ops`, `/api/regulatory-correspondence` | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |
| 15 | `/api/510k-workflow`, `/api/pma-workflow` | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |
| 15 | Beta-safe routes (via `mountBetaSafeRoutes`) | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |
| 15 | `/api/fda-forms`, `/api/field-sync`, `/api/content-assembly` | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |
| 15 | Misc inline (`/api/...` templates, vault, AnA RI API, advisor, eCTD templates, drafting) | `bootstrap/register-inline-routes.ts` | `registerInlineSubmissionWorkflowRoutes` |

## Post-start registrations (after HTTP listen + Phase A services ready)

| # | Path prefix | Owner module | Family function |
| --- | --- | --- | --- |
| 1 | Tenant scoping | `bootstrap/register-tenant-routes.ts` | `registerTenantRoutes` |
| 2 | Project routes | `bootstrap/register-project-routes.ts` | `registerProjectRoutes` |
| 3 | Clinical intel routes | `bootstrap/register-clinical-intel-routes.ts` | `registerClinicalIntelRoutes` |
| 4 | Advanced platform routes | `bootstrap/register-advanced-platform-routes.ts` | `registerAdvancedPlatformRoutes` |

## Invariants (enforced by this document)

1. **No inline `app.use(...)` in `server/startup/routes.ts`.** Every mount
   is delegated to a named `register*Routes` function.
2. **Slot ordering is fixed.** The six `registerInline*Routes` slots map
   to the six interleaved positions where ad-hoc mounts historically lived.
   Re-ordering them changes startup behavior and is forbidden without
   writing a regression test first.
3. **AI Gateway canonical.** All routes that generate AI content must go
   through `server/services/ai-gateway/`. Enforced by
   `tests/routes/ai-entry-point-contract.test.ts`.
4. **Governed Document Contract canonical.** All routes that create or
   mutate artifacts must call `resolveGovernedContext`. Enforced by
   `tests/routes/chat-governed-upload.test.ts` and
   `tests/routes/concept2cure-governed-upload.test.ts`.

## Future subdivisions (tracked, not yet scheduled)

The `register-inline-routes.ts` family holds six slots today. When one of
these slots grows large enough to warrant its own bootstrap module, the
recommended splits are:

- `registerInlineLitCommerceRoutes` → split **commerce** (license, billing,
  module-subscriptions, billing-dashboard) from **analytics** (deep-research,
  intelligent-reports, safety-narratives, statistical-defensibility,
  conversation-health, report-os) and **stability**.
- `registerInlineAiWorkflowRoutes` → extract AI-actions initialization
  (Redis, queue, SSE) into its own service bootstrap, leaving this slot
  with just route mounts.
- `registerInlineSubmissionWorkflowRoutes` → split **submission-ops**
  (regulatory-submissions, submission-ops, correspondence) from
  **device-workflow** (510k, pma, beta-safe) from **assembly** (fda-forms,
  field-sync, content-assembly) from **misc**.

Each subdivision is a local edit: extract handlers from
`register-inline-routes.ts`, add a new `register-*-routes.ts` file, and
update the matching slot call in `server/startup/routes.ts`.
