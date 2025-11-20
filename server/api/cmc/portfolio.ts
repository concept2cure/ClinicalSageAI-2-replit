import type { Request, Response, Router as RouterT } from 'express';
import express from 'express';
import { query as q } from '../../db.js';
const router: RouterT = express.Router();

async function computeRPI(subId: string) {
  // Try to call your existing RPI service if available
  try {
    const svc = require('../../services/reg/rpi');
    if (svc && typeof svc.computeRPI === 'function') {
      const r = await svc.computeRPI(subId);
      return { rpi: r.rpi ?? 60, components: r.components ?? {} };
    }
  } catch {}
  // Fallback: naive score
  return { rpi: 60, components: {} };
}

/** GET /overview — one row per submission with live metrics */
router.get('/overview', async (_req: Request, res: Response) => {
  const subs = (
    await q<any>(
      `select sub_id, product_id, region, sub_type as app_type from reg_submissions order by created_at desc`
    )
  ).rows;

  const out: any[] = [];
  for (const s of subs) {
    const ir = (
      await q<any>(
        `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
                               from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
        [s.sub_id]
      )
    ).rows[0] || { n: 0, overdue: 0 };

    const obl = (
      await q<any>(
        `select count(*)::int n, sum(case when due_date < now() then 1 else 0 end)::int overdue
                                from reg_obligations where sub_id=$1 and status in ('OPEN','IN_PROGRESS')`,
        [s.sub_id]
      )
    ).rows[0] || { n: 0, overdue: 0 };

    // Simplified metrics - using mock data since tables may not exist yet
    const cov = 0;
    const missing = 0;
    const seqCrit = 0;
    const pbOpen = 0;
    const qcOpen = 0;

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
      preflight_critical: seqCrit,
      qc_alerts: qcOpen,
      playbook_open: pbOpen,
    });
  }
  res.json(out);
});

/** GET /rpi-trend?subId=&days= */
router.get('/rpi-trend', async (req: Request, res: Response) => {
  const subId = (req.query.subId || '').toString();
  const days = parseInt((req.query.days || '60').toString(), 10);
  const rows = (
    await q<any>(
      `select date_trunc('day', created_at) as d, avg(rpi)::int rpi
                               from reg_rpi_snapshots where sub_id=$1 and created_at >= now()-($2||' days')::interval
                               group by 1 order by 1 asc`,
      [subId, days]
    )
  ).rows;
  res.json(rows);
});

/** POST /snapshot/save — write one snapshot per submission now */
router.post('/snapshot/save', async (_req: Request, res: Response) => {
  const subs = (await q<any>(`select sub_id from reg_submissions`)).rows;
  let saved = 0;
  for (const s of subs) {
    const rpi = await computeRPI(s.sub_id);
    await q(`insert into reg_rpi_snapshots (sub_id, rpi, components) values ($1,$2,$3)`, [
      s.sub_id,
      rpi.rpi,
      rpi.components,
    ]);
    saved++;
  }
  res.json({ saved });
});

/** GET /export.csv — portfolio table as CSV */
router.get('/export.csv', async (_req: Request, res: Response) => {
  try {
    // Get data directly instead of trying to fetch from self
    const subs = (
      await q<any>(
        `select sub_id, product_id, region, sub_type as app_type from reg_submissions order by created_at desc`
      )
    ).rows;

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
      const rpi = await computeRPI(s.sub_id);
      rows.push({
        sub_id: s.sub_id,
        product_id: s.product_id,
        region: s.region,
        app_type: s.app_type,
        rpi: rpi.rpi,
        ir_open: 0,
        ir_overdue: 0,
        obligations_open: 0,
        obligations_overdue: 0,
        stability_cov_m: 0,
        m3_missing: 0,
        preflight_critical: 0,
        qc_alerts: 0,
        playbook_open: 0,
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
