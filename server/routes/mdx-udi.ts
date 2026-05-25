/**
 * UDI records — backs Surface 3 (rail item `udi`) of the paying-client beta.
 *
 *   GET    /api/mdx/udi                          list every UDI record in org
 *   GET    /api/mdx/udi?program_id=<UUID>        scoped to one program
 *   POST   /api/mdx/udi                          create a new UDI record
 *   GET    /api/mdx/udi/:id                      single record
 *   PATCH  /api/mdx/udi/:id                      partial update
 *   POST   /api/mdx/udi/:id/submit-gudid         flip gudid_status='submitted'
 *
 * Tenant-scoped on every endpoint via udi_records.organization_id =
 * caller's org. Soft-delete supported (deleted_at). The submit-gudid
 * action is a state transition, not a full update — it stamps
 * gudid_submitted_at = NOW() and records the payload that was submitted.
 *
 * Audit-logged via the global mutation middleware. AnA can read + mutate
 * via the dedicated AnA tools in the registry.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import auditService from '../services/auditService';

const router = Router();
const log = createScopedLogger('mdx-udi');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISSUING_AGENCY = ['GS1', 'HIBCC', 'ICCBBA'] as const;
const MRI_SAFETY = ['mri_safe', 'mri_conditional', 'mri_unsafe', 'not_evaluated'] as const;
const LOT_SERIAL = ['lot', 'serial', 'none'] as const;
const GUDID_STATUS = ['draft', 'submitted', 'published', 'rejected'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  agency:     z.enum(ISSUING_AGENCY).optional(),
  status:     z.enum(GUDID_STATUS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createBody = z.object({
  programId:      z.string().regex(UUID_RE).optional().nullable(),
  deviceName:     z.string().min(1).max(500),
  udiDi:          z.string().min(3).max(60),
  issuingAgency:  z.enum(ISSUING_AGENCY),
  udiPiFormat:    z.string().max(100).optional().nullable(),
  gmdnCode:       z.string().max(50).optional().nullable(),
  deviceClass:    z.string().max(10).optional().nullable(),
  productCode:    z.string().max(10).optional().nullable(),
  brandName:      z.string().max(200).optional().nullable(),
  catalogNumber:  z.string().max(120).optional().nullable(),
  versionOrModel: z.string().max(120).optional().nullable(),
  packageQty:     z.number().int().nonnegative().optional().nullable(),
  packageType:    z.string().max(120).optional().nullable(),
  mriSafety:      z.enum(MRI_SAFETY).optional().nullable(),
  lotSerial:      z.enum(LOT_SERIAL).optional().nullable(),
  prescriptionUse: z.boolean().optional(),
  hctp:           z.boolean().optional(),
  kit:            z.boolean().optional(),
  singleUse:      z.boolean().optional(),
  rxOnly:         z.boolean().optional(),
});

const patchBody = createBody.partial();

/* ─── GET /api/mdx/udi ────────────────────────────────────────────── */

router.get('/udi', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, agency, status, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (agency)    { args.push(agency);    filters.push(`issuing_agency = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`gudid_status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM udi_records
        WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/* ─── POST /api/mdx/udi ───────────────────────────────────────────── */

router.post('/udi', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  try {
    const { rows } = await pool.query(
      `INSERT INTO udi_records (
         organization_id, program_id, device_name, udi_di, issuing_agency,
         udi_pi_format, gmdn_code, device_class, product_code, brand_name,
         catalog_number, version_or_model, package_qty, package_type,
         mri_safety, lot_serial, prescription_use, hctp, kit, single_use, rx_only
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.deviceName, p.udiDi, p.issuingAgency,
        p.udiPiFormat ?? null, p.gmdnCode ?? null, p.deviceClass ?? null,
        p.productCode ?? null, p.brandName ?? null, p.catalogNumber ?? null,
        p.versionOrModel ?? null, p.packageQty ?? null, p.packageType ?? null,
        p.mriSafety ?? null, p.lotSerial ?? null,
        p.prescriptionUse ?? true, p.hctp ?? false, p.kit ?? false,
        p.singleUse ?? false, p.rxOnly ?? true,
      ],
    );
    void auditService.logAction({
      tenantId: orgId, action: 'mdx.udi.issue',
      resourceType: 'udi_record', resourceId: rows[0]?.id,
      details: { udiDi: p.udiDi, deviceName: p.deviceName, issuingAgency: p.issuingAgency },
    });
    return created(res, rows[0]);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      return clientError(res, 409, 'A UDI record with that UDI-DI already exists in this org');
    }
    return serverError(res, log, 'create', err);
  }
});

/* ─── GET /api/mdx/udi/:id ────────────────────────────────────────── */

router.get('/udi/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM udi_records WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'UDI record');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

/* ─── PATCH /api/mdx/udi/:id ──────────────────────────────────────── */

router.patch('/udi/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  /* Build SET clause dynamically from the parsed keys; the column names
     map snake_case ↔ camelCase via a small dictionary. Done in code
     rather than via Drizzle to keep this route file dependency-free
     against any schema-import churn. */
  const COL: Record<string, string> = {
    programId: 'program_id', deviceName: 'device_name', udiDi: 'udi_di',
    issuingAgency: 'issuing_agency', udiPiFormat: 'udi_pi_format',
    gmdnCode: 'gmdn_code', deviceClass: 'device_class', productCode: 'product_code',
    brandName: 'brand_name', catalogNumber: 'catalog_number',
    versionOrModel: 'version_or_model', packageQty: 'package_qty',
    packageType: 'package_type', mriSafety: 'mri_safety', lotSerial: 'lot_serial',
    prescriptionUse: 'prescription_use', hctp: 'hctp', kit: 'kit',
    singleUse: 'single_use', rxOnly: 'rx_only',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE udi_records
          SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'UDI record');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

/* ─── POST /api/mdx/udi/:id/submit-gudid ──────────────────────────── */

router.post('/udi/:id/submit-gudid', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `UPDATE udi_records
          SET gudid_status = 'submitted',
              gudid_submitted_at = NOW(),
              gudid_payload = COALESCE($3::jsonb, gudid_payload),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND gudid_status IN ('draft','rejected')
        RETURNING *`,
      [id, orgId, req.body?.payload ? JSON.stringify(req.body.payload) : null],
    );
    if (rows.length === 0) {
      return clientError(
        res,
        409,
        'UDI record not found, already submitted, or not in draft/rejected state',
      );
    }
    void auditService.logAction({
      tenantId: orgId, action: 'mdx.udi.submit_gudid',
      resourceType: 'udi_record', resourceId: id,
    });
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'submit-gudid', err);
  }
});

export default router;
