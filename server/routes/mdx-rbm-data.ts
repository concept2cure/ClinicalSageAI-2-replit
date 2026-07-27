/**
 * Risk-Based Monitoring — the data layer.
 *
 * Split out of mdx-rbm.ts, which owns the RBQM records themselves (risk
 * assessments, CtQ factors, KRIs, QTLs, signals, plans, actions, approvals).
 * This module owns getting data IN and the engine runs that derive from it:
 *
 *   Metric ingestion
 *     POST  /api/mdx/rbm-metric-ingest        land an extract + project it
 *     GET   /api/mdx/rbm-data-runs            ingestion history + provenance
 *
 *   Engine runs over that data
 *     POST  /api/mdx/rbm-site-risk/recompute      site risk from Site Intelligence
 *     POST  /api/mdx/rbm-central-monitoring/run   cross-site outlier scan
 *     POST  /api/mdx/rbm-patient-profiles/score   cohort anomaly scoring
 *     GET   /api/mdx/rbm-site-oversight/:programId
 *     GET//POST /api/mdx/rbm-patient-profiles
 *
 * Mounted at /api/mdx alongside mdx-rbm.ts. Same conventions throughout: raw
 * parameterized SQL over the shared pool, the api-response envelope, Zod
 * validation, tenant scoping via organization_id + deleted_at IS NULL.
 *
 * @module server/routes/mdx-rbm-data
 */

import { Router, Request } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import { recomputeSiteRisk } from '../services/rbm/site-risk-engine';
import {
  detectSiteOutliers, scorePatientCohort,
  type SiteMetric, type PatientMetric,
} from '../services/rbm/central-statistical-monitoring';
import { ingestMetrics, METRIC_SOURCES } from '../services/rbm/metric-ingestion';

const router = Router();
const log = createScopedLogger('mdx-rbm-data');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/** Every route here is scoped to one program. */
const seedProgramBody = z.object({ programId: z.string().regex(UUID_RE) });

router.post('/rbm-site-risk/recompute', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const snapshots = await recomputeSiteRisk(orgId, parsed.data.programId);
    return ok(res, snapshots, { count: snapshots.length });
  } catch (err) { return serverError(res, log, 'recompute-site-risk', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// CENTRAL STATISTICAL MONITORING (CluePoints SMART-style cross-site outliers)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Run unsupervised cross-site outlier detection over the program's site-risk
 * snapshot and raise a signal for each flagged site×dimension. Replaces prior
 * untriaged (status='new') central_stat signals so re-runs don't pile up;
 * triaged/investigating signals are preserved.
 */
router.post('/rbm-central-monitoring/run', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const { rows: sites } = await pool.query(
      `SELECT site_id, site_number, composite_risk, enrollment_risk, quality_risk, operational_risk
         FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
      [orgId, programId],
    );
    const cohort: SiteMetric[] = sites.map((s: any) => ({
      siteId: s.site_id ?? null,
      siteNumber: s.site_number ?? null,
      metrics: {
        composite: num(s.composite_risk),
        enrollment: num(s.enrollment_risk),
        quality: num(s.quality_risk),
        operational: num(s.operational_risk),
      },
    }));
    const findings = detectSiteOutliers(cohort);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM rbm_signals WHERE organization_id = $1 AND program_id = $2
           AND source = 'central_stat' AND status = 'new'`,
        [orgId, programId],
      );
      const inserted: unknown[] = [];
      for (const f of findings) {
        const { rows } = await client.query(
          `INSERT INTO rbm_signals (organization_id, program_id, site_id, source, signal_type, severity, title, detail, statistic, status)
           VALUES ($1,$2,$3,'central_stat',$4,$5,$6,$7,$8,'new') RETURNING *`,
          [
            orgId, programId, f.siteId, `outlier_${f.dimension}`, f.severity,
            `Site ${f.siteNumber ?? f.siteId ?? '?'} is a ${f.dimension}-risk outlier`,
            `Central statistical monitoring flagged this site: ${f.dimension} risk score ${f.value} is an outlier vs the study cohort (robust z ${f.score}).`,
            JSON.stringify({ dimension: f.dimension, value: f.value, score: f.score }),
          ],
        );
        inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      return ok(res, { findings, signals: inserted }, { cohortSize: cohort.length, flagged: findings.length });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { return serverError(res, log, 'central-monitoring-run', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// SITE OVERSIGHT (SPOT-style per-site profile)
// ════════════════════════════════════════════════════════════════════════════

/** Per-site oversight profile: risk + tier + drivers + open-signal count. */
router.get('/rbm-site-oversight/:programId', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const { rows } = await pool.query(
      `SELECT sr.site_id, sr.site_number, sr.site_name, sr.composite_risk, sr.monitoring_tier, sr.drivers,
              COALESCE(sig.open_signals, 0)::int AS open_signals,
              COALESCE(sig.high_signals, 0)::int AS high_signals
         FROM rbm_site_risk_scores sr
         LEFT JOIN (
           SELECT site_id,
                  COUNT(*) FILTER (WHERE status IN ('new','triaged','investigating')) AS open_signals,
                  COUNT(*) FILTER (WHERE status IN ('new','triaged','investigating') AND severity IN ('high','critical')) AS high_signals
             FROM rbm_signals
            WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
            GROUP BY site_id
         ) sig ON sig.site_id = sr.site_id
        WHERE sr.organization_id = $1 AND sr.program_id = $2
        ORDER BY sr.composite_risk DESC NULLS LAST, sr.site_number`,
      [orgId, programId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'site-oversight', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// PATIENT PROFILES (CluePoints-style patient-level anomaly detection)
// ════════════════════════════════════════════════════════════════════════════

const PATIENT_STATUS = ['normal', 'review', 'flagged'] as const;

const patientListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status: z.enum(PATIENT_STATUS).optional(),
});

router.get('/rbm-patient-profiles', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = patientListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`program_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_patient_profiles WHERE ${filters.join(' AND ')}
        ORDER BY anomaly_score DESC NULLS LAST, subject_id`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-patients', err); }
});

const upsertPatientBody = z.object({
  programId: z.string().regex(UUID_RE),
  subjectId: z.string().min(1).max(120),
  siteId: z.string().max(120).optional().nullable(),
  metrics: z.record(z.number()).default({}),
});

router.post('/rbm-patient-profiles', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = upsertPatientBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_patient_profiles (organization_id, program_id, site_id, subject_id, metrics)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organization_id, program_id, subject_id)
       DO UPDATE SET site_id = EXCLUDED.site_id, metrics = EXCLUDED.metrics, updated_at = NOW()
       RETURNING *`,
      [orgId, p.programId, p.siteId ?? null, p.subjectId, JSON.stringify(p.metrics)],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'upsert-patient', err); }
});

/** Run patient-level anomaly scoring across the program's cohort. */
router.post('/rbm-patient-profiles/score', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const { rows } = await pool.query(
      `SELECT id, subject_id, site_id, metrics FROM rbm_patient_profiles
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
    );
    const cohort: PatientMetric[] = rows.map((r: any) => ({
      subjectId: r.subject_id,
      siteId: r.site_id ?? null,
      metrics: (r.metrics && typeof r.metrics === 'object') ? r.metrics : {},
    }));
    const scored = scorePatientCohort(cohort);
    const byId = new Map(rows.map((r: any, i: number) => [r.id, scored[i]]));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        const s = byId.get(r.id)!;
        await client.query(
          `UPDATE rbm_patient_profiles
              SET anomaly_score = $1, top_dimension = $2, status = $3, scored_at = NOW(), updated_at = NOW()
            WHERE id = $4 AND organization_id = $5`,
          [s.anomalyScore, s.topDimension, s.status, r.id, orgId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const flagged = scored.filter(s => s.status === 'flagged').length;
    const review = scored.filter(s => s.status === 'review').length;
    return ok(res, scored, { cohortSize: cohort.length, flagged, review });
  } catch (err) { return serverError(res, log, 'score-patients', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// METRIC INGESTION (the load path feeding the KRI / QTL / patient engines)
// ════════════════════════════════════════════════════════════════════════════

const ingestBody = z.object({
  programId: z.string().regex(UUID_RE),
  source: z.enum(METRIC_SOURCES),
  sourceRef: z.string().max(500).optional().nullable(),
  dataCutoff: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  // Either a parsed row set or the raw delimited text. Row-level validation
  // happens in the service so the rules are identical for both.
  rows: z.array(z.record(z.unknown())).max(50_000).optional(),
  csv: z.string().max(20_000_000).optional(),
}).refine(b => b.rows !== undefined || b.csv !== undefined, {
  message: 'Provide either `rows` or `csv`',
});

/**
 * Land a metric extract for a program and project it onto the RBM engines.
 * Returns the run's real accepted/rejected counts, the per-row reject reasons,
 * and what the load actually changed — a caller must never have to assume a
 * row landed where it wanted it to.
 */
router.post('/rbm-metric-ingest', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = ingestBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await ingestMetrics(client, orgId, {
      ...parsed.data,
      ingestedBy: getUserId(req),
    });
    await client.query('COMMIT');
    return created(res, result, {
      runId: result.runId,
      status: result.status,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'metric-ingest', err);
  } finally {
    client.release();
  }
});

/** A program's ingestion history — newest first. */
router.get('/rbm-data-runs', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId && !UUID_RE.test(programId)) return clientError(res, 422, 'program_id must be a UUID');
  const filters = ['organization_id = $1'];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_data_runs WHERE ${filters.join(' AND ')}
        ORDER BY started_at DESC LIMIT 100`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'list-data-runs', err);
  }
});


export default router;
