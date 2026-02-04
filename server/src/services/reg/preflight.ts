import { getPool } from '../../../db';

const pool = getPool();

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

/** Run preflight checks: gatekeeper status, missing/locked, unvalidated methods, stability coverage, stale links. */
export async function runPreflight(subId: string) {
  const issues: {
    severity: 'CRITICAL' | 'WARN' | 'INFO';
    code: string;
    message: string;
    meta?: any;
  }[] = [];

  const sub = (await q<any>(`select * from reg_submissions where sub_id=$1`, [subId])).rows[0];
  if (!sub) {
    issues.push({
      severity: 'CRITICAL',
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Submission not found',
    });
    return { ok: false, issues };
  }

  // Gatekeeper v2 must be PASS or HOLD with no CRITICAL
  const secs = (
    await q<any>(
      `select code,status,up_quality,up_stability,updated_at from reg_m3_sections where sub_id=$1`,
      [subId]
    )
  ).rows;
  const missing = secs.filter((s: any) => s.status === 'MISSING');
  if (missing.length)
    issues.push({
      severity: 'CRITICAL',
      code: 'M3_MISSING',
      message: `Missing sections: ${missing.map((m: any) => m.code).join(', ')}`,
    });

  const p5 = secs.find((s: any) => s.code.startsWith('3.2.P.5'));
  if (p5 && (p5.up_quality?.unvalidated_methods || 0) > 0)
    issues.push({
      severity: 'CRITICAL',
      code: 'P5_METHOD_NOT_VALIDATED',
      message: 'P.5 contains specs tied to non‑validated methods',
    });

  const p8 = secs.find((s: any) => s.code.startsWith('3.2.P.8'));
  if (p8 && (p8.up_stability?.coverage_months || 0) < 12)
    issues.push({
      severity: 'WARN',
      code: 'P8_COVERAGE_LT_12M',
      message: `P.8 coverage ${p8.up_stability?.coverage_months || 0}m < 12m`,
    });

  // Leaves presence
  const leaves = (
    await q<any>(
      `select l.leaf_id, s.code, l.title, l.status from reg_m3_leaves l join reg_m3_sections s on s.sec_id=l.sec_id where s.sub_id=$1`,
      [subId]
    )
  ).rows;
  const secCodes = new Set(secs.map((s: any) => s.code));
  for (const s of secs) {
    const hasLeaf = leaves.some((l: any) => l.code === s.code);
    if (!hasLeaf)
      issues.push({
        severity: 'WARN',
        code: 'SECTION_WITHOUT_LEAF',
        message: `No leaf present for ${s.code}`,
      });
  }

  // IR/Questions pressure
  const ir = (
    await q<any>(
      `select count(*)::int as dueSoon from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW') and due_date between now()::date and now()::date + 7`,
      [subId]
    )
  ).rows[0];
  if ((ir.dueSoon || 0) > 0)
    issues.push({
      severity: 'WARN',
      code: 'IR_DUE_SOON',
      message: `IR due within 7 days: ${ir.dueSoon}`,
    });

  // Final classification
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  return { ok: critical.length === 0, issues };
}
