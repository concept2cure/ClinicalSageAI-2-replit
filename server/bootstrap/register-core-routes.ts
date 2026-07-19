import type { RouteBootstrapContext } from './types';
// Canonical JWT auth (server/middleware/auth.ts — extensionless import on
// purpose so the .ts implementation, not the legacy .js twin, is loaded).
import { authenticateToken } from '../middleware/auth';
import templateRoutes from '../api/templates/routes';
import aiRoutes from '../api/ai/routes';
import phase3Routes from '../api/ai/phase3-routes.js';
import { testAssemblyRoutes } from '../routes/test-assembly';
import enterpriseRoutes from '../api/enterprise/routes.js';
import rbacRoutes from '../api/enterprise/rbac-routes.js';
import cmcProjectRoutes from '../api/cmc/projectRoutes';
import cmcBlueprintRoutes from '../api/cmc/blueprintRoutes';
import cmcAggregatorRoutes from '../api/cmc/index.js';
import cmcCoreRoutes from '../api/cmc/routes';
import cmcSpecificationRoutes from '../api/cmc/specificationRoutes';
import cmcStabilityRoutes from '../api/cmc/stabilityRoutes';
import cmcBatchRecordRoutes from '../api/cmc/batchRecordRoutes';
import cmcWorkflowRoutes from '../api/cmc/workflowRoutes';
import cmcModule3OperatingSystemRoutes from '../api/cmc/module3OperatingSystemRoutes';
import cmcModule3BuildStateRoutes from '../api/cmc/module3BuildStateRoutes';
import cmcModule3ConvergenceRoutes from '../api/cmc/module3ConvergenceRoutes';
import cmcModule3AutoDraftRoutes from '../api/cmc/module3AutoDraftRoutes';
import cmcCollaborationRoutes from '../api/cmc/collaborationRoutes';
import cmcDocumentRoutes from '../api/cmc/documentRoutes';
import aiAssistanceRoutes, { setAIService } from '../routes/ai-assistance';
import intelligentDocsRoutes from '../routes/intelligentDocs';
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
  app.use('/api/enterprise/rbac', rbacRoutes);

  try {
    app.use('/api/cmc', cmcCoreRoutes);
    app.use('/api/cmc', cmcAggregatorRoutes);
    app.use('/api/cmc', cmcProjectRoutes);
    app.use('/api/cmc/blueprint', cmcBlueprintRoutes);
    app.use('/api/cmc/specifications', cmcSpecificationRoutes);
    app.use('/api/cmc/stability', cmcStabilityRoutes);
    app.use('/api/cmc/batch-records', cmcBatchRecordRoutes);
    app.use('/api/cmc/workflows', cmcWorkflowRoutes);
    app.use('/api/cmc/module3-os', cmcModule3OperatingSystemRoutes);
    app.use('/api/cmc/module3-os', cmcModule3BuildStateRoutes);
    app.use('/api/cmc/module3-os', cmcModule3ConvergenceRoutes);
    app.use('/api/cmc/module3', cmcModule3AutoDraftRoutes);
    app.use('/api/cmc/collaboration', cmcCollaborationRoutes);
    app.use('/api/cmc/documents', cmcDocumentRoutes);
    // /api/cmc/dashboard removed — backed by Prisma which was excised in
    // 066acdb. Route file (cmc-dashboard-prisma.ts) had zero callers.
    console.log('✅ CMC Module API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount CMC Module routes:', error);
  }

  try {
    app.use('/api/ai-assistance', aiCircuitBreaker, aiAssistanceRoutes);
    app.use('/api/ai', aiCircuitBreaker, aiAssistanceRoutes);
    const aiProviderRouter = getAIRouter(pool);
    if (aiProviderRouter) setAIService(aiProviderRouter);
    console.log('✅ AI Assistance API routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount AI Assistance routes:', error);
  }

  try {
    // Mount-level auth (H2): both families are tenant/admin surfaces whose
    // handlers assume an authenticated req.user (getSecureOrgId /
    // requireControlPlaneAccess) — no public endpoints inside.
    app.use('/api/intelligent-docs', authenticateToken, intelligentDocsRoutes);
    app.use('/api/control-plane', authenticateToken, controlPlaneRouter);
    app.use('/api/pm-settings', pmSettingsRouter);
    console.log('✅ Intelligent Docs + PM Settings routes mounted');
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
