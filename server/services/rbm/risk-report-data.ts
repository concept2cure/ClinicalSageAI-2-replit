/**
 * Tenant-scoped loader that assembles the aggregated RiskReviewInput for the
 * risk-review report and the attention feed. Separated from the pure builders
 * (risk-report.ts) so both the /api/mdx route and the AnA tools share one query
 * path. Takes any pg-pool-like object so callers pass their own pool.
 *
 * @module server/services/rbm/risk-report-data
 */

import type { RiskReviewInput } from './risk-report';

interface PoolLike {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export async function loadRiskReviewInput(
  pool: PoolLike,
  orgId: number,
  programId: string,
  asOf: string,
): Promise<RiskReviewInput> {
  const [items, openCrit, kris, qtls, signals, sites, patients, actions, assessment] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE is_critical)::int critical,
              COUNT(*) FILTER (WHERE status IN ('open','mitigating'))::int open,
              COUNT(*) FILTER (WHERE risk_score >= 15)::int high
         FROM rbm_risk_items WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL`, [orgId, programId]),
    pool.query(
      `SELECT ctq_factor FROM rbm_risk_items
        WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL AND is_critical=true AND status IN ('open','mitigating')
        ORDER BY risk_score DESC NULLS LAST LIMIT 10`, [orgId, programId]),
    pool.query(
      `SELECT name, status FROM rbm_kris WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL AND status IN ('red','amber')`, [orgId, programId]),
    pool.query(
      `SELECT parameter, status FROM rbm_qtls WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL AND status IN ('breached','approaching')`, [orgId, programId]),
    pool.query(
      `SELECT title, severity, status FROM rbm_signals
        WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL AND status IN ('new','triaged','investigating')`, [orgId, programId]),
    pool.query(
      `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE monitoring_tier='enhanced')::int enhanced
         FROM rbm_site_risk_scores WHERE organization_id=$1 AND program_id=$2`, [orgId, programId]),
    pool.query(
      `SELECT COUNT(*)::int total,
              COUNT(*) FILTER (WHERE status='flagged')::int flagged,
              COUNT(*) FILTER (WHERE status='review')::int review
         FROM rbm_patient_profiles WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL`, [orgId, programId]),
    pool.query(
      `SELECT a.description, a.priority, to_char(a.due_date,'YYYY-MM-DD') AS due_date,
              (a.due_date < CURRENT_DATE AND a.status <> 'done') AS overdue,
              (a.status <> 'done') AS open
         FROM rbm_monitoring_actions a
         LEFT JOIN rbm_monitoring_plans p ON p.id = a.plan_id
        WHERE a.organization_id=$1 AND p.program_id=$2`, [orgId, programId]),
    pool.query(
      `SELECT title, framework, overall_risk, status, to_char(approved_at,'YYYY-MM-DD') AS approved_at
         FROM rbm_risk_assessments WHERE organization_id=$1 AND program_id=$2 AND deleted_at IS NULL
        ORDER BY (status='active') DESC, updated_at DESC LIMIT 1`, [orgId, programId]),
  ]);

  const krisRows = kris.rows as { name: string; status: string }[];
  const qtlRows = qtls.rows as { parameter: string; status: string }[];
  const sigRows = signals.rows as { title: string; severity: string }[];
  const actRows = actions.rows as { description: string; priority: string; due_date: string | null; overdue: boolean; open: boolean }[];
  const a = assessment.rows[0] as { title: string; framework: string; overall_risk: string | null; status: string; approved_at: string | null } | undefined;

  return {
    programId,
    asOf,
    assessment: a ? { title: a.title, framework: a.framework, overallRisk: a.overall_risk, status: a.status, approvedAt: a.approved_at } : null,
    riskItems: {
      total: items.rows[0].total, critical: items.rows[0].critical, open: items.rows[0].open, high: items.rows[0].high,
      openCritical: openCrit.rows.map((r: any) => r.ctq_factor),
    },
    kris: { total: krisRows.length, red: krisRows.filter(r => r.status === 'red').map(r => r.name), amber: krisRows.filter(r => r.status === 'amber').map(r => r.name) },
    qtls: { total: qtlRows.length, breached: qtlRows.filter(r => r.status === 'breached').map(r => r.parameter), approaching: qtlRows.filter(r => r.status === 'approaching').map(r => r.parameter) },
    signals: { open: sigRows.length, high: sigRows.filter(r => r.severity === 'high' || r.severity === 'critical').map(r => r.title) },
    sites: { total: sites.rows[0].total, enhanced: sites.rows[0].enhanced },
    patients: { total: patients.rows[0].total, flagged: patients.rows[0].flagged, review: patients.rows[0].review },
    actions: {
      open: actRows.filter(r => r.open).length,
      overdue: actRows.filter(r => r.overdue).map(r => ({ description: r.description, dueDate: r.due_date, priority: r.priority })),
    },
  };
}
