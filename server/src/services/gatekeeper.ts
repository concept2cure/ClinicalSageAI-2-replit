import { getPool } from '../../db';

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
import { evalPolicy } from './policy';
import { aiReleaseDecision } from './ai/quality';
import { nelson, cusum } from './ai/quality'; // already defined in Step 2 Pro
import { logDecision } from './xai';

/** Build context flags for policy & blockers list */
export async function buildGateContext(batchId: string) {
  const [{ rows: tests }, { rows: alerts }, { rows: links }] = await Promise.all([
    q<any>(
      `select t.test_id,t.name,t.method_id,coalesce(m.status,'') as method_status from qc_tests t left join cmc_methods m on m.id=t.method_id where t.batch_id=$1`,
      [batchId]
    ),
    q<any>(`select * from qc_alerts where batch_id=$1 and status='OPEN'`, [batchId]),
    q<any>(`select * from qc_linkages where batch_id=$1`, [batchId]),
  ]);
  const critical = tests.filter((t: any) => /assay|dissolution|uniform/i.test(t.name || ''));
  const missingMethods = critical
    .filter((t: any) => !/VALIDATED|APPROVED/i.test(t.method_status || ''))
    .map((t: any) => t.name);
  const flags: any = {
    criticalMethodsValidated: missingMethods.length === 0,
    noOpenAlerts: alerts.length === 0,
    sstCurrent: true, // enforcement happens on insert; flag assumed true unless you track expiry here
  };

  // Trend-aware flags (Nelson/CUSUM across critical tests)
  let trendBad = false;
  for (const t of critical) {
    const pts = (
      await q<any>(
        `select value::float as v from qc_results where test_id=$1 and value ~ '^[0-9.]+$' order by created_at desc limit 50`,
        [t.test_id]
      )
    ).rows
      .reverse()
      .map((x: any) => x.v);
    if (pts.length >= 8) {
      const n = nelson(pts);
      const c = cusum(pts);
      if (n.length || (c?.breaches || []).length) trendBad = true;
    }
  }
  flags.trendStable = !trendBad;

  // flow verify issues (re-use)
  const flow = await q<any>(`select * from qc_linkages where batch_id=$1`, [batchId]);
  const link = flow.rows[0] || {};
  const issues: any[] = [];
  if (!link.process_id)
    issues.push({ id: 'UP-001', severity: 'WARN', msg: 'No process linkage', fixable: false });
  if (!link.stability_study_id)
    issues.push({ id: 'UP-002', severity: 'WARN', msg: 'No stability linkage', fixable: false });
  if (missingMethods.length)
    issues.push({
      id: 'AN-001',
      severity: 'CRITICAL',
      msg: `Critical tests missing validated methods: ${missingMethods.join(', ')}`,
      fixable: false,
    });
  if (alerts.length)
    issues.push({
      id: 'QC-ALERT',
      severity: 'CRITICAL',
      msg: `Open alerts: ${alerts.length}`,
      fixable: false,
    });
  if (trendBad)
    issues.push({
      id: 'TREND',
      severity: 'WARN',
      msg: 'Nelson/CUSUM breaches detected',
      fixable: false,
    });

  return { flags, issues, linkages: link, tests, alerts };
}

/** Evaluate Gatekeeper => status + blockers */
export async function gateEvaluate(batchId: string) {
  const sum = (await q<any>(`select * from qc_batches where batch_id=$1`, [batchId])).rows[0];
  const ctx = await buildGateContext(batchId);

  // Policy
  const { rows: pol } = await q<any>(
    `select rule_json from qc_policies where product_id=$1 and active=true order by created_at desc limit 1`,
    [sum.product_id || 'DP-001']
  );
  const policy = pol[0]?.rule_json || {};
  const policyEval = evalPolicy(policy, { flags: ctx.flags });

  // AI decision
  const summary = await (
    await fetch(`${process.env.APP_ORIGIN || ''}/api/quality/batches/${batchId}/summary`)
  )
    .json()
    .catch(() => ({}));
  const ai = await aiReleaseDecision(summary);

  // Collate blockers
  const blockers = [...ctx.issues];
  if (!policyEval.ok)
    blockers.push({
      id: 'POLICY',
      severity: 'CRITICAL',
      msg: `Policy failed: ${policyEval.trail.join(' ; ')}`,
      fixable: false,
    });
  if (ai.decision && /HOLD|REJECT/i.test(ai.decision))
    blockers.push({
      id: 'AI',
      severity: 'WARN',
      msg: `AI decision: ${ai.decision} (risk ${ai.risk ?? '—'})`,
      fixable: false,
    });

  const status = blockers.some(b => /CRITICAL/.test(b.severity))
    ? 'REJECT'
    : blockers.length
      ? 'HOLD'
      : 'PASS';

  // Log decision (XAI)
  await logDecision(
    batchId,
    'POLICY',
    { policy, flags: ctx.flags },
    { ok: policyEval.ok, trail: policyEval.trail },
    policyEval.trail.join(' ; ')
  );
  await logDecision(batchId, 'AI_RELEASE', summary, ai, ai.rationale || '');

  const inputs = { flags: ctx.flags, policy, aiDecision: ai.decision, aiRisk: ai.risk };
  return { status, blockers, inputs };
}

/** Apply safe auto-fixes (non-destructive); returns list of fixes applied */
export async function gateApplySafeFixes(batchId: string, blockers: any[]) {
  const fixes: any[] = [];
  for (const b of blockers) {
    // Example safe fixes: none yet (record SST would require data entry; linking requires human)
    // In future: auto-ACK some WARN alerts or open CAPA automatically:
    if (b.id === 'QC-ALERT') {
      await q(`insert into qc_capa (batch_id,title,why,status) values ($1,$2,$3,'OPEN')`, [
        batchId,
        'Investigate QC alerts',
        'Gatekeeper opened CAPA',
      ]);
      fixes.push({ id: 'CAPA_OPEN', detail: 'Opened CAPA for QC alerts' });
    }
  }
  return fixes;
}
