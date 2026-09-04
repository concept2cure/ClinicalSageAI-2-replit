/**
 * 510(k) device-profile intake + openFDA lookups.
 *
 *   GET  /api/510k/device/profile?ident=        read the program's device profile
 *   PUT  /api/510k/device/profile?ident=        update device intake fields — including
 *                                               the five device-level eSTAR
 *                                               administrative facts (common name,
 *                                               classification name, regulation
 *                                               number, associated product codes,
 *                                               IFU citation), which the official
 *                                               eSTAR is filled from; '' or null
 *                                               CLEARS one
 *   GET  /api/510k/device/classification?...    openFDA device/classification.json
 *   GET  /api/510k/device/predicates?...        openFDA device/510k.json — the
 *                                               reduced predicate fallback when the
 *                                               predicate-intelligence shadow
 *                                               service is not configured
 *   GET  /api/510k/device/standards?...         FDA recognized consensus standards
 *                                               for the profile's product code, from
 *                                               the vendored recognition list
 *
 * Profile reads/writes are org-scoped against regulatory_programs (uuid or
 * program code ident, mirroring the estar-route resolver). The WRITE is editor+
 * (the same role gate the sibling registration write carries) and audited
 * DEVICE_PROFILE_UPDATED against the session's actor. openFDA lookups are
 * honest: unavailable upstream → { available:false, unavailableReason } with
 * empty results, never fabricated rows. Fallback predicate results carry
 * source:'openfda' + reduced:true so no surface can present them as the full
 * predicate-intelligence engine (no SE scoring, no evidence cells).
 *
 * The standards lookup is NOT an openFDA call — openFDA has no recognized-
 * consensus-standards endpoint. It reads the vendored FDA recognition list
 * (assets/fda-recognized-standards/) and reports an explicitly labelled
 * unavailable state when that dataset has not been dropped in, rather than
 * offering a plausible list of standards nobody at FDA published.
 */

import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { authMiddleware } from '../auth';
import { requireEntitlement } from '../services/entitlements/require-entitlement';
import auditService from '../services/auditService';
import { requestDb } from '../db/requestDb';
import { regulatoryPrograms } from '../../shared/schema/programs';
import {
  searchDeviceClassification,
  search510kClearances,
} from '../services/integrations/openfda-device-client';
import { lookupRecognizedStandards } from '../services/fda-recognized-standards/recognized-standards.service';
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

/**
 * Resolve a program by uuid or code, org-scoped. Null = not in this org.
 *
 * Takes `req` so the read runs on the REQUEST-SCOPED client (`requestDb`) rather
 * than the shared pool. The explicit `organization_id` predicate below is the
 * primary boundary; the request-scoped client is the RLS one underneath it, so
 * a future predicate slip fails closed instead of reading across tenants.
 */
async function findProgram(req: Request, orgId: number, ident: string) {
  const byUuid = UUID_RE.test(ident);
  const [row] = await requestDb(req)
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
      // The device-level eSTAR administrative facts (WO-8 Phase 3) — the
      // governed sources the official form's 510(k) Summary, Classification
      // and Labeling fields are filled from.
      commonName: regulatoryPrograms.commonName,
      classificationName: regulatoryPrograms.classificationName,
      regulationNumber: regulatoryPrograms.regulationNumber,
      associatedProductCodes: regulatoryPrograms.associatedProductCodes,
      indicationsForUseCitation: regulatoryPrograms.indicationsForUseCitation,
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

/**
 * The role gate every governed eSTAR write already carries — the SAME set and
 * the same shape as `requireEditorAccess` in server/routes/510k-estar-routes.ts,
 * which guards the sibling write PUT /api/510k/estar/registration (that file is
 * where the copy this one mirrors lives; cerv2-export-routes and cerv2-ai-routes
 * carry the same one, none of them exports it).
 *
 * It is a ROLE check, and `requireEntitlement` is not: entitlements are a
 * subscription-TIER check that is a no-op unless ENTITLEMENTS_ENFORCE is set, so
 * on its own it let any authenticated member of the org — a read-only viewer
 * included — rewrite the device facts printed on a filed FDA submission.
 * Ordered ahead of the entitlement middleware, exactly as the sibling does.
 */
const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const orgId = tenantOrg || userOrg;
  if (!orgId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const numericOrgId = Number(orgId);
  if (!Number.isFinite(numericOrgId) || numericOrgId <= 0) {
    return res.status(400).json({ error: 'Valid numeric organization context required' });
  }
  req.resolvedOrganizationId = numericOrgId;
  return next();
};

/**
 * The acting user, from the SESSION only. Null when nothing numeric resolves —
 * the write is then refused rather than audited against an invented actor
 * (scripts/ci/check-fabricated-identity: a column that must be filled is never a
 * reason to manufacture an identity).
 */
function getActorId(req: any): number | null {
  const n = Number(req.userId ?? req.user?.id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const identSchema = z.object({ ident: z.string().min(1) });

router.get('/profile', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const parsed = identSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'ident is required' });

  try {
    const program = await findProgram(req, orgId, parsed.data.ident);
    if (!program) return res.status(404).json({ error: 'Program not found in your organization' });
    return res.status(200).json({ profile: program });
  } catch (error: any) {
    logger.error('device profile read failure', { err: error?.message });
    return res.status(500).json({ error: 'DEVICE_PROFILE_READ_FAILED' });
  }
});

/**
 * A nullable text intake field: absent ⇒ untouched; '' / whitespace / null ⇒
 * CLEARED (stored NULL, so the eSTAR projection reports the key blank rather
 * than writing an empty string into the official form); otherwise the trimmed
 * string. `max` bounds the raw input before trimming.
 */
const clearableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      const t = v === null ? '' : v.trim();
      return t.length > 0 ? t : null;
    });

const profilePatchSchema = z
  .object({
    productName: z.string().min(1).max(500).optional(),
    deviceClass: z.enum(['I', 'II', 'III']).optional(),
    regulatoryPath: z.enum(['510k', 'de_novo', 'pma']).optional(),
    productCode: z.string().min(1).max(50).optional(),
    intendedUse: z.string().max(10_000).optional(),
    indication: z.string().max(10_000).optional(),
    // The device-level eSTAR administrative facts (WO-8 Phase 3). Each may be
    // cleared, because a fact the platform does not hold must be BLANK on the
    // official form, never a stale value.
    commonName: clearableText(500),
    classificationName: clearableText(500),
    regulationNumber: clearableText(50),
    associatedProductCodes: clearableText(500),
    indicationsForUseCitation: clearableText(1000),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), { message: 'At least one field is required' });

// The device-profile WRITE is a governed FDA-submission write: editor+ ROLE
// first (requireEditorAccess), then the device_assembly_readiness capability
// (ENTITLEMENTS_ENFORCE: off|warn|on). Reads stay open.
router.put('/profile', requireEditorAccess, requireEntitlement('device_assembly_readiness'), async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  // Part 11 §11.10(e): an inspector must be able to ask WHO set the device facts
  // that appear on the filed form, so no actor ⇒ no write.
  const actorId = getActorId(req);
  if (actorId === null) return res.status(403).json({ error: 'Authenticated actor required' });
  const identParsed = identSchema.safeParse(req.query);
  if (!identParsed.success) return res.status(400).json({ error: 'ident is required' });
  const patchParsed = profilePatchSchema.safeParse(req.body);
  if (!patchParsed.success) {
    return res.status(400).json({ error: 'Invalid profile patch', details: patchParsed.error.flatten() });
  }

  try {
    const program = await findProgram(req, orgId, identParsed.data.ident);
    if (!program) return res.status(404).json({ error: 'Program not found in your organization' });

    // Only the fields the body named reach the UPDATE: an absent clearable
    // field is `undefined` after parsing and must not be written as NULL.
    const patch = Object.fromEntries(
      Object.entries(patchParsed.data).filter(([, v]) => v !== undefined),
    ) as Partial<typeof patchParsed.data>;
    await requestDb(req)
      .update(regulatoryPrograms)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(eq(regulatoryPrograms.id, program.id), eq(regulatoryPrograms.organizationId, orgId)),
      );

    // Audited like the sibling governed write (upsertEstarRegistration): the
    // real actor and org from the session, the program as the resource, and the
    // NAMES of the fields this patch changed — the device facts an inspector
    // reads off the filed form.
    await auditService.logAction({
      organizationId: orgId,
      userId: actorId,
      action: 'DEVICE_PROFILE_UPDATED',
      resourceType: 'regulatory_program',
      resourceId: program.id,
      details: { fields: Object.keys(patch) },
    });

    const updated = await findProgram(req, orgId, program.id);
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

const standardsQuerySchema = z
  .object({
    ident: z.string().min(1).optional(),
    productCode: z.string().min(1).max(50).optional(),
  })
  .refine((q) => q.ident || q.productCode, {
    message: 'ident or productCode is required',
  });

/**
 * Recognized consensus standards for a device's product code.
 *
 * Org-scoped two ways, and both matter. The caller must carry an organization
 * (403 otherwise), and when `ident` is supplied the program is resolved through
 * the same `findProgram` used by /profile — request-scoped client, explicit
 * organization_id predicate — so a program in another tenant answers 404 and
 * never leaks its product code. An explicit `productCode` wins over the
 * program's own, which lets the intake panel look up a code the operator has
 * typed but not yet saved.
 *
 * Answers 200 with a labelled envelope rather than an error when there is no
 * product code or no vendored dataset: those are honest states the surface has
 * to render, not request failures.
 */
router.get('/standards', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });
  const parsed = standardsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
  }

  try {
    let productCode = parsed.data.productCode?.trim() || null;
    if (parsed.data.ident) {
      const program = await findProgram(req, orgId, parsed.data.ident);
      if (!program) return res.status(404).json({ error: 'Program not found in your organization' });
      if (!productCode) productCode = program.productCode ?? null;
    }
    const result = await lookupRecognizedStandards(productCode);
    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('recognized standards lookup failure', { err: error?.message });
    return res.status(500).json({ error: 'RECOGNIZED_STANDARDS_LOOKUP_FAILED' });
  }
});

export default router;
