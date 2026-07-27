/**
 * Industry-context profiles + effective-context resolver API (CONTEXT-01/02/03).
 *
 * Governed, tenant-scoped replacement for the free-text industry_mode column,
 * the localStorage admin blob, and the onboarding mock. Mounted at /api/mdx:
 *
 *   GET   /api/mdx/industry-profile                          org profile
 *   PATCH /api/mdx/industry-profile                          upsert org profile (audited)
 *   GET   /api/mdx/projects/:programId/industry-profile      project profile
 *   PATCH /api/mdx/projects/:programId/industry-profile      upsert project profile (audited)
 *   GET   /api/mdx/effective-context?programId=              resolved context
 *
 * Every write is tenant-scoped and audit-logged. Reads return null-safe
 * payloads so the Admin UI can render an "unset" state honestly rather than
 * inventing defaults.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { requestDb } from '../db/requestDb';
import {
  organizationIndustryProfiles,
  projectIndustryProfiles,
} from '../../shared/schema';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { ok, clientError, orgRequired, notFoundInTenant, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import auditService from '../services/auditService';
import { resolveEffectiveProjectContext } from '../services/industry-context/resolver';

const router = Router();
const log = createScopedLogger('mdx-industry-context');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRIMARY_INDUSTRY = [
  'medical_device_diagnostics', 'biotech_pharma', 'cro',
  'regulatory_consulting', 'academic_research',
] as const;
const MDX_SPECIALIZATION = [
  'medical_device', 'ivd_diagnostics', 'both', 'samd',
  'companion_diagnostic', 'combination_product',
] as const;
const APPROVAL_RIGOR = [
  'single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required',
] as const;
const VERTICAL = ['mdx', 'biopharma'] as const;
const strArray = z.array(z.string().max(120)).max(50);

/* ─── Org industry profile ───────────────────────────────────────── */

const orgPatch = z.object({
  primaryIndustry: z.enum(PRIMARY_INDUSTRY),
  mdxSpecialization: z.enum(MDX_SPECIALIZATION).optional().nullable(),
  defaultMarkets: strArray.optional(),
  defaultPathways: strArray.optional(),
  defaultApprovalRigor: z.enum(APPROVAL_RIGOR).optional().nullable(),
});

router.get('/industry-profile', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const db = requestDb(req);
    const [row] = await db
      .select()
      .from(organizationIndustryProfiles)
      .where(eq(organizationIndustryProfiles.organizationId, orgId))
      .limit(1);
    return ok(res, row ?? null);
  } catch (err) {
    return serverError(res, log, 'get-org-profile', err);
  }
});

router.patch('/industry-profile', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parsed = orgPatch.safeParse(body);
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const userId = getUserId(req);
  try {
    // Partial update: only fields present in the request body are written, so a
    // single-field PATCH cannot null out the rest. primaryIndustry is required.
    const fields: Record<string, unknown> = { primaryIndustry: p.primaryIndustry };
    if ('mdxSpecialization' in body) fields.mdxSpecialization = p.mdxSpecialization ?? null;
    if ('defaultMarkets' in body) fields.defaultMarkets = p.defaultMarkets ?? [];
    if ('defaultPathways' in body) fields.defaultPathways = p.defaultPathways ?? [];
    if ('defaultApprovalRigor' in body) fields.defaultApprovalRigor = p.defaultApprovalRigor ?? null;
    const now = new Date();
    const db = requestDb(req);
    const [row] = await db
      .insert(organizationIndustryProfiles)
      .values({ organizationId: orgId, updatedBy: userId, updatedAt: now, ...fields } as any)
      .onConflictDoUpdate({
        target: organizationIndustryProfiles.organizationId,
        set: { ...fields, updatedBy: userId, updatedAt: now },
      })
      .returning();
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'update',
      resourceType: 'organization_industry_profile',
      resourceId: orgId,
      details: { primaryIndustry: p.primaryIndustry, mdxSpecialization: p.mdxSpecialization ?? null },
    });
    return ok(res, row);
  } catch (err) {
    return serverError(res, log, 'patch-org-profile', err);
  }
});

/* ─── Project industry profile ───────────────────────────────────── */

const projPatch = z.object({
  vertical: z.enum(VERTICAL).optional().nullable(),
  specialization: z.enum(MDX_SPECIALIZATION).optional().nullable(),
  productType: z.string().max(120).optional().nullable(),
  lifecycleStage: z.string().max(60).optional().nullable(),
  targetMarkets: strArray.optional(),
  regulatoryPathways: strArray.optional(),
  filingTypes: strArray.optional(),
});

router.get('/projects/:programId/industry-profile', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const db = requestDb(req);
    const [row] = await db
      .select()
      .from(projectIndustryProfiles)
      .where(and(
        eq(projectIndustryProfiles.programId, programId),
        eq(projectIndustryProfiles.organizationId, orgId),
      ))
      .limit(1);
    return ok(res, row ?? null);
  } catch (err) {
    return serverError(res, log, 'get-project-profile', err);
  }
});

router.patch('/projects/:programId/industry-profile', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const parsed = projPatch.safeParse(body);
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const userId = getUserId(req);
  try {
    const db = requestDb(req);
    // Ownership: the program must belong to the caller's org. program_id has no
    // FK to regulatory_programs, so without this a caller could squat or
    // overwrite a profile for another tenant's program id.
    const [prog] = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(and(
        eq(regulatoryPrograms.id, programId),
        eq(regulatoryPrograms.organizationId, orgId),
      ))
      .limit(1);
    if (!prog) return notFoundInTenant(res, 'Program');

    // Partial update: only fields present in the body are written.
    const fields: Record<string, unknown> = {};
    if ('vertical' in body) fields.vertical = p.vertical ?? null;
    if ('specialization' in body) fields.specialization = p.specialization ?? null;
    if ('productType' in body) fields.productType = p.productType ?? null;
    if ('lifecycleStage' in body) fields.lifecycleStage = p.lifecycleStage ?? null;
    if ('targetMarkets' in body) fields.targetMarkets = p.targetMarkets ?? [];
    if ('regulatoryPathways' in body) fields.regulatoryPathways = p.regulatoryPathways ?? [];
    if ('filingTypes' in body) fields.filingTypes = p.filingTypes ?? [];
    const now = new Date();
    const [row] = await db
      .insert(projectIndustryProfiles)
      .values({
        programId,
        organizationId: orgId,
        inheritedFromOrg: false,
        updatedBy: userId,
        updatedAt: now,
        ...fields,
      } as any)
      .onConflictDoUpdate({
        target: projectIndustryProfiles.programId,
        // Defense-in-depth against a legacy cross-tenant row: only update when
        // the existing row is this org's. A mismatch updates nothing → 409.
        where: eq(projectIndustryProfiles.organizationId, orgId),
        set: { ...fields, inheritedFromOrg: false, updatedBy: userId, updatedAt: now },
      })
      .returning();
    if (!row) {
      return clientError(res, 409, 'Project profile is owned by another tenant');
    }
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'update',
      resourceType: 'project_industry_profile',
      resourceId: programId,
      details: { vertical: p.vertical ?? null, specialization: p.specialization ?? null },
    });
    return ok(res, row);
  } catch (err) {
    return serverError(res, log, 'patch-project-profile', err);
  }
});

/* ─── Effective context (resolver output) ────────────────────────── */

router.get('/effective-context', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.programId === 'string' ? req.query.programId : null;
  if (programId && !UUID_RE.test(programId)) {
    return clientError(res, 422, 'programId must be a UUID');
  }
  try {
    const ctx = await resolveEffectiveProjectContext({
      organizationId: orgId,
      projectId: programId,
      userId: getUserId(req),
    });
    return ok(res, ctx);
  } catch (err) {
    return serverError(res, log, 'effective-context', err);
  }
});

export default router;
