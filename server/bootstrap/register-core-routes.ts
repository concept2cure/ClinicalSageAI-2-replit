import type { RouteBootstrapContext } from './types';
import templateRoutes from '../api/templates/routes';
import aiRoutes from '../api/ai/routes';
import phase3Routes from '../api/ai/phase3-routes.js';
import { testAssemblyRoutes } from '../routes/test-assembly';
import enterpriseRoutes from '../api/enterprise/routes.js';
import rbacRoutes from '../api/enterprise/rbac-routes.js';
import cmcProjectRoutes from '../api/cmc/projectRoutes';
import cmcBlueprintRoutes from '../api/cmc/blueprintRoutes';
import cmcDashboardRoutes from '../routes/cmc-dashboard';
import cmcAggregatorRoutes from '../api/cmc/index.js';
import cmcDashboardPrisma from '../routes/cmc-dashboard-prisma';
import cmcCoreRoutes from '../api/cmc/routes';
import cmcSpecificationRoutes from '../api/cmc/specificationRoutes';
import cmcStabilityRoutes from '../api/cmc/stabilityRoutes';
import cmcBatchRecordRoutes from '../api/cmc/batchRecordRoutes';
import cmcWorkflowRoutes from '../api/cmc/workflowRoutes';
import cmcCollaborationRoutes from '../api/cmc/collaborationRoutes';
import cmcDocumentRoutes from '../api/cmc/documentRoutes';
import aiAssistanceRoutes, { setAIService } from '../routes/ai-assistance';
import intelligentDocsRoutes from '../routes/intelligentDocs';
import controlPlaneRouter from '../src/routes/control-plane.router';
import pmSettingsRouter from '../src/routes/pm-settings.router';
import { getAIRouter } from '../services/aiProviderRouter.js';

export function registerCoreRoutes({ app, pool, aiCircuitBreaker }: RouteBootstrapContext) {
  app.use('/api/templates', templateRoutes);
  app.use('/api/ai', aiCircuitBreaker, aiRoutes);
  app.use('/api/test-assembly', testAssemblyRoutes(pool));
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
    app.use('/api/cmc/collaboration', cmcCollaborationRoutes);
    app.use('/api/cmc/documents', cmcDocumentRoutes);
    app.use('/api/cmc/dashboard-legacy', cmcDashboardRoutes);
    app.use('/api/cmc/dashboard', cmcDashboardPrisma);
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
    app.use('/api/intelligent-docs', intelligentDocsRoutes);
    app.use('/api/control-plane', controlPlaneRouter);
    app.use('/api/pm-settings', pmSettingsRouter);
    console.log('✅ Intelligent Docs + PM Settings routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount core feature routes:', error);
  }
}
