import type { Express } from 'express';
import clientIntelligenceRoutes from '../routes/client-intelligence';
import accountIntelligenceRoutes from '../routes/account-intelligence';
import universalPackagerRoutes from '../routes/universal-packager';
import precedentEngineRoutes from '../routes/precedent-engine';
import harmonizeRoutes from '../routes/harmonize';
import escalateRoutes from '../routes/escalate';
import validateCompletenessRoutes from '../routes/validate-completeness';
import submissionCenterRoutes from '../routes/submissionCenter.routes';
import submissionCoreRoutes from '../routes/submissions';
import regionProfileRoutes from '../routes/region-profiles';
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
  /* NOT MOUNTED — deliberately, and the router file is kept.
     Zero occurrences of any tenant column in submissionCenter.routes.ts, and
     `submission_projects` / `submission_tasks` were created with no tenant
     column at all, so `0021_enable_rls_everywhere.sql` skips them and there is
     no database backstop either. Any authenticated user of any tenant could
     list every submission programme and `PUT /tasks/:id` across the boundary.
     It has never leaked only because nothing populates those tables.
     And nothing calls it: `SubmissionCenter.tsx` reads `/api/submissions`,
     `/api/510k/estar/*` and `/api/c2c/projects` — never `/api/submission-center`.
     So this is an unscoped write API with no consumer, one INSERT away from
     being a live cross-tenant hole. Unmounting removes that today.
     Restoring it means adding `organization_id`, backfilling, filtering in all
     four handlers and enabling RLS — or deciding the family is superseded by
     `/api/submissions`, which the evidence favours. Either is a product call. */
  void submissionCenterRoutes;
  app.use('/api/submissions', authenticateToken, submissionCoreRoutes);
  app.use('/api/region-profiles', authenticateToken, regionProfileRoutes);
  app.use(
    '/api/regulatory-precedent-intelligence',
    authenticateToken,
    regulatoryPrecedentIntelligenceRoutes,
  );

  console.log('✅ Governance and intelligence route bundle mounted (auth-gated)');
}
