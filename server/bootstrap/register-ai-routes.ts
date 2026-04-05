import type { RouteBootstrapContext } from './types';
import chatRoutes from '../routes/chat';
import indGenerationRoutes from '../routes/ind-generation';
import regulatoryRegistryRoutes from '../routes/regulatory-registry';

export async function registerAiRoutes({ app, pool, aiCircuitBreaker }: RouteBootstrapContext) {
  try {
    const anaFeaturesModule = await import('../routes/ana-features');
    app.use('/api/ana', anaFeaturesModule.default);
  } catch (error) {
    console.error('❌ Failed to mount AnA Features routes:', error);
  }

  try {
    const anaRiModule = await import('../routes/ana-ri');
    app.use('/api/ana-ri', aiCircuitBreaker, anaRiModule.default);
  } catch (error) {
    console.error('❌ Failed to mount AnA RI routes:', error);
  }

  try {
    const firecrawlRoutes = await import('../routes/firecrawl');
    const externalEvidenceRoutes = await import('../routes/external-evidence');
    const workspaceToolSettingsRoutes = await import('../routes/workspace-tool-settings');
    app.use('/api/firecrawl', firecrawlRoutes.default);
    app.use('/api/external-evidence', externalEvidenceRoutes.default);
    app.use('/api/workspace-tool-settings', workspaceToolSettingsRoutes.default);
  } catch (error) {
    console.error('❌ Failed to mount external evidence routes:', error);
  }

  app.use('/api/chat', chatRoutes);
  app.use('/api/ind-generation', indGenerationRoutes);
  app.use('/api/regulatory', regulatoryRegistryRoutes);

  try {
    const claimsModule = await import('../routes/ai-claims-routes');
    app.use('/api/ai', claimsModule.default(pool));
  } catch (error) {
    console.error('❌ Failed to mount AI Claims routes:', error);
  }

  try {
    const claudeIntelligenceRoutes = await import('../routes/claude-intelligence.ts');
    app.use('/api/claude', claudeIntelligenceRoutes.default);
  } catch (error) {
    console.error('❌ Failed to mount Claude Intelligence routes:', error);
  }
}
