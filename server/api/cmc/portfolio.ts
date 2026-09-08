import type { Request, Response, Router as RouterT } from 'express';
import express from 'express';
import { query as q } from '../../db.js';
import { getSecureOrgId } from '../../utils/tenantContext.js';
const router: RouterT = express.Router();

/** Resolve the authed org or end the request. reg_submissions.tenant_id is an integer. */
function requireTenantId(req: Request, res: Response): number | null {
  const orgId = getSecureOrgId(req);
  const tenantId = orgId == null ? NaN : Number(orgId);
  if (!Number.isFinite(tenantId)) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  return tenantId;
}

async function computeRPI(subId: string): Promise<{ rpi: number | null; components: Record<string, unknown> }> {
  // The real RPI engine. (The previous dynamic require pointed at
  // ../../services/reg/rpi — a path that has never existed — so every
  // portfolio row silently rendered a fabricated fallback score of 60.)
  try {
    const svc = await import('../../src/services/reg/rpi.js');
    const r = await svc.computeRPI(subId);
    return { rpi: r.rpi ?? null, components: r.components ?? {} };
  } catch (err: any) {
    // Honest degradation: no score rather than a fake one.
    console.warn(`[cmc-portfolio] RPI computation failed for ${subId}:`, err?.message ?? err);
    return { rpi: null, components: {} };
  }
}

/**
 * Org-wide critical (error-severity) pre-flight findings.
 *
 * Source: the `metadata.preflight` summary that the submission-ops preflight
 * endpoint (POST /api/submission-ops/packages/:packageId/preflight) persists
 * onto c2c_submission_packages at run time — a REAL, written-to source.
 * Submission packages are not linked to reg_submissions rows, so this is one
 * org-level aggregate repeated on every portfolio row (decision-register
 * item 1a, owner-approved).
 *
 * Returns null when no package in the org has ever run preflight — an honest
 * "not measured yet", never a fabricated zero.
 */
async function preflightCriticalForOrg(tenantId: number): Promise<number | null> {
  try {
    const row = (
      await q(
        // Only a summary that describes the package's CURRENT bundle counts:
        // the writers drop the summary with the bundle it described, and this
        // cross-check is the backstop so an orphaned summary (bundle cleared
        // or replaced, preflight not yet re-run) is never aggregated as the
        // package's current outcome.
        `select count(*)::int as ran,
                coalesce(sum((metadata->'preflight'->>'errorCount')::int), 0)::int as critical
           from c2c_submission_packages
          where org_id = $1
            and metadata->'preflight' is not null
            and metadata->'preflight'->>'bundleSha256' = metadata->'bundle'->>'sha256'`,
        [tenantId]
      )
    ).rows[0];
    if (!row || !(row.ran > 0)) return null;
    return row.critical ?? 0;
  } catch (err: any) {
    // Honest degradation (e.g. table absent in a partial deployment): null,
    // never a fake count.
    console.warn('[cmc-portfolio] preflight aggregation failed:', err?.message ?? err);
    return null;
  }
}

/** GET /overview — one row per submission with live metrics */
router.get('/overview', async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (tenantId == null) return;
  const subs = (
    await q(
      `select sub_id, product_id, region, sub_type as app_type from reg_submissions
       where tenant_id = $1 order by created_at desc`,
      [tenantId]
    )
  ).rows;

  // One org-level aggregate (packages are not linked to submissions).
  const preflightCritical = await preflightCriticalForOrg(tenantId);

  const out: any[] = [];
  for (const s of subs) {
    const ir = (
      await q(
        `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
                               from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
        [s.sub_id]
      )
    ).rows[0] || { n: 0, overdue: 0 };

    const obl = (
      await q(
        `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
                                from reg_obligations where sub_id=$1 and status in ('OPEN','IN_PROGRESS')`,
        [s.sub_id]
      )
    ).rows[0] || { n: 0, overdue: 0 };

    // Real Module 3 metrics from reg_m3_sections (same source the RPI
    // engine uses).
    const m3 = (
      await q(
        `select count(*) filter (where status not in ('READY','LOCKED'))::int as missing,
                (select (up_stability->>'coverage_months')::int
                   from reg_m3_sections
                  where sub_id = $1 and code like '3.2.P.8%' limit 1) as cov
           from reg_m3_sections where sub_id = $1`,
        [s.sub_id]
      )
    ).rows[0] || { missing: null, cov: null };
    const cov = m3.cov ?? null;
    const missing = m3.missing ?? null;
    // playbook_open / qc_alerts stay null: nothing real writes to a backing
    // store. The QC tables (shared/schema/qc-schemas.ts, legacy qc_alerts
    // migration) have no writers anywhere in the codebase, and the
    // cmc_workflow_* playbook tables exist only in an unapplied schema file
    // (server/database/cmc-playbook-schema.sql, never migrated) — counting
    // either would render a fake zero.
    const pbOpen = null;
    const qcOpen = null;

    const rpi = await computeRPI(s.sub_id);

    out.push({
      sub_id: s.sub_id,
      product_id: s.product_id,
      region: s.region,
      app_type: s.app_type,
      rpi: rpi.rpi,
      components: rpi.components,
      ir_open: ir.n,
      ir_overdue: ir.overdue,
      obligations_open: obl.n,
      obligations_overdue: obl.overdue,
      stability_cov_m: cov,
      m3_missing: missing,
      preflight_critical: preflightCritical,
      qc_alerts: qcOpen,
      playbook_open: pbOpen,
    });
  }
  res.json(out);
});

/** GET /rpi-trend?subId=&days= */
router.get('/rpi-trend', async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (tenantId == null) return;
  const subId = (req.query.subId || '').toString();
  const days = parseInt((req.query.days || '60').toString(), 10);
  const rows = (
    await q(
      `select date_trunc('day', rs.created_at) as d, avg(rs.rpi)::int rpi
       from reg_rpi_snapshots rs
       join reg_submissions s on s.sub_id = rs.sub_id
       where rs.sub_id = $1 and s.tenant_id = $3
         and rs.created_at >= now()-($2||' days')::interval
       group by 1 order by 1 asc`,
      [subId, days, tenantId]
    )
  ).rows;
  res.json(rows);
});

/** POST /snapshot/save — write one snapshot per submission now */
router.post('/snapshot/save', async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req, res);
  if (tenantId == null) return;
  const subs = (await q(`select sub_id from reg_submissions where tenant_id = $1`, [tenantId])).rows;
  let saved = 0;
  let skipped = 0;
  for (const s of subs) {
    const rpi = await computeRPI(s.sub_id);
    if (rpi.rpi == null) {
      // No fabricated snapshots: a failed computation is skipped, not stored.
      skipped++;
      continue;
    }
    await q(`insert into reg_rpi_snapshots (sub_id, rpi, components) values ($1,$2,$3)`, [
      s.sub_id,
      rpi.rpi,
      rpi.components,
    ]);
    saved++;
  }
  res.json({ saved, skipped });
});

/** GET /export.csv — portfolio table as CSV */
router.get('/export.csv', async (req: Request, res: Response) => {
  try {
    const tenantId = requireTenantId(req, res);
    if (tenantId == null) return;
    // Get data directly instead of trying to fetch from self
    const subs = (
      await q(
        `select sub_id, product_id, region, sub_type as app_type from reg_submissions
         where tenant_id = $1 order by created_at desc`,
        [tenantId]
      )
    ).rows;

    // Same org-level preflight aggregate as GET /overview.
    const preflightCritical = await preflightCriticalForOrg(tenantId);

    const headers = [
      'sub_id',
      'product_id',
      'region',
      'app_type',
      'rpi',
      'ir_open',
      'ir_overdue',
      'obligations_open',
      'obligations_overdue',
      'stability_cov_m',
      'm3_missing',
      'preflight_critical',
      'qc_alerts',
      'playbook_open',
    ];

    const rows = [];
    for (const s of subs) {
      // Same real metrics as GET /overview (previously this export wrote
      // hardcoded zeros for every metric column, including ones the
      // overview endpoint already computed from real tables).
      const rpi = await computeRPI(s.sub_id);
      const ir = (
        await q(
          `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
             from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
          [s.sub_id]
        )
      ).rows[0] || { n: 0, overdue: 0 };
      const obl = (
        await q(
          `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
             from reg_obligations where sub_id=$1 and status in ('OPEN','IN_PROGRESS')`,
          [s.sub_id]
        )
      ).rows[0] || { n: 0, overdue: 0 };
      const m3 = (
        await q(
          `select count(*) filter (where status not in ('READY','LOCKED'))::int as missing,
                  (select (up_stability->>'coverage_months')::int
                     from reg_m3_sections
                    where sub_id = $1 and code like '3.2.P.8%' limit 1) as cov
             from reg_m3_sections where sub_id = $1`,
          [s.sub_id]
        )
      ).rows[0] || { missing: null, cov: null };
      rows.push({
        sub_id: s.sub_id,
        product_id: s.product_id,
        region: s.region,
        app_type: s.app_type,
        rpi: rpi.rpi,
        ir_open: ir.n,
        ir_overdue: ir.overdue,
        obligations_open: obl.n,
        obligations_overdue: obl.overdue,
        stability_cov_m: m3.cov ?? '',
        m3_missing: m3.missing ?? '',
        // Org-level aggregate of persisted preflight runs; empty cell when
        // no package has run preflight (honest null, mirrors GET /overview).
        preflight_critical: preflightCritical ?? '',
        // No real written-to source exists (see GET /overview) — empty
        // cells, never fake zeros.
        qc_alerts: '',
        playbook_open: '',
      });
    }

    const csv = [headers.join(',')]
      .concat(rows.map((r: any) => headers.map(h => r[h] ?? '').join(',')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="portfolio.csv"');
    res.end(csv);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: 'Failed to generate CSV' });
  }
});

export default router;
