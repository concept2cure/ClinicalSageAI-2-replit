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
import { authenticateToken } from '../middleware/auth.js';

// SECURITY: every governance / intelligence route is tenant-scoped —
// resolution decisions, precedent matching, submission-center status,
// account intelligence are all per-org operations. None should ever
// be reachable without a JWT. authenticateToken at each mount is the
// backstop; individual handlers are responsible for tenant isolation
// of the data they query.
export async function registerGovernanceRoutes(app: Express) {
  try {
    const resolutionRoutes = (await import('../routes/resolution')).default;
    app.use('/api/resolution', authenticateToken, resolutionRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Resolution routes:', error.message);
  }

  try {
    const operatingSystemRoutes = (await import('../routes/operating-system')).default;
    app.use('/api/operating-system', authenticateToken, operatingSystemRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Operating System routes:', error.message);
  }

  try {
    const governedIntelRoutes = (await import('../routes/assumption-decision-contradiction')).default;
    app.use('/api/governed-intelligence', authenticateToken, governedIntelRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount Governed Intelligence routes:', error.message);
  }

  app.use('/api/client-intelligence', authenticateToken, clientIntelligenceRoutes);
  app.use('/api/account-intelligence', authenticateToken, accountIntelligenceRoutes);
  app.use('/api/packager', authenticateToken, universalPackagerRoutes);
  app.use('/api/precedent-engine', authenticateToken, precedentEngineRoutes);
  app.use('/api/harmonize', authenticateToken, harmonizeRoutes);
  app.use('/api/escalate', authenticateToken, escalateRoutes);
  app.use('/api/validate-completeness', authenticateToken, validateCompletenessRoutes);
  app.use('/api/submission-center', authenticateToken, submissionCenterRoutes);
  app.use(
    '/api/regulatory-precedent-intelligence',
    authenticateToken,
    regulatoryPrecedentIntelligenceRoutes,
  );

  console.log('✅ Governance and intelligence route bundle mounted (auth-gated)');
}
