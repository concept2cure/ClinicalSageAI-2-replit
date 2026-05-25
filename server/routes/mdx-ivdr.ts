/**
 * EU IVDR (Regulation 2017/746) — classifications + Performance Evaluation
 * Reports. Backs the IVDR surface (Surface 10 in the gap inventory) for
 * clients selling diagnostics into the EU.
 *
 *   GET    /api/mdx/ivdr/classifications                 list
 *   POST   /api/mdx/ivdr/classifications                  create / classify
 *   GET    /api/mdx/ivdr/classifications/:id              single
 *   PATCH  /api/mdx/ivdr/classifications/:id              partial update
 *
 *   GET    /api/mdx/ivdr/per                              list PERs
 *   POST   /api/mdx/ivdr/per                              create PER
 *   GET    /api/mdx/ivdr/per/:id                          single PER
 *   PATCH  /api/mdx/ivdr/per/:id                          partial update
 *
 * Class A → no notified body. Class B/C/D → notified body required, surfaced
 * by `notified_body_required` boolean (server-computed when classifying).
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
const log = createScopedLogger('mdx-ivdr');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IVDR_CLASS = ['A', 'B', 'C', 'D'] as const;
const IVDR_RULE = ['1', '2', '3', '4', '5', '6', '7'] as const;

const classListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  ivdr_class: z.enum(IVDR_CLASS).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});
const classCreate = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  deviceName:          z.string().min(1).max(500),
  ivdrClass:           z.enum(IVDR_CLASS),
  classificationRule:  z.enum(IVDR_RULE).optional().nullable(),
  rationale:           z.string().max(4000).optional().nullable(),
  companionDiagnostic: z.boolean().optional(),
  selfTest:            z.boolean().optional(),
  nearPatientTest:     z.boolean().optional(),
  notifiedBodyName:    z.string().max(200).optional().nullable(),
  notifiedBodyId:      z.string().max(10).optional().nullable(),
  certificateNo:       z.string().max(120).optional().nullable(),
  certificateExpiry:   z.string().date().optional().nullable(),
});
const classPatch = classCreate.partial();

router.get('/ivdr/classifications', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = classListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, ivdr_class: cls, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid) { args.push(pid); filters.push(`program_id = $${args.length}`); }
  if (cls) { args.push(cls); filters.push(`ivdr_class = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivdr_classifications WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'class-list', err);
  }
});

router.post('/ivdr/classifications', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = classCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  /* Notified body required for Class B/C/D per IVDR Article 48. */
  const nbRequired = p.ivdrClass !== 'A';
  try {
    const { rows } = await pool.query(
      `INSERT INTO ivdr_classifications (
         organization_id, program_id, device_name, ivdr_class, classification_rule,
         rationale, companion_diagnostic, self_test, near_patient_test,
         notified_body_required, notified_body_name, notified_body_id,
         certificate_no, certificate_expiry
       ) VALUES (
         $1,$2,$3,$4,$5,$6,COALESCE($7,false),COALESCE($8,false),COALESCE($9,false),
         $10,$11,$12,$13,$14
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.deviceName, p.ivdrClass, p.classificationRule ?? null,
        p.rationale ?? null, p.companionDiagnostic ?? null, p.selfTest ?? null,
        p.nearPatientTest ?? null, nbRequired,
        p.notifiedBodyName ?? null, p.notifiedBodyId ?? null,
        p.certificateNo ?? null, p.certificateExpiry ?? null,
      ],
    );
    void auditService.logAction({
      tenantId: orgId, action: 'mdx.ivdr.classification.confirm',
      resourceType: 'ivdr_classification', resourceId: rows[0]?.id,
      details: { ivdrClass: p.ivdrClass, deviceName: p.deviceName },
    });
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'class-create', err);
  }
});

router.get('/ivdr/classifications/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivdr_classifications WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'IVDR classification');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'class-get', err);
  }
});

router.patch('/ivdr/classifications/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = classPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', deviceName: 'device_name', ivdrClass: 'ivdr_class',
    classificationRule: 'classification_rule', rationale: 'rationale',
    companionDiagnostic: 'companion_diagnostic', selfTest: 'self_test',
    nearPatientTest: 'near_patient_test', notifiedBodyName: 'notified_body_name',
    notifiedBodyId: 'notified_body_id', certificateNo: 'certificate_no',
    certificateExpiry: 'certificate_expiry',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  /* Recompute notifiedBodyRequired if class changed. */
  if (parsed.data.ivdrClass) {
    args.push(parsed.data.ivdrClass !== 'A');
    setFrags.push(`notified_body_required = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE ivdr_classifications SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'IVDR classification');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'class-patch', err);
  }
});

/* ─── PER documents ────────────────────────────────────────────── */

const perListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status:     z.enum(['draft', 'review', 'approved', 'superseded']).optional(),
});
const perCreate = z.object({
  programId:                  z.string().regex(UUID_RE).optional().nullable(),
  deviceName:                 z.string().min(1).max(500),
  perVersion:                 z.string().min(1).max(40),
  perStatus:                  z.enum(['draft', 'review', 'approved', 'superseded']).optional(),
  scientificValidityDone:     z.boolean().optional(),
  analyticalPerformanceDone:  z.boolean().optional(),
  clinicalPerformanceDone:    z.boolean().optional(),
  benefitRiskConclusion:      z.string().max(4000).optional().nullable(),
  pmpfPlanAttached:           z.boolean().optional(),
  authorName:                 z.string().max(200).optional().nullable(),
  authorQualifications:       z.string().max(500).optional().nullable(),
  perDate:                    z.string().date().optional().nullable(),
  artifactId:                 z.number().int().positive().optional().nullable(),
});
const perPatch = perCreate.partial();

router.get('/ivdr/per', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = perListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, status } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid)    { args.push(pid);    filters.push(`program_id = $${args.length}`); }
  if (status) { args.push(status); filters.push(`per_status = $${args.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivdr_per_documents WHERE ${filters.join(' AND ')}
        ORDER BY per_date DESC NULLS LAST, updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'per-list', err);
  }
});

router.post('/ivdr/per', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = perCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ivdr_per_documents (
         organization_id, program_id, device_name, per_version, per_status,
         scientific_validity_done, analytical_performance_done, clinical_performance_done,
         benefit_risk_conclusion, pmpf_plan_attached, author_name, author_qualifications,
         per_date, artifact_id
       ) VALUES (
         $1,$2,$3,$4,COALESCE($5,'draft'),
         COALESCE($6,false),COALESCE($7,false),COALESCE($8,false),
         $9,COALESCE($10,false),$11,$12,$13,$14
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.deviceName, p.perVersion, p.perStatus ?? null,
        p.scientificValidityDone ?? null, p.analyticalPerformanceDone ?? null,
        p.clinicalPerformanceDone ?? null,
        p.benefitRiskConclusion ?? null, p.pmpfPlanAttached ?? null,
        p.authorName ?? null, p.authorQualifications ?? null,
        p.perDate ?? null, p.artifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'per-create', err);
  }
});

router.get('/ivdr/per/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivdr_per_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'PER document');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'per-get', err);
  }
});

router.patch('/ivdr/per/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = perPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', deviceName: 'device_name', perVersion: 'per_version',
    perStatus: 'per_status', scientificValidityDone: 'scientific_validity_done',
    analyticalPerformanceDone: 'analytical_performance_done',
    clinicalPerformanceDone: 'clinical_performance_done',
    benefitRiskConclusion: 'benefit_risk_conclusion',
    pmpfPlanAttached: 'pmpf_plan_attached',
    authorName: 'author_name', authorQualifications: 'author_qualifications',
    perDate: 'per_date', artifactId: 'artifact_id',
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
      `UPDATE ivdr_per_documents SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'PER document');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'per-patch', err);
  }
});

/* ── GET /api/mdx/ivdr/:programId — kit-shaped aggregate ─────────────────────
 * The EU IVDR surface (client useIvdr) consumes { rules, classes, nbTimeline,
 * kpis } for the selected program. Assembles from ivdr_classifications +
 * ivdr_per_documents. Registered LAST so it does not shadow the literal
 * /ivdr/classifications · /ivdr/per routes above. */
router.get('/ivdr/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  try {
    const cls = await pool.query(
      `SELECT id, device_name, ivdr_class, classification_rule, rationale,
              companion_diagnostic, notified_body_required, notified_body_name,
              certificate_no, certificate_expiry
         FROM ivdr_classifications
        WHERE organization_id = $1 AND program_id::text = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const classes = cls.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      device: (r.device_name as string) ?? '',
      ivdrClass: (r.ivdr_class as string) ?? '',
      rule: (r.classification_rule as string) ?? '',
      rationale: (r.rationale as string) ?? '',
      cdx: r.companion_diagnostic === true,
      nbRequired: r.notified_body_required === true,
      nb: (r.notified_body_name as string) ?? '',
    }));
    // Rules registry derived from the live classification rules present.
    const ruleSet = new Map<string, number>();
    for (const c of classes) if (c.rule) ruleSet.set(c.rule, (ruleSet.get(c.rule) ?? 0) + 1);
    const rules = [...ruleSet.entries()].map(([id, count]) => ({ id, label: id, count }));

    const per = await pool.query(
      `SELECT id, device_name, per_version, per_status, per_date,
              scientific_validity_done, analytical_performance_done, clinical_performance_done
         FROM ivdr_per_documents
        WHERE organization_id = $1 AND program_id::text = $2 AND deleted_at IS NULL
        ORDER BY per_date DESC NULLS LAST LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const nbTimeline = per.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      milestone: `PER ${r.per_version ?? ''}`,
      when: r.per_date ? new Date(r.per_date as string).toISOString() : '',
      state: (r.per_status as string) ?? 'draft',
    }));

    const kpis = [
      { label: 'Classifications', metric: String(classes.length), meta: `${classes.filter((c) => c.nbRequired).length} NB-required` },
      { label: 'PER documents', metric: String(per.rows.length), meta: '' },
    ];

    return ok(res, { rules, classes, nbTimeline, kpis });
  } catch (err) {
    return serverError(res, log, 'ivdr-aggregate', err);
  }
});

export default router;
