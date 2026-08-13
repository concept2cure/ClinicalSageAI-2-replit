/**
 * 510(k) device-profile intake + openFDA lookups.
 *
 *   GET  /api/510k/device/profile?ident=        read the program's device profile
 *   PUT  /api/510k/device/profile?ident=        update device intake fields
 *   GET  /api/510k/device/classification?...    openFDA device/classification.json
 *   GET  /api/510k/device/predicates?...        openFDA device/510k.json — the
 *                                               reduced predicate fallback when the
 *                                               predicate-intelligence shadow
 *                                               service is not configured
 *
 * Profile reads/writes are org-scoped against regulatory_programs (uuid or
 * program code ident, mirroring the estar-route resolver). openFDA lookups are
 * honest: unavailable upstream → { available:false, unavailableReason } with
 * empty results, never fabricated rows. Fallback predicate results carry
 * source:'openfda' + reduced:true so no surface can present them as the full
 * predicate-intelligence engine (no SE scoring, no evidence cells).
 */

import { Router } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { authMiddleware } from '../auth';
import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import {
  searchDeviceClassification,
  search510kClearances,
} from '../services/integrations/openfda-device-client';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('510k-device-routes');
const router = Router();
router.use(authMiddleware);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getOrgId(req: any): number | null {
  // First VALID numeric wins — a present-but-non-numeric candidate (e.g. a
  // slug-shaped tenantContext id) must not poison resolution of the later ones.
  for (const candidate of [req.tenantContext?.organizationId, req.user?.organizationId, req.tenantId]) {
    const n = Number(candidate);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/** Resolve a program by uuid or code, org-scoped. Null = not in this org. */
async function findProgram(orgId: number, ident: string) {
  const byUuid = UUID_RE.test(ident);
  const [row] = await db
    .select({
      id: regulatoryPrograms.id,
      name: regulatoryPrograms.name,
      code: regulatoryPrograms.code,
      productName: regulatoryPrograms.productName,
      productType: regulatoryPrograms.productType,
      deviceClass: regulatoryPrograms.deviceClass,
      regulatoryPath: regulatoryPrograms.regulatoryPath,
      productCode: regulatoryPrograms.productCode,
      intendedUse: regulatoryPrograms.intendedUse,
      indication: regulatoryPrograms.indication,
      predicateDevices: regulatoryPrograms.predicateDevices,
    })
    .from(regulatoryPrograms)
    .where(
      and(
        byUuid ? eq(regulatoryPrograms.id, ident) : eq(regulatoryPrograms.code, ident),
        eq(regulatoryPrograms.organizationId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

const identSchema = z.object({ ident: z.string().min(1) });

router.get('/profile', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const parsed = identSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'ident is required' });

  try {
    const program = await findProgram(orgId, parsed.data.ident);
    if (!program) return res.status(404).json({ error: 'Program not found in your organization' });
    return res.status(200).json({ profile: program });
  } catch (error: any) {
    logger.error('device profile read failure', { err: error?.message });
    return res.status(500).json({ error: 'DEVICE_PROFILE_READ_FAILED' });
  }
});

const profilePatchSchema = z
  .object({
    productName: z.string().min(1).max(500).optional(),
    deviceClass: z.enum(['I', 'II', 'III']).optional(),
    regulatoryPath: z.enum(['510k', 'de_novo', 'pma']).optional(),
    productCode: z.string().min(1).max(50).optional(),
    intendedUse: z.string().max(10_000).optional(),
    indication: z.string().max(10_000).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'At least one field is required' });

router.put('/profile', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const identParsed = identSchema.safeParse(req.query);
  if (!identParsed.success) return res.status(400).json({ error: 'ident is required' });
  const patchParsed = profilePatchSchema.safeParse(req.body);
  if (!patchParsed.success) {
    return res.status(400).json({ error: 'Invalid profile patch', details: patchParsed.error.flatten() });
  }

  try {
    const program = await findProgram(orgId, identParsed.data.ident);
    if (!program) return res.status(404).json({ error: 'Program not found in your organization' });

    await db
      .update(regulatoryPrograms)
      .set({ ...patchParsed.data, updatedAt: new Date() })
      .where(
        and(eq(regulatoryPrograms.id, program.id), eq(regulatoryPrograms.organizationId, orgId)),
      );

    const updated = await findProgram(orgId, program.id);
    return res.status(200).json({ profile: updated });
  } catch (error: any) {
    logger.error('device profile update failure', { err: error?.message });
    return res.status(500).json({ error: 'DEVICE_PROFILE_UPDATE_FAILED' });
  }
});

const classificationQuerySchema = z
  .object({
    productCode: z.string().min(1).max(50).optional(),
    deviceName: z.string().min(2).max(300).optional(),
    regulationNumber: z.string().min(1).max(50).optional(),
  })
  .refine((q) => q.productCode || q.deviceName || q.regulationNumber, {
    message: 'productCode, deviceName, or regulationNumber is required',
  });

router.get('/classification', async (req, res) => {
  const parsed = classificationQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }
  const result = await searchDeviceClassification(parsed.data);
  return res.status(200).json(result);
});

const predicatesQuerySchema = z
  .object({
    deviceName: z.string().min(2).max(300).optional(),
    productCode: z.string().min(1).max(50).optional(),
  })
  .refine((q) => q.deviceName || q.productCode, {
    message: 'deviceName or productCode is required',
  });

router.get('/predicates', async (req, res) => {
  const parsed = predicatesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }
  const result = await search510kClearances(parsed.data);
  // reduced:true — real FDA clearance records, but NOT the predicate-
  // intelligence engine (no SE scoring, no evidence). Surfaces must label it.
  return res.status(200).json({ ...result, reduced: true });
});

export default router;
