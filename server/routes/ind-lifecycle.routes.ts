/**
 * IND lifecycle REST surface — composed from three cohesive sub-routers, all
 * merged under /api/ind-lifecycle (authenticateToken applied at the mount in
 * server/bootstrap/register-ind-lifecycle-routes.ts):
 *
 *  - documents.routes : authoring + rendering (safety report / annual report /
 *                       amendment plan / cover letter / briefing book / envelope)
 *  - filing.routes    : persist a rendered document as an audited eCTD sequence
 *                       (safety-report / annual-report / amendment *file)
 *  - analysis.routes  : readiness, clock, timeline, action items, sequence
 *                       validation, submission overview/dashboard
 *
 * Shared helpers (ctx resolution, error mapping, PDF send) live in
 * ./ind-lifecycle/shared.ts.
 */

import { Router } from 'express';
import documentsRoutes from './ind-lifecycle/documents.routes';
import filingRoutes from './ind-lifecycle/filing.routes';
import analysisRoutes from './ind-lifecycle/analysis.routes';

const router = Router();

router.use(documentsRoutes);
router.use(filingRoutes);
router.use(analysisRoutes);

export default router;
