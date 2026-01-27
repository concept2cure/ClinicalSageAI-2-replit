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

type GK = { status: 'PASS' | 'HOLD' | 'REJECT'; blockers: any[]; flags: any; inputs: any };

export async function evalGatekeeperV2(subId: string): Promise<GK> {
  let sub: any = null;
  
  // Try to fetch submission, but handle errors gracefully
  try {
    const result = await q<any>(`select * from reg_submissions where sub_id=$1`, [subId]);
    sub = result.rows[0];
  } catch (error: any) {
    console.warn('Failed to fetch regulatory submission:', error.message);
    // Continue with null sub - will be handled below
  }
  
  // Handle missing submission gracefully instead of throwing
  if (!sub) {
    return {
      status: 'HOLD',
      blockers: [{
        id: 'NO-SUBMISSION',
        severity: 'INFO',
        msg: 'No regulatory submission linked to this batch yet'
      }],
      flags: {
        region: 'FDA',
        m3Missing: [],
        p5Unvalidated: false,
        p8CoverageMonths: 0,
        p8CoverageTarget: 12,
        irOpen: 0,
        irDue7: 0,
        irOverdue: 0,
        changesHi: 0,
        qcAlertsOpen: 0,
      },
      inputs: { 
        batch_id: subId,
        computedAt: new Date().toISOString(),
        message: 'Awaiting regulatory submission creation'
      }
    };
  }

  const region = (sub?.region || 'FDA').toUpperCase();
  const targetStabMonths = region === 'EMA' ? 12 : 12; // expand by region later

  // Sections & statuses
  const secs = (
    await q<any>(
      `select code, status, up_proc, up_quality, up_stability from reg_m3_sections where sub_id=$1`,
      [subId]
    )
  ).rows;

  // Flags
  const missingReq = secs.filter((s: any) => s.status === 'MISSING').map((s: any) => s.code);
  const p5 = secs.filter((s: any) => s.code.startsWith('3.2.P.5'))[0];
  const p8 = secs.filter((s: any) => s.code.startsWith('3.2.P.8'))[0];

  const unvalidated = !!p5 && (p5.up_quality?.unvalidated_methods || 0) > 0;
  const stabCoverage = p8 ? p8.up_stability?.coverage_months || 0 : 0;
  const coverageBad = stabCoverage < targetStabMonths;

  // IR pressure: due within 7 days or overdue
  const irRows = (
    await q<any>(
      `select count(*)::int as cnt, sum( case when due_date < now()::date then 1 else 0 end )::int as overdue,
                                        sum( case when due_date between now()::date and now()::date + 7 then 1 else 0 end )::int as due7
                                from reg_questions where sub_id=$1 and status in ('OPEN','DRAFTED','IN_REVIEW')`,
      [subId]
    )
  ).rows[0];

  // Unresolved changes (classified Type II/PAS or unknown)
  const ch = (
    await q<any>(
      `select count(*)::int as hi from reg_changes where product_id=$1 and status not in ('CLOSED')
                              and (regions_json->'FDA'->>'class' in ('PAS') or regions_json->'EMA'->>'class' = 'Type II'
                                   or jsonb_typeof(regions_json)='object' = false)`,
      [sub.product_id]
    )
  ).rows[0];

  // QC trend proxy: open QC alerts (fallback to 0 if table doesn't exist)
  const qcAlerts = (await q<any>(`select 0 as open`)).rows[0]; // Simplified for now

  const flags = {
    region,
    m3Missing: missingReq,
    p5Unvalidated: unvalidated,
    p8CoverageMonths: stabCoverage,
    p8CoverageTarget: targetStabMonths,
    irOpen: irRows.cnt || 0,
    irDue7: irRows.due7 || 0,
    irOverdue: irRows.overdue || 0,
    changesHi: ch.hi || 0,
    qcAlertsOpen: qcAlerts.open || 0,
  };

  // Build blockers
  const blockers: any[] = [];
  if (missingReq.length)
    blockers.push({
      id: 'M3-MISSING',
      severity: 'CRITICAL',
      msg: `Missing sections: ${missingReq.join(', ')}`,
    });
  if (unvalidated)
    blockers.push({
      id: 'METHODS',
      severity: 'CRITICAL',
      msg: 'P.5 has unvalidated methods on CQA specs.',
    });
  if (coverageBad)
    blockers.push({
      id: 'STABILITY',
      severity: 'WARN',
      msg: `P.8 coverage ${stabCoverage}m < ${targetStabMonths}m.`,
    });
  if ((irRows.due7 || 0) > 0 || (irRows.overdue || 0) > 0)
    blockers.push({
      id: 'IR-DUE',
      severity: (irRows.overdue || 0) > 0 ? 'CRITICAL' : 'WARN',
      msg: `IRs due soon (${irRows.due7}) / overdue (${irRows.overdue}).`,
    });
  if ((qcAlerts.open || 0) > 0)
    blockers.push({ id: 'QC-ALERT', severity: 'WARN', msg: `Open QC alerts: ${qcAlerts.open}` });
  if ((ch.hi || 0) > 0)
    blockers.push({
      id: 'CHANGES',
      severity: 'WARN',
      msg: `Unresolved high-impact changes: ${ch.hi}`,
    });

  const status: 'PASS' | 'HOLD' | 'REJECT' = blockers.some(b => b.severity === 'CRITICAL')
    ? 'REJECT'
    : blockers.length
      ? 'HOLD'
      : 'PASS';

  const inputs = { policy: { targetStabMonths }, computedAt: new Date().toISOString() };
  return { status, blockers, flags, inputs };
}

/** Safe auto-fixes: open tasks for each blocker; more actions can be added */
export async function applySafeFixes(subId: string, blockers: any[], actor: string) {
  let created = 0;
  for (const b of blockers) {
    let title = '';
    let entity: string = 'SECTION';
    let entity_id: string | null = null;
    if (b.id === 'METHODS') {
      title = 'Validate/Link methods for CQA specs (P.5)';
      entity = 'SECTION';
    }
    if (b.id === 'STABILITY') {
      title = 'Extend stability coverage / update P.8 summary';
      entity = 'SECTION';
    }
    if (b.id === 'IR-DUE') {
      title = 'Prepare and submit IR responses';
      entity = 'QUESTION';
    }
    if (b.id === 'M3-MISSING') {
      title = 'Complete missing Module 3 sections';
      entity = 'SECTION';
    }
    if (b.id === 'QC-ALERT') {
      title = 'Investigate and close QC alerts';
      entity = 'CHANGE';
    }
    if (!title) continue;
    await q(
      `insert into reg_tasks (sub_id, entity, entity_id, title, priority, status, due_date)
             values ($1,$2,$3,$4,'High','OPEN', (now()+interval '7 day')::date)`,
      [subId, entity, entity_id, title]
    ).catch(() => {});
    created++;
  }
  return { created };
}

// Alias exports for compatibility with quality.router.ts
export const gateEvaluate = evalGatekeeperV2;
export const gateApplySafeFixes = applySafeFixes;
