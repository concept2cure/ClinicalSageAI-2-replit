/**
 * IVD performance studies — analytical + clinical. Backs the diagnostic-
 * specific IVD pathway surface (Surface 9 in the gap inventory).
 *
 *   Analytical performance (per-study row):
 *     GET    /api/mdx/ivd/analytical                       list (filters)
 *     POST   /api/mdx/ivd/analytical                       create
 *     GET    /api/mdx/ivd/analytical/:id                   single
 *     PATCH  /api/mdx/ivd/analytical/:id                   partial update
 *
 *   Clinical performance (sensitivity / specificity / PPV / NPV / ROC):
 *     GET    /api/mdx/ivd/clinical                         list
 *     POST   /api/mdx/ivd/clinical                         create
 *     GET    /api/mdx/ivd/clinical/:id                     single
 *     PATCH  /api/mdx/ivd/clinical/:id                     partial update
 *
 *   GET /api/mdx/ivd/performance-summary/:programId        aggregate KPIs
 *
 * Canonical envelope; tenant-scoped; Zod-validated. Mounted at /api/mdx.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-ivd-performance');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─── Analytical performance ─────────────────────────────────────── */

const ANAL_TYPE = [
  'accuracy', 'precision', 'linearity', 'limit_of_detection',
  'limit_of_quantitation', 'analytical_specificity', 'interference',
  'matrix_comparison', 'reagent_stability', 'sample_stability', 'carryover',
] as const;

const analListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  study_type: z.enum(ANAL_TYPE).optional(),
  pass_fail:  z.enum(['pass', 'fail', 'pending']).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const analCreate = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  studyType:           z.enum(ANAL_TYPE),
  studyId:             z.string().max(120).optional().nullable(),
  title:               z.string().min(1).max(500),
  protocolRef:         z.string().max(500).optional().nullable(),
  acceptanceCriterion: z.string().max(2000).optional().nullable(),
  resultSummary:       z.string().max(8000).optional().nullable(),
  passFail:            z.enum(['pass', 'fail', 'pending']).optional(),
  nSamples:            z.number().int().nonnegative().optional().nullable(),
  nReplicates:         z.number().int().nonnegative().optional().nullable(),
  sites:               z.array(z.string()).optional().nullable(),
  analytes:            z.array(z.string()).optional().nullable(),
  matrixType:          z.string().max(120).optional().nullable(),
  reportArtifactId:    z.number().int().positive().optional().nullable(),
  startedAt:           z.string().date().optional().nullable(),
  completedAt:         z.string().date().optional().nullable(),
});
const analPatch = analCreate.partial();

router.get('/ivd/analytical', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = analListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, study_type: st, pass_fail: pf, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid) { args.push(pid); filters.push(`program_id = $${args.length}`); }
  if (st)  { args.push(st);  filters.push(`study_type = $${args.length}`); }
  if (pf)  { args.push(pf);  filters.push(`pass_fail = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_analytical_performance
        WHERE ${filters.join(' AND ')}
        ORDER BY completed_at DESC NULLS LAST, started_at DESC NULLS LAST, id DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'anal-list', err);
  }
});

router.post('/ivd/analytical', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = analCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ivd_analytical_performance (
         organization_id, program_id, study_type, study_id, title, protocol_ref,
         acceptance_criterion, result_summary, pass_fail, n_samples, n_replicates,
         sites, analytes, matrix_type, report_artifact_id, started_at, completed_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'pending'), $10, $11,
         $12, $13, $14, $15, $16, $17
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.studyType, p.studyId ?? null, p.title,
        p.protocolRef ?? null, p.acceptanceCriterion ?? null, p.resultSummary ?? null,
        p.passFail ?? null, p.nSamples ?? null, p.nReplicates ?? null,
        p.sites ?? null, p.analytes ?? null, p.matrixType ?? null,
        p.reportArtifactId ?? null, p.startedAt ?? null, p.completedAt ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'anal-create', err);
  }
});

router.get('/ivd/analytical/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_analytical_performance WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Analytical performance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'anal-get', err);
  }
});

router.patch('/ivd/analytical/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = analPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', studyType: 'study_type', studyId: 'study_id', title: 'title',
    protocolRef: 'protocol_ref', acceptanceCriterion: 'acceptance_criterion',
    resultSummary: 'result_summary', passFail: 'pass_fail', nSamples: 'n_samples',
    nReplicates: 'n_replicates', sites: 'sites', analytes: 'analytes', matrixType: 'matrix_type',
    reportArtifactId: 'report_artifact_id', startedAt: 'started_at', completedAt: 'completed_at',
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
      `UPDATE ivd_analytical_performance SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Analytical performance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'anal-patch', err);
  }
});

/* ─── Clinical performance ──────────────────────────────────────── */

const PCT = z.number().min(0).max(100);
const clinListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});
const clinCreate = z.object({
  programId:               z.string().regex(UUID_RE).optional().nullable(),
  studyId:                 z.string().max(120).optional().nullable(),
  title:                   z.string().min(1).max(500),
  intendedPopulation:      z.string().max(2000).optional().nullable(),
  comparator:              z.string().max(500).optional().nullable(),
  comparatorKind:          z.enum(['predicate', 'clinical_truth', 'composite', 'follow_up']).optional().nullable(),
  totalSubjects:           z.number().int().nonnegative().optional().nullable(),
  positiveN:               z.number().int().nonnegative().optional().nullable(),
  negativeN:               z.number().int().nonnegative().optional().nullable(),
  sensitivityPct:          PCT.optional().nullable(),
  sensitivityLower:        PCT.optional().nullable(),
  sensitivityUpper:        PCT.optional().nullable(),
  specificityPct:          PCT.optional().nullable(),
  specificityLower:        PCT.optional().nullable(),
  specificityUpper:        PCT.optional().nullable(),
  ppvPct:                  PCT.optional().nullable(),
  npvPct:                  PCT.optional().nullable(),
  prevalencePct:           PCT.optional().nullable(),
  aucRoc:                  z.number().min(0).max(1).optional().nullable(),
  preSpecifiedEndpointMet: z.boolean().optional().nullable(),
  reportArtifactId:        z.number().int().positive().optional().nullable(),
});
const clinPatch = clinCreate.partial();

router.get('/ivd/clinical', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = clinListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid) { args.push(pid); filters.push(`program_id = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_clinical_performance WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'clin-list', err);
  }
});

router.post('/ivd/clinical', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = clinCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ivd_clinical_performance (
         organization_id, program_id, study_id, title, intended_population,
         comparator, comparator_kind, total_subjects, positive_n, negative_n,
         sensitivity_pct, sensitivity_lower, sensitivity_upper,
         specificity_pct, specificity_lower, specificity_upper,
         ppv_pct, npv_pct, prevalence_pct, auc_roc, pre_specified_endpoint_met,
         report_artifact_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.studyId ?? null, p.title, p.intendedPopulation ?? null,
        p.comparator ?? null, p.comparatorKind ?? null, p.totalSubjects ?? null,
        p.positiveN ?? null, p.negativeN ?? null,
        p.sensitivityPct ?? null, p.sensitivityLower ?? null, p.sensitivityUpper ?? null,
        p.specificityPct ?? null, p.specificityLower ?? null, p.specificityUpper ?? null,
        p.ppvPct ?? null, p.npvPct ?? null, p.prevalencePct ?? null,
        p.aucRoc ?? null, p.preSpecifiedEndpointMet ?? null, p.reportArtifactId ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'clin-create', err);
  }
});

router.get('/ivd/clinical/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_clinical_performance WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Clinical performance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'clin-get', err);
  }
});

router.patch('/ivd/clinical/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = clinPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', studyId: 'study_id', title: 'title',
    intendedPopulation: 'intended_population', comparator: 'comparator',
    comparatorKind: 'comparator_kind', totalSubjects: 'total_subjects',
    positiveN: 'positive_n', negativeN: 'negative_n',
    sensitivityPct: 'sensitivity_pct', sensitivityLower: 'sensitivity_lower',
    sensitivityUpper: 'sensitivity_upper', specificityPct: 'specificity_pct',
    specificityLower: 'specificity_lower', specificityUpper: 'specificity_upper',
    ppvPct: 'ppv_pct', npvPct: 'npv_pct', prevalencePct: 'prevalence_pct',
    aucRoc: 'auc_roc', preSpecifiedEndpointMet: 'pre_specified_endpoint_met',
    reportArtifactId: 'report_artifact_id',
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
      `UPDATE ivd_clinical_performance SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Clinical performance study');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'clin-patch', err);
  }
});

/* ─── GET /api/mdx/ivd/performance-summary/:programId ──────────── */

router.get('/ivd/performance-summary/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');

  /* Required analytical study types per the typical FDA IVD submission.
     The kit's surface uses this to compute completeness % against the
     right denominator. */
  const REQUIRED_ANAL: ReadonlyArray<(typeof ANAL_TYPE)[number]> = [
    'accuracy', 'precision', 'linearity', 'limit_of_detection',
    'analytical_specificity', 'interference', 'matrix_comparison',
    'reagent_stability',
  ];

  try {
    const analRows = await pool.query<{ study_type: string; n: number; pass: number }>(
      `SELECT study_type, COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE pass_fail = 'pass')::int AS pass
         FROM ivd_analytical_performance
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        GROUP BY study_type`,
      [orgId, programId],
    );
    const analByType = new Map(analRows.rows.map((r) => [r.study_type, r]));
    const analMatrix = REQUIRED_ANAL.map((t) => ({
      studyType: t,
      required:  true,
      present:   (analByType.get(t)?.n ?? 0) > 0,
      passed:    (analByType.get(t)?.pass ?? 0) > 0,
    }));
    const analComplete = analMatrix.filter((m) => m.passed).length;
    const analCompletion = REQUIRED_ANAL.length === 0
      ? 0
      : Math.round((analComplete / REQUIRED_ANAL.length) * 100);

    const clin = await pool.query<{
      n: number; latest_sens: string | null; latest_spec: string | null;
      endpoints_met: number;
    }>(
      `SELECT
          COUNT(*)::int                                     AS n,
          (ARRAY_AGG(sensitivity_pct ORDER BY updated_at DESC) FILTER (WHERE sensitivity_pct IS NOT NULL))[1] AS latest_sens,
          (ARRAY_AGG(specificity_pct ORDER BY updated_at DESC) FILTER (WHERE specificity_pct IS NOT NULL))[1] AS latest_spec,
          COUNT(*) FILTER (WHERE pre_specified_endpoint_met = true)::int AS endpoints_met
         FROM ivd_clinical_performance
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
    );
    const c = clin.rows[0] ?? { n: 0, latest_sens: null, latest_spec: null, endpoints_met: 0 };

    return ok(res, {
      analytical: {
        completion: analCompletion,
        required:   REQUIRED_ANAL.length,
        passed:     analComplete,
        matrix:     analMatrix,
      },
      clinical: {
        studyCount:        c.n,
        latestSensitivity: c.latest_sens !== null ? Number(c.latest_sens) : null,
        latestSpecificity: c.latest_spec !== null ? Number(c.latest_spec) : null,
        endpointsMet:      c.endpoints_met,
      },
    });
  } catch (err) {
    return serverError(res, log, 'perf-summary', err);
  }
});

/* ── GET /api/mdx/ivd/:programId — kit-shaped aggregate ──────────────────────
 * The IVD Pathway surface (client useIvd) consumes a single payload
 * { analytical, clinical, refmats, kpis } for the selected program. Assembles
 * it from ivd_analytical_performance + ivd_clinical_performance. refmats has
 * no backing table → empty. Registered LAST so it does not shadow the literal
 * /ivd/analytical, /ivd/clinical, /ivd/performance-summary routes above. */
router.get('/ivd/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  try {
    const anal = await pool.query(
      `SELECT id, study_type, study_id, title, protocol_ref, acceptance_criterion,
              result_summary, pass_fail, n_samples, completed_at
         FROM ivd_analytical_performance
        WHERE organization_id = $1 AND program_id::text = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const analytical = anal.rows.map((r: Record<string, unknown>) => ({
      id: (r.study_id as string) ?? `AP-${r.id}`,
      study: (r.study_type as string) ?? (r.title as string) ?? '',
      clsi: (r.protocol_ref as string) ?? '',
      state: r.completed_at ? 'complete' : 'in-progress',
      owner: '',
      n: (r.n_samples as number) ?? 0,
      target: (r.acceptance_criterion as string) ?? '',
      result: (r.result_summary as string) ?? '',
      pass: String(r.pass_fail ?? '').toLowerCase() === 'pass',
    }));

    const clin = await pool.query(
      `SELECT id, study_id, title, intended_population, comparator, total_subjects,
              sensitivity_pct, specificity_pct, pre_specified_endpoint_met
         FROM ivd_clinical_performance
        WHERE organization_id = $1 AND program_id::text = $2 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 200`,
      [orgId, programId],
    ).catch((e) => { if ((e as { code?: string }).code === '42P01') return { rows: [] }; throw e; });

    const clinical = clin.rows.map((r: Record<string, unknown>) => {
      const sens = r.sensitivity_pct != null ? `${r.sensitivity_pct}%` : '';
      const spec = r.specificity_pct != null ? `${r.specificity_pct}%` : '';
      return {
        id: (r.study_id as string) ?? `CP-${r.id}`,
        study: (r.title as string) ?? '',
        n: (r.total_subjects as number) ?? 0,
        target: (r.comparator as string) ?? '',
        result: [sens, spec].filter(Boolean).join(' / '),
        state: r.pre_specified_endpoint_met != null ? 'complete' : 'in-progress',
        pass: r.pre_specified_endpoint_met === true,
        population: (r.intended_population as string) ?? '',
      };
    });

    const kpis = [
      { label: 'Analytical studies', metric: String(analytical.length), meta: `${analytical.filter((a) => a.pass).length} passing` },
      { label: 'Clinical studies', metric: String(clinical.length), meta: `${clinical.filter((c) => c.pass).length} endpoint met` },
    ];

    return ok(res, { analytical, clinical, refmats: [], kpis });
  } catch (err) {
    return serverError(res, log, 'ivd-aggregate', err);
  }
});

export default router;
