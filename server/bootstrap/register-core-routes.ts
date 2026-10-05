import type { RouteBootstrapContext } from './types';
// Canonical JWT auth (server/middleware/auth.ts — extensionless import on
// purpose so the .ts implementation, not the legacy .js twin, is loaded).
import { authenticateToken } from '../middleware/auth';
import templateRoutes from '../api/templates/routes';
import aiRoutes from '../api/ai/routes';
import phase3Routes from '../api/ai/phase3-routes.js';
import { testAssemblyRoutes } from '../routes/test-assembly';
import enterpriseRoutes from '../api/enterprise/routes.js';
import cmcCoreRoutes from '../api/cmc/routes';
import cmcSpecificationRoutes from '../api/cmc/specificationRoutes';
import cmcBatchRecordRoutes from '../api/cmc/batchRecordRoutes';
import cmcModule3OperatingSystemRoutes from '../api/cmc/module3OperatingSystemRoutes';
import cmcModule3BuildStateRoutes from '../api/cmc/module3BuildStateRoutes';
import cmcModule3ConvergenceRoutes from '../api/cmc/module3ConvergenceRoutes';
import cmcSourceEvidenceRoutes from '../api/cmc/sourceEvidenceRoutes';
import { cmcWriteRoleGate } from '../api/cmc/cmc-write-role-gate';
import cmcModule3BoardRoutes from '../routes/cmc-module3-board.routes';
import cmcAgencyQuestionRoutes from '../routes/cmc-agency-questions.routes';
import aiAssistanceRoutes, { setAIService } from '../routes/ai-assistance';
import controlPlaneRouter from '../src/routes/control-plane.router';
import pmSettingsRouter from '../src/routes/pm-settings.router';
import { getAIRouter } from '../services/aiProviderRouter.js';
import taskManagementRoutes from '../routes/taskManagement.routes';
import unifiedTaskRoutes from '../routes/unifiedTasks.routes';

export function registerCoreRoutes({
  app,
  pool,
  aiCircuitBreaker,
  testRoutesEnabled,
}: RouteBootstrapContext) {
  // Mount-level auth (audit finding H2): these families are tenant-scoped
  // with no public endpoints, so they are gated here in addition to the
  // global /api boundary — protection must not depend on mount ordering or
  // on every handler remembering its own guard.
  app.use('/api/templates', authenticateToken, templateRoutes);
  // Gate the whole /api/ai namespace once: covers aiRoutes below, every
  // phase3Routes endpoint (all live under /ai/* — see next comment), and the
  // /api/ai AI-assistance alias mounted later in this file.
  app.use('/api/ai', authenticateToken);
  app.use('/api/ai', aiCircuitBreaker, aiRoutes);
  // Test-only assembly harness — fenced out of production (issue #848).
  if (testRoutesEnabled) {
    app.use('/api/test-assembly', testAssemblyRoutes(pool));
  } else {
    console.log('⛔ /api/test-assembly not mounted (test routes fenced in this environment)');
  }
  // phase3Routes registers everything under /ai/* but is mounted at the bare
  // '/api' prefix, so an auth middleware placed directly on THIS mount would
  // intercept EVERY /api request — including intentionally-public families
  // mounted later (e.g. the X-API-Key-authed /api/v1). The /api/ai gate
  // above covers every route phase3Routes defines instead.
  app.use('/api', phase3Routes);
  app.use('/api/enterprise', enterpriseRoutes);
  // /api/enterprise/rbac removed 2026-09-22: a parallel role store (roles,
  // user_roles — created only by the refused _consolidated/006_roles.sql) whose
  // every data handler failed, with no client caller. Roles live on
  // organization_users.role: listed by GET /api/mdx/admin (mdx-admin.ts,
  // AdminAccess.tsx), assigned by POST/PATCH /api/tenant-users (tenant-users.ts)
  // and SCIM (scim.ts). Custom-role creation never worked and has no replacement.

  try {
    // A viewer reads CMC and writes none of it: one gate ahead of every
    // /api/cmc router, so a write route added later is gated by default.
    app.use('/api/cmc', cmcWriteRoleGate);
    app.use('/api/cmc', cmcCoreRoutes);
    /* Retired 2026-10-05 (D2), with no caller in client/src or server code —
       the routers below, before CMC / Module 3 joins the launch catalog. Pinned
       gone by server/api/cmc/__tests__/cmc-retired-routers.contract.test.ts;
       evidence docs/evidence/CMC-M3-GA/2026-10-05/15-retired-cmc-routers/.

       `/api/cmc` aggregator (server/api/cmc/index.js: GET /status, a static
       manifest calling seven modules "available"; POST /test-event →
       server/services/cmcEvents.js) and its seven sub-routers. Model calls
       decided filing categories and drafted content; results were written to
       local disk and read back by caller-supplied id with no organization.
         · cmc-copilot → AnA's CMC tools find_cmc_guidance, get_cmc_requirements,
           explain_cmc_topic (server/services/ana/cmc-knowledge-tools.ts), and
           POST /api/cmc/control-strategy, POST /api/cmc/ich-compliance
           (server/api/cmc/routes.ts);
         · change-impact-simulator → POST /api/cmc/variations/classify
           (routes.ts, supac-classifier) and /api/cmc/change-control;
         · blueprint-generator → GET /api/cmc/quality/qbd/:projectId and
           POST /api/cmc/control-strategy; Module 3 drafting →
           POST /api/cmc/module3-os/compile/:projectId;
         · manufacturing-tuner, preclinical-translator, global-compliance(.js),
           audit-risk-monitor → the registers in routes.ts and its deterministic
           stability estimators (POST /api/cmc/stability-studies/:id/shelf-life,
           /:id/trending, /poolability). There is NO replacement for the model's
           process-tuning advice, scale-up / batch-record drafts, per-region
           rewrites or the audit-risk monitor: model prose on local disk, never
           a governed record, with no caller — and in part never working (every
           audit-risk-monitor POST and manufacturing-tuner's /optimize threw on
           a response shape the unified AI client does not return). Deleted as
           uncalled and ungoverned, not migrated. (server/routes/
           global-compliance.ts is a different, live router and stays.)

       `/api/cmc` projectRoutes (server/api/cmc/projectRoutes.ts) — a second
       project store (cmc_projects) beside the program spine, which no client
       populated → /api/c2c/projects (server/routes/c2c/projects.ts) and the
       Module 3 project guard (server/api/cmc/module3-project-guard.ts).
       Its root router.use(authenticateToken) authenticated EVERY /api/cmc
       request that reached it — every mount below — which matters wherever
       the /api boundary only warns (server/middleware/authBoundary.ts). That
       authentication stays, here, in its place: */
    app.use('/api/cmc', authenticateToken);
    /* `/api/cmc/blueprint` is gone (server/api/cmc/blueprintRoutes.ts, with
       portfolio.ts and playbookRoutes.ts mounted under it). Blueprint and QbD →
       GET /api/cmc/quality/qbd/:projectId and POST /api/cmc/control-strategy
       (routes.ts); Module 3 drafting → POST /api/cmc/module3-os/compile/:projectId;
       the portfolio overview (which read reg_rpi_snapshots and
       reg_m3_sections.up_stability, neither on any applier) → GET
       /api/cmc/module3-board (server/routes/cmc-module3-board.routes.ts);
       playbook workflows and checklists → the unified task board /api/tasks
       (server/routes/taskManagement.routes.ts). */
    app.use('/api/cmc/specifications', cmcSpecificationRoutes);
    /* `/api/cmc/stability` is gone. Its four handlers could not write: the
       INSERT named project_id, tenant_id, study_name, storage_condition,
       started_date and results, none of which exist on the provisioned
       `public.stability_studies` — that column set belongs to
       shared/cmc-schema.ts, which drizzle.config.ts never provisions. Every
       call 500'd or returned empty. No caller remained after the client
       sweep, and the capability is served by the 74-endpoint GxP router at
       /api/stability and by /api/cmc/stability-studies. */
    app.use('/api/cmc/batch-records', cmcBatchRecordRoutes);
    /* `/api/cmc/workflows` is gone (server/api/cmc/workflowRoutes.ts): a
       second workflow store in project_workflows hung off cmc_projects, and an
       /ai-command that drafted CMC documents into cmc_ai_command_results.
       Workflows and tasks → the unified task board /api/tasks
       (server/routes/taskManagement.routes.ts); governed CMC drafting → POST
       /api/cmc/module3-os/compile/:projectId and /build-section/:projectId/:sectionKey. */
    app.use('/api/cmc/module3-os', cmcModule3OperatingSystemRoutes);
    app.use('/api/cmc/module3-os', cmcModule3BuildStateRoutes);
    app.use('/api/cmc/module3-os', cmcModule3ConvergenceRoutes);
    /* The Vault document a CMC record was taken from (row D2): link, unlink and
       read evidence under the same Module 3 project guard. */
    app.use('/api/cmc/module3-os', cmcSourceEvidenceRoutes);
    /* `/api/cmc/module3` is gone (server/api/cmc/module3AutoDraftRoutes.ts,
       POST /auto-draft/:projectId, and its engine server/services/cmc/
       auto-draft-composer.ts): a preview composed from documents in the request
       body, which could not write and refused when asked to. An upload becomes
       a canonical source through POST /api/cmc/module3-os/classify-artifact/
       :projectId, and Module 3 is composed from canonical sources, with lineage
       and provenance, by POST /api/cmc/module3-os/compile/:projectId
       (module3OperatingSystemRoutes.ts) and POST /api/cmc/module3-os/
       build-section/:projectId/:sectionKey (module3ConvergenceRoutes.ts). */
    /* `/api/cmc/collaboration` is gone. Its four reads were keyed only by a
       caller-supplied workflowId or userId, over process-global in-memory Maps
       that carried no tenant key at all — so any authenticated user of any
       tenant could read another tenant's workflow discussion by guessing a
       workflowId, and any user's notification inbox, mention text and
       commenter identity included, by passing that user's id. GET
       /team/:workflowId went further: it made a CREDENTIAL-LESS loopback
       request to /api/users, which under the non-production auth boundary
       returns the whole instance's user directory — id, name, email, role,
       last_login — to any caller with any workflowId.

       It could not be scoped where it stood. The Maps have no organization to
       filter on, nothing is persisted (a restart loses every comment, so it
       could never be a GxP collaboration record), and no client called any of
       it — a repo-wide scan of /api/cmc/* literals in client/src returns
       nothing for this router. Adding a tenant key to a store nobody uses is
       building the capability, not fixing the leak.

       THE REPLACEMENT, by path, and both are reachable today:
         · comments and mentions → POST /api/tasks/messages
           (server/routes/taskManagement.routes.ts:1294), which persists the
           message as a notification in the recipient's inbox and refuses a
           recipient outside the caller's org;
         · the team roster → GET /api/task-management/assignees
           (server/routes/taskBoard.routes.ts:335), which is the list
           client/src/concept2cure/v2/editor/AssignReviewDialog.tsx:69 already
           calls for its recipient picker. */
    /* `/api/cmc/documents` is gone (server/api/cmc/documentRoutes.ts): a third
       document store, cmc_documents, with a hard DELETE and author ids taken
       from the request body. Documents → Vault (/api/vault: POST
       /api/vault/ingest, server/routes/vault-ingest.ts), linked to the Module 3
       record they evidence by /api/cmc/module3-os/source-evidence
       (sourceEvidenceRoutes.ts); authored sections → Authoring and the governed
       Module 3 sections (/api/cmc/module3-os/sections). */
    // Module 3 board — portfolio + governed section read-model for the ui-v2 cmc surface.
    app.use('/api/cmc/module3-board', authenticateToken, cmcModule3BoardRoutes());
    // Agency questions — the org-scoped WRITE half of the correspondence loop
    // the board reads (log a question, triage status/assignee/due date).
    app.use('/api/cmc/agency-questions', authenticateToken, cmcAgencyQuestionRoutes());
    // /api/cmc/dashboard removed — backed by Prisma which was excised in
    // 066acdb. Route file (cmc-dashboard-prisma.ts) had zero callers.
    console.log('✅ CMC Module API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount CMC Module routes:', error);
  }

  try {
    // Mount-level auth as every other AI mount carries (the default-deny
    // boundary already covers /api; this keeps the mount honest on its own).
    app.use('/api/ai-assistance', authenticateToken, aiCircuitBreaker, aiAssistanceRoutes);
    app.use('/api/ai', authenticateToken, aiCircuitBreaker, aiAssistanceRoutes);
    const aiProviderRouter = getAIRouter(pool);
    if (aiProviderRouter) setAIService(aiProviderRouter);
    console.log('✅ AI Assistance API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount AI Assistance routes:', error);
  }

  try {
    // Mount-level auth (H2): the control plane is a tenant/admin surface whose
    // handlers assume an authenticated req.user (requireControlPlaneAccess) —
    // no public endpoints inside.
    // REMOVED: /api/intelligent-docs (routes/intelligentDocs.ts) — mounted,
    // auth-gated, and unreachable: zero callers anywhere in the repository
    // (client, server, tests). It fronted its own source/link tables beside
    // the canonical authoring citation store; deleted per the zero-duplication
    // rule rather than left as a parallel write path nothing reads.
    app.use('/api/control-plane', authenticateToken, controlPlaneRouter);
    app.use('/api/pm-settings', pmSettingsRouter);
    console.log('✅ Control Plane + PM Settings routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount core feature routes:', error);
  }

  try {
    app.use('/api/tasks', taskManagementRoutes);
    app.use('/api/regulatory/tasks', unifiedTaskRoutes);
    console.log('✅ Task Management routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Task Management routes:', error);
  }
}
