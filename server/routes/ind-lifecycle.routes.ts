/**
 * IND lifecycle REST surface — composed from five cohesive sub-routers, all
 * merged under /api/ind-lifecycle (authenticateToken applied at the mount in
 * server/bootstrap/register-ind-lifecycle-routes.ts):
 *
 *  - documents.routes  : authoring + rendering (safety report / annual report /
 *                        amendment plan / cover letter / briefing book / envelope)
 *  - filing.routes     : persist a rendered document as an audited eCTD sequence
 *                        (safety-report / annual-report / amendment *file)
 *  - compute.routes    : pure compute — readiness, timeline, clock, action items,
 *                        stateless sequence validation
 *  - sequence.routes   : sequence-scoped — validation, manifest, diff, dispatch
 *                        gate + snapshot, snapshot history
 *  - submission.routes : submission-scoped — overview, dashboard, cockpit, drift
 *
 * Shared helpers (ctx resolution, error mapping, PDF send, body-fragment
 * builders) live in ./ind-lifecycle/shared.ts.
 */

import { Router } from 'express';
import documentsRoutes from './ind-lifecycle/documents.routes';
import filingRoutes from './ind-lifecycle/filing.routes';
import computeRoutes from './ind-lifecycle/compute.routes';
import sequenceRoutes from './ind-lifecycle/sequence.routes';
import submissionRoutes from './ind-lifecycle/submission.routes';
import registersRoutes from './ind-lifecycle/registers.routes';
import { buildIndLifecycleOpenApi } from './ind-lifecycle/openapi';

const router = Router();

// Self-documenting API: the OpenAPI 3.1 spec is generated from the routers
// (cannot drift). Authenticated discovery; no specific role required.
router.get('/openapi.json', (_req, res) => res.json(buildIndLifecycleOpenApi()));

router.use(documentsRoutes);
router.use(filingRoutes);
router.use(computeRoutes);
router.use(sequenceRoutes);
router.use(submissionRoutes);
router.use(registersRoutes);

export default router;
