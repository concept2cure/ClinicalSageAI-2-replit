/** Global RI — ICH E6 Good Clinical Practice: principles, essential records, responsibilities. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getGcpPrinciples,
  getEssentialDocuments,
  getResponsibilities,
  GCP_STAGES,
  GCP_PARTIES,
  type GcpStage,
  type GcpParty,
} from '../../services/global-ri/gcp-essential-documents';

const router = Router();

/** The ICH E6 GCP principles. */
router.get('/gcp/principles', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getGcpPrinciples());
});

/** Essential records for a trial stage (before/during/after). */
router.get('/gcp/essential-documents/:stage', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const stage = String(Array.isArray(req.params.stage) ? req.params.stage[0] : req.params.stage) as GcpStage;
  if (!GCP_STAGES.includes(stage)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown GCP stage "${stage}" (expected before/during/after).` } });
  }
  res.json(getEssentialDocuments(stage));
});

/** Sponsor or investigator GCP responsibilities. */
router.get('/gcp/responsibilities/:party', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const party = String(Array.isArray(req.params.party) ? req.params.party[0] : req.params.party) as GcpParty;
  if (!GCP_PARTIES.includes(party)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown GCP party "${party}" (expected sponsor/investigator).` } });
  }
  res.json(getResponsibilities(party));
});

export default router;
