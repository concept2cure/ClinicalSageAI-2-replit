/**
 * Report-OS domain providers — research compliance + sponsored programs (C2C-01..15)
 *
 * Makes the registered report types ACTUALLY COMPUTE: for a given reportTypeId,
 * query the domain tables and return a real summary + a provider status. Merged
 * into the report run's dependencySummary at the route, so a report run returns
 * live numbers instead of an empty shell.
 *
 * Org-scoped, read-only. Pure SQL aggregation; no LLM.
 *
 * @module server/services/report-os/research-compliance-report-providers
 */

import { pool } from '../../db';

export interface DomainReportResult {
  summary: Record<string, unknown>;
  provider: { provider: string; observedAt: string; status: 'ready' | 'partial' | 'missing'; blocker?: string };
}

const now = () => new Date().toISOString();

/** Count rows grouped by a column → { value: count }. Org-scoped, excludes soft-deleted. */
async function countBy(table: string, col: string, orgId: number, extra = ''): Promise<{ total: number; byCol: Record<string, number> }> {
  const { rows } = await pool.query(
    `SELECT ${col} AS k, count(*)::int AS n FROM ${table} WHERE organization_id = $1 AND deleted_at IS NULL ${extra} GROUP BY ${col}`,
    [orgId],
  );
  const byCol: Record<string, number> = {};
  let total = 0;
  for (const r of rows) { byCol[String(r.k)] = r.n; total += r.n; }
  return { total, byCol };
}

function result(provider: string, total: number, summary: Record<string, unknown>, blocker?: string): DomainReportResult {
  return { summary, provider: { provider, observedAt: now(), status: total > 0 ? 'ready' : 'missing', blocker: total > 0 ? undefined : (blocker ?? `No ${provider} records for this organization`) } };
}

/**
 * Compute the real report summary for one of the research-compliance / sponsored-
 * programs report types. Returns null for unknown report types (so the generic
 * orchestrator output is used unchanged).
 */
export async function computeDomainReport(reportTypeId: string, orgId: number): Promise<DomainReportResult | null> {
  switch (reportTypeId) {
    case 'fcoi.disclosure_register': {
      const d = await countBy('financial_disclosures', 'status', orgId);
      const f = await countBy('financial_disclosures', 'form_type', orgId);
      return result('fcoi_disclosures', d.total, { disclosures: d.total, byStatus: d.byCol, byForm: f.byCol, signed: d.byCol['signed'] ?? 0 });
    }
    case 'ha.commitment_register': {
      const c = await countBy('regulatory_commitments', 'status', orgId);
      const overdue = (await pool.query(`SELECT count(*)::int n FROM regulatory_commitments WHERE organization_id=$1 AND deleted_at IS NULL AND status NOT IN ('fulfilled','waived','released') AND due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      return result('ha_commitments', c.total, { commitments: c.total, byStatus: c.byCol, overdue });
    }
    case 'iacuc.protocol_register': {
      const p = await countBy('iacuc_protocols', 'status', orgId);
      const expiring = (await pool.query(`SELECT count(*)::int n FROM iacuc_protocols WHERE organization_id=$1 AND deleted_at IS NULL AND status='approved' AND expiration_date < CURRENT_DATE + INTERVAL '90 days'`, [orgId])).rows[0].n;
      return result('iacuc_protocols', p.total, { protocols: p.total, byStatus: p.byCol, expiringOrExpired: expiring });
    }
    case 'irb.submission_register': {
      const s = await countBy('irb_submissions', 'status', orgId);
      const r = await countBy('irb_submissions', 'review_type', orgId);
      return result('irb_submissions', s.total, { submissions: s.total, byStatus: s.byCol, byReviewType: r.byCol });
    }
    case 'ibc.registration_register': {
      const s = await countBy('ibc_registrations', 'status', orgId);
      const b = await countBy('ibc_registrations', 'biosafety_level', orgId);
      return result('ibc_registrations', s.total, { registrations: s.total, byStatus: s.byCol, byBsl: b.byCol });
    }
    case 'nonclinical.study_send_register': {
      const s = await countBy('nonclinical_studies', 'status', orgId);
      const send = (await pool.query(`SELECT count(*)::int n FROM send_datasets WHERE organization_id=$1 AND deleted_at IS NULL AND validation_status='passed'`, [orgId])).rows[0].n;
      return result('nonclinical_studies', s.total, { studies: s.total, byStatus: s.byCol, sendValidated: send });
    }
    case 'grants.portfolio_register': {
      const aw = await countBy('grant_awards', 'status', orgId);
      const pr = await countBy('grant_proposals', 'status', orgId);
      const inv = await countBy('grant_invoices', 'status', orgId);
      const co = await countBy('grant_closeout_records', 'status', orgId);
      // Closeouts past their 2 CFR 200.344 due date and not yet completed.
      const overdueCloseouts = (await pool.query(`SELECT count(*)::int n FROM grant_closeout_records WHERE organization_id=$1 AND deleted_at IS NULL AND status <> 'completed' AND closeout_due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      const sub = await countBy('grant_subawards', 'screen_status', orgId);
      // Executed subawards that were never cleared by restricted-party screening (2 CFR 200.214 risk).
      const unscreenedExecuted = (await pool.query(`SELECT count(*)::int n FROM grant_subawards WHERE organization_id=$1 AND deleted_at IS NULL AND status='executed' AND screen_status <> 'cleared'`, [orgId])).rows[0].n;
      // Budget vs actual, org-wide (2 CFR 200.308/200.403).
      const totalBudgeted = Number((await pool.query(`SELECT COALESCE(sum(budgeted_amount),0)::float8 s FROM grant_budget_lines WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      const totalExpended = Number((await pool.query(`SELECT COALESCE(sum(amount),0)::float8 s FROM grant_expenditures WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      // Awards whose total expenditures exceed their authorized amount.
      const overspentAwards = (await pool.query(`SELECT count(*)::int n FROM (SELECT a.id FROM grant_awards a JOIN grant_expenditures e ON e.award_id=a.id AND e.deleted_at IS NULL WHERE a.organization_id=$1 AND a.deleted_at IS NULL AND a.total_amount IS NOT NULL GROUP BY a.id, a.total_amount HAVING sum(e.amount) > a.total_amount) x`, [orgId])).rows[0].n;
      return result('grants_portfolio', aw.total + pr.total, { awards: aw.total, awardsByStatus: aw.byCol, proposals: pr.total, proposalsByStatus: pr.byCol, invoicesByStatus: inv.byCol, closeoutsByStatus: co.byCol, overdueCloseouts, subawards: sub.total, subawardsByScreen: sub.byCol, unscreenedExecuted, totalBudgeted, totalExpended, overspentAwards });
    }
    case 'rim.registration_grid': {
      const r = await countBy('rim_registrations', 'market_status', orgId);
      const products = (await pool.query(`SELECT count(*)::int n FROM rim_products WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      return result('rim_registrations', r.total, { products, registrations: r.total, byMarketStatus: r.byCol, approved: r.byCol['approved'] ?? 0 });
    }
    case 'inspection.readiness_pack': {
      const i = await countBy('inspections', 'status', orgId);
      const find = await countBy('inspection_findings', 'classification', orgId);
      return result('inspections', i.total, { inspections: i.total, byStatus: i.byCol, findingsByClass: find.byCol });
    }
    case 'controlled_substances.inventory_ledger': {
      const s = await countBy('controlled_substances', 'dea_schedule', orgId);
      const reg = (await pool.query(`SELECT count(*)::int n FROM dea_registrations WHERE organization_id=$1 AND deleted_at IS NULL AND status='active'`, [orgId])).rows[0].n;
      const txns = (await pool.query(`SELECT count(*)::int n FROM cs_transactions WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      return result('controlled_substances', s.total, { substances: s.total, bySchedule: s.byCol, activeRegistrations: reg, transactions: txns });
    }
    case 'lifecycle.obligation_calendar': {
      const o = await countBy('lifecycle_obligations', 'status', orgId);
      const overdue = (await pool.query(`SELECT count(*)::int n FROM lifecycle_obligations WHERE organization_id=$1 AND deleted_at IS NULL AND status NOT IN ('approved','closed','submitted') AND due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      return result('lifecycle_obligations', o.total, { obligations: o.total, byStatus: o.byCol, overdue });
    }
    case 'etmf.completeness_pack': {
      const files = (await pool.query(`SELECT count(*)::int n FROM tmf_files WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      const a = await countBy('tmf_artifacts', 'status', orgId);
      const finalPct = a.total > 0 ? Math.round(((a.byCol['final'] ?? 0) / a.total) * 100) : 0;
      return result('etmf', files, { tmfFiles: files, artifacts: a.total, byStatus: a.byCol, finalPct });
    }
    case 'research_compliance.training_status': {
      const ppl = (await pool.query(`SELECT count(*)::int n FROM research_personnel WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      const expired = (await pool.query(`SELECT count(*)::int n FROM personnel_training WHERE organization_id=$1 AND deleted_at IS NULL AND expires_date < CURRENT_DATE`, [orgId])).rows[0].n;
      const t = await countBy('personnel_training', 'training_type', orgId);
      return result('research_compliance_training', ppl, { personnel: ppl, trainingRecords: t.total, byType: t.byCol, expired });
    }
    case 'effort.certification_register': {
      const c = await countBy('effort_certifications', 'status', orgId);
      // Lines where actual deviates materially from committed on a sponsored award (2 CFR 200.430) — recert candidates.
      const recert = (await pool.query(`SELECT count(DISTINCT certification_id)::int n FROM effort_lines WHERE organization_id=$1 AND deleted_at IS NULL AND award_id IS NOT NULL AND abs(actual_pct - committed_pct) > 25`, [orgId])).rows[0].n;
      return result('effort_certifications', c.total, { statements: c.total, byStatus: c.byCol, certified: c.byCol['certified'] ?? 0, recertCandidates: recert });
    }
    case 'research_security.coi_register': {
      const d = await countBy('coi_disclosures', 'status', orgId);
      const ty = await countBy('coi_disclosures', 'disclosure_type', orgId);
      // Foreign nexus: foreign appointment/support type OR a non-US country (NSPM-33 / NOT-OD-26-017).
      const foreign = (await pool.query(`SELECT count(*)::int n FROM coi_disclosures WHERE organization_id=$1 AND deleted_at IS NULL AND (disclosure_type IN ('foreign_appointment','foreign_support') OR (country IS NOT NULL AND upper(country) <> 'US'))`, [orgId])).rows[0].n;
      return result('research_security_coi', d.total, { disclosures: d.total, byStatus: d.byCol, byType: ty.byCol, foreignNexus: foreign, unmanagedConflicts: d.byCol['conflict'] ?? 0 });
    }
    default:
      return null;
  }
}

/** The report type ids this provider module computes. */
export const DOMAIN_REPORT_TYPE_IDS = [
  'fcoi.disclosure_register', 'ha.commitment_register', 'iacuc.protocol_register', 'irb.submission_register',
  'ibc.registration_register', 'nonclinical.study_send_register', 'grants.portfolio_register', 'rim.registration_grid',
  'inspection.readiness_pack', 'controlled_substances.inventory_ledger', 'lifecycle.obligation_calendar',
  'etmf.completeness_pack', 'research_compliance.training_status',
  'effort.certification_register', 'research_security.coi_register',
] as const;
