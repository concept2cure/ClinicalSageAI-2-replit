import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

const q = async <T = any>(query: string, params: any[] = []): Promise<{ rows: T[] }> => {
  if (!pool) throw new Error('Database pool not initialized');
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
};

export async function computeRPI(subId: string) {
  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
  if (!sub) throw new Error('Submission not found');

  // M3 completeness
  const m3 = (
    await q<any>(
      `select count(*)::int as total,
                                   sum(case when status in ('READY','LOCKED') then 1 else 0 end)::int as ready
                            from reg_m3_sections where sub_id=$1`,
      [subId]
    )
  ).rows[0];
  const m3Completeness = m3.total ? Math.round(100 * (m3.ready / m3.total)) : 0;

  // P3/P5/P8 health proxies
  const p3 =
    (
      await q<any>(
        `select up_proc from reg_m3_sections where sub_id=$1 and code like '3.2.P.3%' limit 1`,
        [subId]
      )
    ).rows[0]?.up_proc || {};
  const p5 =
    (
      await q<any>(
        `select up_quality from reg_m3_sections where sub_id=$1 and code like '3.2.P.5%' limit 1`,
        [subId]
      )
    ).rows[0]?.up_quality || {};
  const p8 =
    (
      await q<any>(
        `select up_stability from reg_m3_sections where sub_id=$1 and code like '3.2.P.8%' limit 1`,
        [subId]
      )
    ).rows[0]?.up_stability || {};

  const p3Score = p3.controls ? Math.max(0, 100 - (p3.uncovered_cpp || 0) * 15) : 50;
  const p5Score = p5.specs ? Math.max(0, 100 - (p5.unvalidated_methods || 0) * 25) : 50;
  const p8Score = p8.coverage_months
    ? Math.min(100, Math.round((p8.coverage_months / 12) * 100))
    : 40;

  // Methods validation coverage
  const unval = p5.unvalidated_methods || 0;
  const methods = Math.max(0, 100 - unval * 20);

  // IR pressure (due/overdue)
  const ir = (
    await q<any>(
      `select sum(case when due_date < now()::date then 1 else 0 end)::int as over,
                                    sum(case when due_date between now()::date and now()::date + 7 then 1 else 0 end)::int as soon
                             from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
      [subId]
    )
  ).rows[0];
  const irPressure = Math.max(0, 100 - ((ir.over || 0) * 30 + (ir.soon || 0) * 15));

  // Changes unresolved
  const ch = (
    await q<any>(
      `select count(*)::int as hi from reg_changes where product_id=$1 and status not in ('CLOSED')
                              and (regions_json->'FDA'->>'class' in ('PAS') or regions_json->'EMA'->>'class' = 'Type II'
                                   or jsonb_typeof(regions_json)='object' = false)`,
      [sub.product_id]
    )
  ).rows[0];
  const changes = Math.max(0, 100 - (ch.hi || 0) * 20);

  // QC trend risk proxy (simplified for now)
  const trendRisk = 85; // Default good score

  // Weighted composite
  const w = { m3: 30, p3: 15, p5: 15, p8: 10, methods: 10, ir: 10, changes: 5, trend: 5 };
  const rpi = Math.round(
    (m3Completeness * w.m3 +
      p3Score * w.p3 +
      p5Score * w.p5 +
      p8Score * w.p8 +
      methods * w.methods +
      irPressure * w.ir +
      changes * w.changes +
      trendRisk * w.trend) /
      (w.m3 + w.p3 + w.p5 + w.p8 + w.methods + w.ir + w.changes + w.trend)
  );

  const components = {
    m3Completeness,
    p3: p3Score,
    p5: p5Score,
    p8: p8Score,
    methods,
    stability: p8Score,
    irPressure,
    changes,
    trendRisk,
  };
  return { rpi, components };
}
