/**
 * Evidence Sufficiency Routes
 *
 *   POST  /api/evidence-sufficiency/programs/:programId/assess
 *   GET   /api/evidence-sufficiency/programs/:programId/assessments  (history)
 *   GET   /api/evidence-sufficiency/assessments/:id
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { authenticateToken } from '../middleware/auth';
import {
  assessSufficiency,
  getAssessment,
  listProgramAssessments,
} from '../services/evidence-sufficiency/evidence-sufficiency.service';
import auditService from '../services/auditService';
import type { SubmissionPathway } from '../../shared/schema/evidence-sufficiency';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(eq(regulatoryPrograms.id, String(req.params.programId)), eq(regulatoryPrograms.organizationId, orgId))
    )
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

const VALID_PATHWAYS: ReadonlySet<SubmissionPathway> = new Set(['PMA', 'DE_NOVO', '510K']);

router.post(
  '/programs/:programId/assess',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    if (!body.pathway || !VALID_PATHWAYS.has(body.pathway)) {
      return res.status(422).json({ error: 'pathway must be PMA, DE_NOVO, or 510K' });
    }
    if (!body.profile || typeof body.profile !== 'object') {
      return res.status(422).json({ error: 'profile (DeviceProfileFlags) is required' });
    }
    const userIdRaw = (req as any).user?.id;
    const triggeredBy =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
    try {
      const result = await assessSufficiency({
        organizationId: orgId,
        programId: String(req.params.programId),
        pathway: body.pathway,
        profile: body.profile,
        claimHealth: body.claimHealth,
        pivotalEndpointsMet:
          typeof body.pivotalEndpointsMet === 'boolean' ? body.pivotalEndpointsMet : null,
        defenseReadinessScore:
          typeof body.defenseReadinessScore === 'number' ? body.defenseReadinessScore : null,
        trigger: typeof body.trigger === 'string' ? body.trigger : 'manual',
        triggeredBy,
        dryRun: body.dryRun === true,
      });

      // Persisted assessments land in the audit trail; dry runs don't.
      if (!body.dryRun) {
        void auditService.logAction({
          tenantId: orgId,
          userId: triggeredBy,
          action: 'evidence_sufficiency.assess',
          resourceType: 'evidence_sufficiency_assessment',
          resourceId: (result as any)?.id ?? req.params.programId,
          details: {
            programId: req.params.programId,
            pathway: body.pathway,
            verdict: (result as any)?.verdict ?? null,
            overallScore: (result as any)?.overallScore ?? null,
            trigger: typeof body.trigger === 'string' ? body.trigger : 'manual',
          },
        });
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: 'Assessment failed', detail: err?.message });
    }
  }
);

router.get(
  '/programs/:programId/assessments',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    try {
      const rows = await listProgramAssessments(orgId, String(req.params.programId), limit);
      res.json({ programId: req.params.programId, assessments: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: 'List failed', detail: err?.message });
    }
  }
);

router.get('/assessments/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  try {
    const row = await getAssessment(orgId, String(req.params.id));
    if (!row) return res.status(404).json({ error: 'Assessment not found' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: 'Fetch failed', detail: err?.message });
  }
});

export default router;
