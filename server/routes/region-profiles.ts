/**
 * Region profiles API (spec §8.3) — GET /api/region-profiles
 *
 * Static, deterministic region metadata (Module 1 structure, forms, pathways,
 * rule-pack size) the submission UI needs. Read-only and not tenant-specific
 * (regional rules are the same for every org), but auth-gated at mount.
 */

import { Router, Request, Response } from 'express';
import { getAllSubmissionRegionProfiles, getSubmissionRegionProfile } from '../services/region-profiles/region-profile-service';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(getAllSubmissionRegionProfiles());
});

router.get('/:region', (req: Request, res: Response) => {
  const region = Array.isArray(req.params.region) ? req.params.region[0] : req.params.region;
  const profile = getSubmissionRegionProfile(String(region));
  if (!profile) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown region "${region}" (expected fda | eu | jp).` } });
  }
  res.json(profile);
});

export default router;
