import type { Express } from 'express';
import clientIntelligenceRoutes from '../routes/client-intelligence';
import accountIntelligenceRoutes from '../routes/account-intelligence';
import universalPackagerRoutes from '../routes/universal-packager';
import precedentEngineRoutes from '../routes/precedent-engine';
import harmonizeRoutes from '../routes/harmonize';
import escalateRoutes from '../routes/escalate';
import validateCompletenessRoutes from '../routes/validate-completeness';
import submissionCenterRoutes from '../routes/submissionCenter.routes';
import regulatoryPrecedentIntelligenceRoutes from '../routes/regulatory-precedent-intelligence';

export async function registerGovernanceRoutes(app: Express) {
  try {
    const resolutionRoutes = (await import('../routes/resolution')).default;
    app.use('/api/resolution', resolutionRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Resolution routes:', error.message);
  }

  try {
    const operatingSystemRoutes = (await import('../routes/operating-system')).default;
    app.use('/api/operating-system', operatingSystemRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Operating System routes:', error.message);
  }

  try {
    const governedIntelRoutes = (await import('../routes/assumption-decision-contradiction')).default;
    app.use('/api/governed-intelligence', governedIntelRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Governed Intelligence routes:', error.message);
  }

  app.use('/api/client-intelligence', clientIntelligenceRoutes);
  app.use('/api/account-intelligence', accountIntelligenceRoutes);
  app.use('/api/packager', universalPackagerRoutes);
  app.use('/api/precedent-engine', precedentEngineRoutes);
  app.use('/api/harmonize', harmonizeRoutes);
  app.use('/api/escalate', escalateRoutes);
  app.use('/api/validate-completeness', validateCompletenessRoutes);
  app.use('/api/submission-center', submissionCenterRoutes);
  app.use('/api/regulatory-precedent-intelligence', regulatoryPrecedentIntelligenceRoutes);

  console.log('✅ Governance and intelligence route bundle mounted');
}
