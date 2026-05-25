/**
 * Companion diagnostic (CDx) — drug ↔ device pairings + concordance studies.
 * Backs Surface 11 (CDx co-development) in the gap inventory.
 *
 *   GET    /api/mdx/cdx/pairings                    list
 *   POST   /api/mdx/cdx/pairings                    create pairing
 *   GET    /api/mdx/cdx/pairings/:id                single pairing + concordance
 *   PATCH  /api/mdx/cdx/pairings/:id                partial update
 *   POST   /api/mdx/cdx/pairings/:id/concordance    add concordance study
 *   GET    /api/mdx/cdx/concordance/:id             single concordance study
 *   PATCH  /api/mdx/cdx/concordance/:id             partial update
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
const log = createScopedLogger('mdx-cdx');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APPROVAL_STATUS = ['planned', 'submitted', 'approved', 'withdrawn'] as const;
const APP_TYPE = ['nda', 'bla', 'anda', 'foreign'] as const;

const pairingListQuery = z.object({
  device_program_id: z.string().regex(UUID_RE).optional(),
  biomarker:         z.string().max(100).optional(),
  status:            z.enum(APPROVAL_STATUS).optional(),
});
const pairingCreate = z.object({
  deviceProgramId:     z.string().regex(UUID_RE).optional().nullable(),
  drugName:            z.string().min(1).max(300),
  drugInnn:            z.string().max(300).optional().nullable(),
  drugApplicationType: z.enum(APP_TYPE).optional().nullable(),
  drugApplicationNo:   z.string().max(60).optional().nullable(),
  drugSponsor:         z.string().max(300).optional().nullable(),
  indication:          z.string().max(1000).optional().nullable(),
  biomarker:           z.string().max(100).optional().nullable(),
  approvalStatus:      z.enum(APPROVAL_STATUS).optional(),
  fdaApprovalDate:     z.string().date().optional().nullable(),
  emaApprovalDate:     z.string().date().optional().nullable(),
  cdxLabelText:        z.string().max(8000).optional().nullable(),
});
const pairingPatch = pairingCreate.partial();

router.get('/cdx/pairings', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = pairingListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { device_program_id: pid, biomarker, status } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid)       { args.push(pid);       filters.push(`device_program_id = $${args.length}`); }
  if (biomarker) { args.push(biomarker); filters.push(`biomarker = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`approval_status = $${args.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM cdx_pairings WHERE ${filters.join(' AND ')}
        ORDER BY fda_approval_date DESC NULLS LAST, updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'pairing-list', err);
  }
});

router.post('/cdx/pairings', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = pairingCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO cdx_pairings (
         organization_id, device_program_id, drug_name, drug_innn,
         drug_application_type, drug_application_no, drug_sponsor,
         indication, biomarker, approval_status, fda_approval_date,
         ema_approval_date, cdx_label_text
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'planned'),$11,$12,$13
       )
       RETURNING *`,
      [
        orgId, p.deviceProgramId ?? null, p.drugName, p.drugInnn ?? null,
        p.drugApplicationType ?? null, p.drugApplicationNo ?? null,
        p.drugSponsor ?? null, p.indication ?? null, p.biomarker ?? null,
        p.approvalStatus ?? null, p.fdaApprovalDate ?? null,
        p.emaApprovalDate ?? null, p.cdxLabelText ?? null,
      ],
    );
    void auditService.logAction({
      tenantId: orgId, action: 'mdx.cdx.pairing.create',
      resourceType: 'cdx_pairing', resourceId: rows[0]?.id,
      details: { drugName: p.drugName, biomarker: p.biomarker },
    });
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'pairing-create', err);
  }
});

router.get('/cdx/pairings/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM cdx_pairings WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'CDx pairing');
    const concordance = await pool.query(
      `SELECT * FROM cdx_concordance_studies WHERE cdx_pairing_id = $1 ORDER BY id`,
      [id],
    );
    return ok(res, { ...rows[0], concordance: concordance.rows });
  } catch (err) {
    return serverError(res, log, 'pairing-get', err);
  }
});

router.patch('/cdx/pairings/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = pairingPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    deviceProgramId: 'device_program_id', drugName: 'drug_name', drugInnn: 'drug_innn',
    drugApplicationType: 'drug_application_type', drugApplicationNo: 'drug_application_no',
    drugSponsor: 'drug_sponsor', indication: 'indication', biomarker: 'biomarker',
    approvalStatus: 'approval_status', fdaApprovalDate: 'fda_approval_date',
    emaApprovalDate: 'ema_approval_date', cdxLabelText: 'cdx_label_text',
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
      `UPDATE cdx_pairings SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'CDx pairing');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'pairing-patch', err);
  }
});

/* ─── Concordance studies (children of pairings) ──────────────── */

const PCT = z.number().min(0).max(100);
const concordanceCreate = z.object({
  studyId:              z.string().max(120).optional().nullable(),
  referenceAssay:       z.string().min(1).max(500),
  candidateAssay:       z.string().min(1).max(500),
  nSamples:             z.number().int().nonnegative().optional().nullable(),
  ppaPct:               PCT.optional().nullable(),
  ppaLower:             PCT.optional().nullable(),
  ppaUpper:             PCT.optional().nullable(),
  npaPct:               PCT.optional().nullable(),
  npaLower:             PCT.optional().nullable(),
  npaUpper:             PCT.optional().nullable(),
  opaPct:               PCT.optional().nullable(),
  discordantResolution: z.string().max(4000).optional().nullable(),
  reportArtifactId:     z.number().int().positive().optional().nullable(),
});
const concordancePatch = concordanceCreate.partial();

router.post('/cdx/pairings/:id/concordance', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const pairingId = Number(req.params.id);
  if (!Number.isFinite(pairingId)) return clientError(res, 422, 'id must be numeric');
  const parsed = concordanceCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  /* Tenant gate. */
  const own = await pool.query(
    `SELECT 1 FROM cdx_pairings WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [pairingId, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'CDx pairing');

  try {
    const { rows } = await pool.query(
      `INSERT INTO cdx_concordance_studies (
         organization_id, cdx_pairing_id, study_id, reference_assay, candidate_assay,
         n_samples, ppa_pct, ppa_lower, ppa_upper, npa_pct, npa_lower, npa_upper,
         opa_pct, discordant_resolution, report_artifact_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       )
       RETURNING *`,
      [
        orgId, pairingId, p.studyId ?? null, p.referenceAssay, p.candidateAssay,
        p.nSamples ?? null, p.ppaPct ?? null, p.ppaLower ?? null, p.ppaUpper ?? null,
        p.npaPct ?? null, p.npaLower ?? null, p.npaUpper ?? null,
        p.opaPct ?? null, p.discordantResolution ?? null, p.reportArtifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'concordance-create', err);
  }
});

router.get('/cdx/concordance/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM cdx_concordance_studies WHERE id = $1 AND organization_id = $2`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Concordance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'concordance-get', err);
  }
});

router.patch('/cdx/concordance/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = concordancePatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    studyId: 'study_id', referenceAssay: 'reference_assay', candidateAssay: 'candidate_assay',
    nSamples: 'n_samples', ppaPct: 'ppa_pct', ppaLower: 'ppa_lower', ppaUpper: 'ppa_upper',
    npaPct: 'npa_pct', npaLower: 'npa_lower', npaUpper: 'npa_upper', opaPct: 'opa_pct',
    discordantResolution: 'discordant_resolution', reportArtifactId: 'report_artifact_id',
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
      `UPDATE cdx_concordance_studies SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Concordance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'concordance-patch', err);
  }
});

/* ── GET /api/mdx/cdx/:programId — kit-shaped aggregate ──────────────────────
 * The Companion Diagnostic surface (client useCdx) consumes { timeline,
 * concordance, xref, kpis } for the selected device program. Assembles from
 * cdx_pairings + cdx_concordance_studies. Registered LAST so it does not
 * shadow the literal /cdx/pairings · /cdx/concordance routes above. */
router.get('/cdx/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  try {
    const pairs = await pool.query(
      `SELECT id, drug_name, drug_innn, drug_sponsor, indication, biomarker,
              approval_status, fda_approval_date, ema_approval_date
         FROM cdx_pairings
        WHERE organization_id = $1 AND device_program_id::text = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const xref = pairs.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      drug: (r.drug_name as string) ?? '',
      biomarker: (r.biomarker as string) ?? '',
      indication: (r.indication as string) ?? '',
      sponsor: (r.drug_sponsor as string) ?? '',
      status: (r.approval_status as string) ?? 'planned',
    }));
    const timeline = pairs.rows
      .filter((r: Record<string, unknown>) => r.fda_approval_date || r.ema_approval_date)
      .map((r: Record<string, unknown>) => ({
        id: String(r.id),
        milestone: `${r.drug_name ?? ''} approval`,
        fda: r.fda_approval_date ? new Date(r.fda_approval_date as string).toISOString() : '',
        ema: r.ema_approval_date ? new Date(r.ema_approval_date as string).toISOString() : '',
      }));

    const conc = await pool.query(
      `SELECT s.id, s.study_id, s.reference_assay, s.candidate_assay, s.n_samples,
              s.ppa_pct, s.npa_pct, s.opa_pct
         FROM cdx_concordance_studies s
         JOIN cdx_pairings p ON p.id = s.cdx_pairing_id
        WHERE s.organization_id = $1 AND p.device_program_id::text = $2
        ORDER BY s.created_at DESC LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const concordance = conc.rows.map((r: Record<string, unknown>) => ({
      id: (r.study_id as string) ?? String(r.id),
      reference: (r.reference_assay as string) ?? '',
      candidate: (r.candidate_assay as string) ?? '',
      n: (r.n_samples as number) ?? 0,
      ppa: r.ppa_pct != null ? `${r.ppa_pct}%` : '',
      npa: r.npa_pct != null ? `${r.npa_pct}%` : '',
      opa: r.opa_pct != null ? `${r.opa_pct}%` : '',
    }));

    const kpis = [
      { label: 'CDx pairings', metric: String(xref.length), meta: `${xref.filter((x) => x.status === 'approved').length} approved` },
      { label: 'Concordance studies', metric: String(concordance.length), meta: '' },
    ];

    return ok(res, { timeline, concordance, xref, kpis });
  } catch (err) {
    return serverError(res, log, 'cdx-aggregate', err);
  }
});

export default router;
