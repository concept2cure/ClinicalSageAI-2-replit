import type { RouteBootstrapContext } from './types';
// Canonical JWT auth (server/middleware/auth.ts — extensionless import on
// purpose so the .ts implementation, not the legacy .js twin, is loaded).
import { authenticateToken } from '../middleware/auth';
import templateRoutes from '../api/templates/routes';
import aiRoutes from '../api/ai/routes';
import phase3Routes from '../api/ai/phase3-routes.js';
import { testAssemblyRoutes } from '../routes/test-assembly';
import enterpriseRoutes from '../api/enterprise/routes.js';
import cmcProjectRoutes from '../api/cmc/projectRoutes';
import cmcBlueprintRoutes from '../api/cmc/blueprintRoutes';
import cmcAggregatorRoutes from '../api/cmc/index.js';
import cmcCoreRoutes from '../api/cmc/routes';
import cmcSpecificationRoutes from '../api/cmc/specificationRoutes';
import cmcBatchRecordRoutes from '../api/cmc/batchRecordRoutes';
import cmcWorkflowRoutes from '../api/cmc/workflowRoutes';
import cmcModule3OperatingSystemRoutes from '../api/cmc/module3OperatingSystemRoutes';
import cmcModule3BuildStateRoutes from '../api/cmc/module3BuildStateRoutes';
import cmcModule3ConvergenceRoutes from '../api/cmc/module3ConvergenceRoutes';
import cmcModule3AutoDraftRoutes from '../api/cmc/module3AutoDraftRoutes';
import cmcDocumentRoutes from '../api/cmc/documentRoutes';
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
    app.use('/api/cmc', cmcCoreRoutes);
    app.use('/api/cmc', cmcAggregatorRoutes);
    app.use('/api/cmc', cmcProjectRoutes);
    app.use('/api/cmc/blueprint', cmcBlueprintRoutes);
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
    app.use('/api/cmc/workflows', cmcWorkflowRoutes);
    app.use('/api/cmc/module3-os', cmcModule3OperatingSystemRoutes);
    app.use('/api/cmc/module3-os', cmcModule3BuildStateRoutes);
    app.use('/api/cmc/module3-os', cmcModule3ConvergenceRoutes);
    app.use('/api/cmc/module3', cmcModule3AutoDraftRoutes);
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
    app.use('/api/cmc/documents', cmcDocumentRoutes);
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
