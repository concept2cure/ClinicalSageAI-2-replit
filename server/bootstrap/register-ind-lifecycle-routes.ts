import type { Express } from 'express';
import { authenticateToken } from '../middleware/auth.js';

/**
 * IND lifecycle route bundle — the Module 1 / RA surfaces added to close the
 * IND lifecycle audit gaps: FDA form generation, sponsor/agent/investigator
 * master data, and the RA lifecycle workflows (safety reports, annual report,
 * amendments).
 *
 * SECURITY: every route is tenant-scoped — form content, master data and
 * lifecycle intents are per-org. authenticateToken at each mount is the
 * backstop; the master-data service is the authoritative tenant/audit boundary.
 */
export async function registerIndLifecycleRoutes(app: Express): Promise<void> {
  try {
    const indFormsRoutes = (await import('../routes/ind-forms.routes')).default;
    app.use('/api/ind-forms', authenticateToken, indFormsRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount IND forms routes:', error.message);
  }

  try {
    const indMasterDataRoutes = (await import('../routes/ind-master-data.routes')).default;
    app.use('/api/ind-master-data', authenticateToken, indMasterDataRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount IND master-data routes:', error.message);
  }

  try {
    const indLifecycleRoutes = (await import('../routes/ind-lifecycle.routes')).default;
    app.use('/api/ind-lifecycle', authenticateToken, indLifecycleRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount IND lifecycle routes:', error.message);
  }

  try {
    const authoringPdfRoutes = (await import('../routes/authoring-pdf.routes')).default;
    app.use('/api/authoring-pdf', authenticateToken, authoringPdfRoutes);
  } catch (error: any) {
    console.error('❌ Failed to mount authoring-PDF routes:', error.message);
  }

  console.log('✅ IND lifecycle route bundle mounted (auth-gated)');
}
