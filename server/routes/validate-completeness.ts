/**
 * VALIDATE-COMPLETENESS API Routes
 *
 * Returns rule-based completeness, RTF risk, and Go/No-Go decision. When
 * `withPredictive: true` is passed (and a tenant context is available), the
 * response also includes the Regulatory Intelligence layer's predictive
 * CRL/RTF/first-cycle scores, blended with cross-tenant priors.
 *
 * @module server/routes/validate-completeness
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateCompletenessEngine } from '../services/validate-completeness-engine';
import { authMiddleware } from '../auth.js';
import { authedOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('validate-completeness-routes');

router.use(authMiddleware);

const ValidateSchema = z.object({
  submissionType: z.string().min(1),
  presentSections: z.array(z.string()),
  sectionScores: z.record(z.string(), z.number()).optional(),
  harmonizeIssueCount: z.number().int().min(0).optional(),
  openEscalations: z.number().int().min(0).optional(),
  targetAgency: z.string().optional(),
  // Predictive-layer fields. All optional; the legacy callers continue to
  // receive the rule-based response unchanged.
  withPredictive: z.boolean().optional(),
  projectId: z.number().int().positive().optional(),
  submissionId: z.string().optional(),
  therapeuticArea: z.string().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'validate-completeness', timestamp: new Date().toISOString() });
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const parsed = ValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }

    // Predictive path: tenant context required.
    if (parsed.data.withPredictive) {
      const orgId = authedOrgId(req);
      if (orgId == null) {
        // Degrade gracefully — return the rule-based result with a note
        // rather than failing the whole request, so the UI keeps working.
        log.warn('Predictive scoring requested but tenant context unavailable; returning rule-based result only');
        const result = await validateCompletenessEngine.validate(parsed.data);
        return res.json({
          success: true,
          data: result,
          predictiveUnavailable: 'tenant_context_required',
        });
      }
      const { scoreSubmissionDraft } = await import('../services/intelligence/regulatory-intelligence');
      const result = await scoreSubmissionDraft({
        organizationId: orgId,
        projectId: parsed.data.projectId,
        submissionId: parsed.data.submissionId,
        submissionType: parsed.data.submissionType,
        targetAgency: parsed.data.targetAgency,
        therapeuticArea: parsed.data.therapeuticArea,
        presentSections: parsed.data.presentSections,
        sectionScores: parsed.data.sectionScores,
        harmonizeIssueCount: parsed.data.harmonizeIssueCount,
        openEscalations: parsed.data.openEscalations,
      });
      return res.json({ success: true, data: result });
    }

    const result = await validateCompletenessEngine.validate(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`VALIDATE-COMPLETENESS failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
