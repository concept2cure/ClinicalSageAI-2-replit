/**
 * Clinical study management — backs Surface "Clinical study management"
 * in the gap inventory. Required for PMA pivotal trials, 510(k)
 * clinical, IDE programs, and post-market clinical follow-up.
 *
 *   GET    /api/mdx/clinical-studies                   list studies
 *   POST   /api/mdx/clinical-studies                   create study
 *   GET    /api/mdx/clinical-studies/:id               single + nested
 *   PATCH  /api/mdx/clinical-studies/:id               partial update
 *
 *   GET    /api/mdx/clinical-studies/:id/sites         list sites
 *   POST   /api/mdx/clinical-studies/:id/sites         add site
 *   PATCH  /api/mdx/clinical-sites/:siteId             update site
 *
 *   GET    /api/mdx/clinical-studies/:id/deviations    list deviations
 *   POST   /api/mdx/clinical-studies/:id/deviations    log deviation
 *   PATCH  /api/mdx/clinical-deviations/:devId         update / resolve
 *
 *   GET    /api/mdx/clinical-studies/:id/aes           list AEs
 *   POST   /api/mdx/clinical-studies/:id/aes           log AE
 *   PATCH  /api/mdx/clinical-aes/:aeId                 update AE
 *
 *   GET    /api/mdx/clinical-studies/:id/endpoints     list endpoints
 *   POST   /api/mdx/clinical-studies/:id/endpoints     record endpoint
 *   PATCH  /api/mdx/clinical-endpoints/:epId           update endpoint
 *
 *   GET    /api/mdx/clinical-studies/:id/summary       enrollment / safety KPIs
 *
 * Tenant-scoped, canonical envelope, Zod-validated. Nested resources go
 * through a study-ownership check at the parent route before allowing
 * any insert / update on a child.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-clinical');

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
const PHASE = ['pivotal', 'feasibility', 'pilot', 'post_market', 'pms'] as const;
const STUDY_TYPE = ['rct', 'single_arm', 'observational', 'registry'] as const;
const STUDY_STATUS = ['planning', 'enrolling', 'follow_up', 'analysis', 'completed', 'terminated'] as const;
const IRB_STATUS = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
const DEV_CATEGORY = ['major', 'minor', 'inclusion_exclusion', 'visit_window', 'consent', 'protocol', 'other'] as const;
const AE_OUTCOME = ['recovered', 'recovering', 'not_recovered', 'fatal', 'unknown'] as const;
const AE_SEVERITY = ['mild', 'moderate', 'severe'] as const;
const AE_RELATIONSHIP = ['yes', 'no', 'possibly', 'probably', 'definitely', 'unrelated'] as const;
const EP_KIND = ['primary', 'secondary', 'exploratory', 'safety'] as const;

/* ─── Helper: ensure a study belongs to the caller's org ──────── */

async function requireStudyInOrg(orgId: number, studyId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM clinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [studyId, orgId],
  );
  return rows.length > 0;
}

/* ─── Studies CRUD ───────────────────────────────────────────── */

const studyListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status:     z.enum(STUDY_STATUS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});
const studyCreate = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  studyId:             z.string().min(1).max(120),
  nctId:               z.string().max(20).optional().nullable(),
  title:               z.string().min(1).max(500),
  phase:               z.enum(PHASE).optional().nullable(),
  studyType:           z.enum(STUDY_TYPE).optional().nullable(),
  intendedUse:         z.string().max(2000).optional().nullable(),
  primaryEndpoint:     z.string().max(2000).optional().nullable(),
  sampleSizePlanned:   z.number().int().nonnegative().optional().nullable(),
  status:              z.enum(STUDY_STATUS).optional(),
  startDate:           z.string().date().optional().nullable(),
  pcd:                 z.string().date().optional().nullable(),
  scd:                 z.string().date().optional().nullable(),
  ideNumber:           z.string().max(60).optional().nullable(),
  irbApproved:         z.boolean().optional(),
  irbApprovalDate:     z.string().date().optional().nullable(),
  protocolVersion:     z.string().max(40).optional().nullable(),
  sapVersion:          z.string().max(40).optional().nullable(),
  bimoReady:           z.boolean().optional(),
});
const studyPatch = studyCreate.partial().extend({
  primaryEndpointMet:  z.boolean().optional().nullable(),
  sampleSizeEnrolled:  z.number().int().nonnegative().optional(),
  sampleSizeAnalyzed:  z.number().int().nonnegative().optional(),
});

router.get('/clinical-studies', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = studyListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, status, limit = 200 } = parsed.data;
  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid)    { args.push(pid);    filters.push(`program_id = $${args.length}`); }
  if (status) { args.push(status); filters.push(`status = $${args.length}`); }
  args.push(limit);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_studies WHERE ${filters.join(' AND ')}
        ORDER BY start_date DESC NULLS LAST, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-studies', err);
  }
});

router.post('/clinical-studies', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = studyCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clinical_studies (
         organization_id, program_id, study_id, nct_id, title, phase, study_type,
         intended_use, primary_endpoint, sample_size_planned, status,
         start_date, pcd, scd, ide_number, irb_approved, irb_approval_date,
         protocol_version, sap_version, bimo_ready
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,'planning'),
         $12,$13,$14,$15,COALESCE($16,false),$17,$18,$19,COALESCE($20,false)
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.studyId, p.nctId ?? null, p.title,
        p.phase ?? null, p.studyType ?? null, p.intendedUse ?? null,
        p.primaryEndpoint ?? null, p.sampleSizePlanned ?? null,
        p.status ?? null, p.startDate ?? null, p.pcd ?? null, p.scd ?? null,
        p.ideNumber ?? null, p.irbApproved ?? null, p.irbApprovalDate ?? null,
        p.protocolVersion ?? null, p.sapVersion ?? null, p.bimoReady ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-study', err);
  }
});

router.get('/clinical-studies/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_studies WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Study');
    const [sites, deviations, aes, endpoints] = await Promise.all([
      pool.query(`SELECT * FROM clinical_study_sites WHERE study_id = $1 ORDER BY site_number`, [id]),
      pool.query(`SELECT * FROM clinical_study_deviations WHERE study_id = $1 ORDER BY deviation_date DESC LIMIT 50`, [id]),
      pool.query(`SELECT * FROM clinical_study_aes WHERE study_id = $1 ORDER BY ae_date DESC LIMIT 50`, [id]),
      pool.query(`SELECT * FROM clinical_study_endpoints WHERE study_id = $1 ORDER BY endpoint_kind, id`, [id]),
    ]);
    return ok(res, {
      ...rows[0],
      sites: sites.rows,
      deviations: deviations.rows,
      aes: aes.rows,
      endpoints: endpoints.rows,
    });
  } catch (err) {
    return serverError(res, log, 'get-study', err);
  }
});

router.patch('/clinical-studies/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = studyPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    programId: 'program_id', studyId: 'study_id', nctId: 'nct_id', title: 'title',
    phase: 'phase', studyType: 'study_type', intendedUse: 'intended_use',
    primaryEndpoint: 'primary_endpoint', primaryEndpointMet: 'primary_endpoint_met',
    sampleSizePlanned: 'sample_size_planned', sampleSizeEnrolled: 'sample_size_enrolled',
    sampleSizeAnalyzed: 'sample_size_analyzed', status: 'status',
    startDate: 'start_date', pcd: 'pcd', scd: 'scd', ideNumber: 'ide_number',
    irbApproved: 'irb_approved', irbApprovalDate: 'irb_approval_date',
    protocolVersion: 'protocol_version', sapVersion: 'sap_version', bimoReady: 'bimo_ready',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE clinical_studies SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-study', err);
  }
});

/* ─── Sites ─────────────────────────────────────────────────── */

const siteCreate = z.object({
  siteNumber:            z.string().min(1).max(40),
  siteName:              z.string().min(1).max(300),
  country:               z.string().max(60).optional().nullable(),
  city:                  z.string().max(120).optional().nullable(),
  principalInvestigator: z.string().max(200).optional().nullable(),
  irbStatus:             z.enum(IRB_STATUS).optional(),
  irbApprovalDate:       z.string().date().optional().nullable(),
  activatedAt:           z.string().date().optional().nullable(),
});
const sitePatch = siteCreate.partial().extend({
  closedAt:        z.string().date().optional().nullable(),
  enrolledCount:   z.number().int().nonnegative().optional(),
  screenFailures:  z.number().int().nonnegative().optional(),
  withdrawals:     z.number().int().nonnegative().optional(),
});

router.get('/clinical-studies/:id/sites', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_study_sites WHERE study_id = $1 ORDER BY site_number`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-sites', err);
  }
});

router.post('/clinical-studies/:id/sites', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  const parsed = siteCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clinical_study_sites (
         study_id, organization_id, site_number, site_name, country, city,
         principal_investigator, irb_status, irb_approval_date, activated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'pending'),$9,$10)
       RETURNING *`,
      [
        id, orgId, p.siteNumber, p.siteName, p.country ?? null, p.city ?? null,
        p.principalInvestigator ?? null, p.irbStatus ?? null,
        p.irbApprovalDate ?? null, p.activatedAt ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-site', err);
  }
});

router.patch('/clinical-sites/:siteId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const siteId = Number(req.params.siteId);
  if (!Number.isFinite(siteId)) return clientError(res, 422, 'siteId must be numeric');
  const parsed = sitePatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    siteNumber: 'site_number', siteName: 'site_name', country: 'country', city: 'city',
    principalInvestigator: 'principal_investigator', irbStatus: 'irb_status',
    irbApprovalDate: 'irb_approval_date', activatedAt: 'activated_at',
    closedAt: 'closed_at', enrolledCount: 'enrolled_count',
    screenFailures: 'screen_failures', withdrawals: 'withdrawals',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(siteId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE clinical_study_sites SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Site');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-site', err);
  }
});

/* ─── Deviations ────────────────────────────────────────────── */

const devCreate = z.object({
  siteId:           z.number().int().positive().optional().nullable(),
  deviationDate:    z.string().date(),
  category:         z.enum(DEV_CATEGORY),
  description:      z.string().min(1).max(4000),
  subjectId:        z.string().max(60).optional().nullable(),
  capaRequired:     z.boolean().optional(),
});
const devPatch = z.object({
  category:         z.enum(DEV_CATEGORY).optional(),
  description:      z.string().min(1).max(4000).optional(),
  resolvedAt:       z.string().date().optional().nullable(),
  resolutionNote:   z.string().max(4000).optional().nullable(),
  capaRequired:     z.boolean().optional(),
});

router.get('/clinical-studies/:id/deviations', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_study_deviations WHERE study_id = $1 ORDER BY deviation_date DESC`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-deviations', err);
  }
});

router.post('/clinical-studies/:id/deviations', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  const parsed = devCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clinical_study_deviations (
         study_id, site_id, organization_id, deviation_date, category, description,
         subject_id, reported_by, capa_required
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,false))
       RETURNING *`,
      [
        id, p.siteId ?? null, orgId, p.deviationDate, p.category, p.description,
        p.subjectId ?? null, getUserId(req), p.capaRequired ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-deviation', err);
  }
});

router.patch('/clinical-deviations/:devId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const devId = Number(req.params.devId);
  if (!Number.isFinite(devId)) return clientError(res, 422, 'devId must be numeric');
  const parsed = devPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    category: 'category', description: 'description', resolvedAt: 'resolved_at',
    resolutionNote: 'resolution_note', capaRequired: 'capa_required',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(devId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE clinical_study_deviations SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Deviation');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-deviation', err);
  }
});

/* ─── Adverse events ────────────────────────────────────────── */

const aeCreate = z.object({
  siteId:           z.number().int().positive().optional().nullable(),
  aeId:             z.string().min(1).max(120),
  subjectId:        z.string().max(60).optional().nullable(),
  aeDate:           z.string().date(),
  serious:          z.boolean().optional(),
  unanticipated:    z.boolean().optional(),
  deviceRelated:    z.enum(AE_RELATIONSHIP).optional().nullable(),
  severity:         z.enum(AE_SEVERITY).optional().nullable(),
  outcome:          z.enum(AE_OUTCOME).optional().nullable(),
  preferredTerm:    z.string().max(300).optional().nullable(),
  soc:              z.string().max(300).optional().nullable(),
});
const aePatch = aeCreate.partial().extend({
  reportedToFdaAt:  z.string().date().optional().nullable(),
  reportedToIrbAt:  z.string().date().optional().nullable(),
  mdrEventNumber:   z.string().max(60).optional().nullable(),
});

router.get('/clinical-studies/:id/aes', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_study_aes WHERE study_id = $1 ORDER BY ae_date DESC`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-aes', err);
  }
});

router.post('/clinical-studies/:id/aes', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  const parsed = aeCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clinical_study_aes (
         study_id, site_id, organization_id, ae_id, subject_id, ae_date,
         serious, unanticipated, device_related, severity, outcome,
         preferred_term, soc
       ) VALUES (
         $1,$2,$3,$4,$5,$6,COALESCE($7,false),COALESCE($8,false),$9,$10,$11,$12,$13
       )
       RETURNING *`,
      [
        id, p.siteId ?? null, orgId, p.aeId, p.subjectId ?? null, p.aeDate,
        p.serious ?? null, p.unanticipated ?? null,
        p.deviceRelated ?? null, p.severity ?? null, p.outcome ?? null,
        p.preferredTerm ?? null, p.soc ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-ae', err);
  }
});

router.patch('/clinical-aes/:aeId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const aeId = Number(req.params.aeId);
  if (!Number.isFinite(aeId)) return clientError(res, 422, 'aeId must be numeric');
  const parsed = aePatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    siteId: 'site_id', aeId: 'ae_id', subjectId: 'subject_id', aeDate: 'ae_date',
    serious: 'serious', unanticipated: 'unanticipated', deviceRelated: 'device_related',
    severity: 'severity', outcome: 'outcome', preferredTerm: 'preferred_term', soc: 'soc',
    reportedToFdaAt: 'reported_to_fda_at', reportedToIrbAt: 'reported_to_irb_at',
    mdrEventNumber: 'mdr_event_number',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(aeId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE clinical_study_aes SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'AE');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-ae', err);
  }
});

/* ─── Endpoint results ──────────────────────────────────────── */

const epCreate = z.object({
  endpointKind:   z.enum(EP_KIND),
  name:           z.string().min(1).max(500),
  description:    z.string().max(4000).optional().nullable(),
  preSpecified:   z.boolean().optional(),
  targetValue:    z.string().max(120).optional().nullable(),
  observedValue:  z.string().max(120).optional().nullable(),
  ciLower:        z.string().max(60).optional().nullable(),
  ciUpper:        z.string().max(60).optional().nullable(),
  pValue:         z.number().min(0).max(1).optional().nullable(),
  met:            z.boolean().optional().nullable(),
  analysisNote:   z.string().max(4000).optional().nullable(),
});
const epPatch = epCreate.partial();

router.get('/clinical-studies/:id/endpoints', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clinical_study_endpoints WHERE study_id = $1
        ORDER BY CASE endpoint_kind WHEN 'primary' THEN 0 WHEN 'secondary' THEN 1 WHEN 'safety' THEN 2 ELSE 3 END, id`,
      [id],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-endpoints', err);
  }
});

router.post('/clinical-studies/:id/endpoints', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  const parsed = epCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clinical_study_endpoints (
         study_id, organization_id, endpoint_kind, name, description, pre_specified,
         target_value, observed_value, ci_lower, ci_upper, p_value, met, analysis_note
       ) VALUES (
         $1,$2,$3,$4,$5,COALESCE($6,true),$7,$8,$9,$10,$11,$12,$13
       )
       RETURNING *`,
      [
        id, orgId, p.endpointKind, p.name, p.description ?? null,
        p.preSpecified ?? null, p.targetValue ?? null, p.observedValue ?? null,
        p.ciLower ?? null, p.ciUpper ?? null, p.pValue ?? null,
        p.met ?? null, p.analysisNote ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-endpoint', err);
  }
});

router.patch('/clinical-endpoints/:epId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const epId = Number(req.params.epId);
  if (!Number.isFinite(epId)) return clientError(res, 422, 'epId must be numeric');
  const parsed = epPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const COL: Record<string, string> = {
    endpointKind: 'endpoint_kind', name: 'name', description: 'description',
    preSpecified: 'pre_specified', targetValue: 'target_value',
    observedValue: 'observed_value', ciLower: 'ci_lower', ciUpper: 'ci_upper',
    pValue: 'p_value', met: 'met', analysisNote: 'analysis_note',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(epId, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE clinical_study_endpoints SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Endpoint');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-endpoint', err);
  }
});

/* ─── GET /clinical-studies/:id/summary ─────────────────────── */

router.get('/clinical-studies/:id/summary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  if (!(await requireStudyInOrg(orgId, id))) return notFoundInTenant(res, 'Study');
  try {
    const study = await pool.query(
      `SELECT sample_size_planned, sample_size_enrolled, sample_size_analyzed
         FROM clinical_studies WHERE id = $1`,
      [id],
    );
    const sites = await pool.query<{ total: number; activated: number; enrolled_total: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE activated_at IS NOT NULL)::int AS activated,
              COALESCE(SUM(enrolled_count), 0)::int AS enrolled_total
         FROM clinical_study_sites WHERE study_id = $1`,
      [id],
    );
    const devs = await pool.query<{ total: number; major: number; open: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE category = 'major')::int AS major,
              COUNT(*) FILTER (WHERE resolved_at IS NULL)::int AS open
         FROM clinical_study_deviations WHERE study_id = $1`,
      [id],
    );
    const aes = await pool.query<{
      total: number; serious: number; uade: number; device_related: number;
    }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE serious = true)::int AS serious,
              COUNT(*) FILTER (WHERE unanticipated = true)::int AS uade,
              COUNT(*) FILTER (WHERE device_related IN ('possibly','probably','definitely','yes'))::int AS device_related
         FROM clinical_study_aes WHERE study_id = $1`,
      [id],
    );
    const endpoints = await pool.query<{
      total: number; met: number; not_met: number; primary_met: number;
    }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE met = true)::int AS met,
              COUNT(*) FILTER (WHERE met = false)::int AS not_met,
              COUNT(*) FILTER (WHERE endpoint_kind = 'primary' AND met = true)::int AS primary_met
         FROM clinical_study_endpoints WHERE study_id = $1`,
      [id],
    );
    const planned = Number(study.rows[0]?.sample_size_planned ?? 0);
    const enrolled = Number(study.rows[0]?.sample_size_enrolled ?? 0);
    return ok(res, {
      enrollment: {
        planned, enrolled,
        percent: planned === 0 ? 0 : Math.round((enrolled / planned) * 100),
        sites: sites.rows[0] ?? { total: 0, activated: 0, enrolled_total: 0 },
      },
      deviations: devs.rows[0] ?? { total: 0, major: 0, open: 0 },
      safety:     aes.rows[0] ?? { total: 0, serious: 0, uade: 0, device_related: 0 },
      endpoints:  endpoints.rows[0] ?? { total: 0, met: 0, not_met: 0, primary_met: 0 },
    });
  } catch (err) {
    return serverError(res, log, 'summary', err);
  }
});

export default router;
