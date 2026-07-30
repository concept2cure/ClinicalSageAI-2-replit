/**
 * Study Archetype registry — read-only API (MDX-STUDY-01).
 *
 * Serves the versioned device / IVD study-archetype registry defined in
 * shared/regulatory/study-archetypes.ts. Mounted at /api/mdx:
 *
 *   GET /api/mdx/study-archetypes?specialization=<opt>
 *
 * When `specialization` is provided the list is filtered to archetypes
 * applicable to that specialization; otherwise the full registry is
 * returned. This is a static, read-only registry — no database, no tenant
 * data — so it needs neither org scoping nor auditing.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { ok, clientError } from '../lib/api-response';
import {
  REGISTRY_VERSION,
  listArchetypes,
  archetypesForSpecialization,
  type StudySpecialization,
} from '../../shared/regulatory/study-archetypes';

const router = Router();

const SPECIALIZATIONS: readonly StudySpecialization[] = [
  'medical_device',
  'ivd_diagnostics',
  'samd',
  'companion_diagnostic',
  'combination_product',
  'both',
];

const listQuery = z.object({
  specialization: z.enum(SPECIALIZATIONS as [StudySpecialization, ...StudySpecialization[]]).optional(),
});

/* ─── GET /api/mdx/study-archetypes ───────────────────────────────── */

router.get('/study-archetypes', (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const { specialization } = parsed.data;
  const archetypes = specialization
    ? archetypesForSpecialization(specialization)
    : listArchetypes();

  return ok(res, archetypes, {
    registryVersion: REGISTRY_VERSION,
    count: archetypes.length,
    specialization: specialization ?? null,
  });
});

export default router;
