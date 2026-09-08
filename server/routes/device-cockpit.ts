/**
 * Device & IVD program cockpit route.
 *
 * Exposes the cross-pathway readiness rollup (assessDeviceProgram) so the app UI
 * — not just AnA — can show one honest picture across FDA 510(k)/De Novo/PMA and
 * EU MDR/IVDR plus a target market. Pure compute over caller-supplied content;
 * no tenant data is read or written, but auth is required for consistency.
 *
 * POST /api/device-cockpit/assess
 *   body: { leaves, variant, pathways?, market?, availableArtifacts? }
 *   → { data: DeviceProgramAssessment }
 *
 * @module server/routes/device-cockpit
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { authedOrgId } from '../utils/authedOrgId';
import { assessDeviceProgram } from '../services/device-ivd-cockpit/cockpit';

const router = Router();
router.use(authMiddleware);

const leafSchema = z.object({
  sectionCode: z.string(),
  title: z.string(),
  documentType: z.string().optional(),
  // Fails closed: a hand-fed leaf is treated as a draft/placeholder (not
  // substantive) unless the caller explicitly asserts it carries real,
  // finalized content — a title match alone must never count as "present".
  substantive: z.boolean().default(false),
});

const assessSchema = z.object({
  leaves: z.array(leafSchema).default([]),
  variant: z.enum(['device', 'ivd']),
  pathways: z.array(z.enum(['510k', 'de_novo', 'pma', 'mdr', 'ivdr'])).optional(),
  market: z.string().optional(),
  availableArtifacts: z.array(z.string()).optional(),
});

router.post('/assess', (req: Request, res: Response) => {
  // Tenant context required (the endpoint is stateless, but we keep auth uniform).
  const organizationId = authedOrgId(req);
  if (!Number.isFinite(organizationId as number)) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  const parsed = assessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const assessment = assessDeviceProgram({
    leaves: parsed.data.leaves,
    variant: parsed.data.variant,
    pathways: parsed.data.pathways,
    market: parsed.data.market as never,
    availableArtifacts: parsed.data.availableArtifacts,
  });

  return res.json({ data: assessment });
});

export default router;
