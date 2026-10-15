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
import type { InsightAtomRef } from './providers/types';
import { UnsupportedReportClientScope } from './client-scope';

export interface DomainReportResult {
  summary: Record<string, unknown>;
  provider: { provider: string; observedAt: string; status: 'ready' | 'partial' | 'missing'; blocker?: string; atoms?: InsightAtomRef[]; calculation?: Record<string, unknown> };
  computedScope: 'organization' | 'project';
  provenance: { observedAt: string; organizationId: number; computedScope: string; queries: Array<{ query: string; parameters: unknown[]; rows: unknown[] }> };
}

export interface DomainReportOptions { scopeType?: string; scopeId?: string; clientWorkspaceId?: number | null }
export { UnsupportedReportClientScope } from './client-scope';

const now = () => new Date().toISOString();

/** Count rows grouped by a column → { value: count }. Org-scoped, excludes soft-deleted.
 *  A NULL value counts under `nullKey`; it was keyed "null" (2026-10-15). The
 *  `extra` predicate it replaced had no caller. */
async function groupedCount(query: typeof pool.query, table: string, col: string, orgId: number, nullKey = 'not_recorded'): Promise<{ total: number; byCol: Record<string, number> }> {
  const { rows } = await query(
    `SELECT ${col} AS k, count(*)::int AS n FROM ${table} WHERE organization_id = $1 AND deleted_at IS NULL GROUP BY ${col}`,
    [orgId],
  );
  const byCol: Record<string, number> = {};
  let total = 0;
  for (const r of rows) { byCol[r.k == null ? nullKey : String(r.k)] = r.n; total += r.n; }
  return { total, byCol };
}

/**
 * Approved IACUC protocols expiring within 90 days or expired. The expiry is the
 * one on record, else approval + 3 years (PHS Policy IV.C.5 de novo), counted
 * apart as computed; an approval with neither date is counted as not determined.
 * 2026-10-15: the approve path stopped storing a computed expiry, and approvals
 * with none on record dropped out of expiringOrExpired.
 */
async function iacucExpiry(query: typeof pool.query, orgId: number) {
  const { rows } = await query(
    `SELECT count(*) FILTER (WHERE COALESCE(expiration_date, (approval_date + INTERVAL '3 years')::date) < CURRENT_DATE + INTERVAL '90 days')::int AS n,
            count(*) FILTER (WHERE expiration_date IS NULL AND (approval_date + INTERVAL '3 years')::date < CURRENT_DATE + INTERVAL '90 days')::int AS computed,
            count(*) FILTER (WHERE expiration_date IS NULL AND approval_date IS NULL)::int AS undetermined
       FROM iacuc_protocols WHERE organization_id=$1 AND deleted_at IS NULL AND status='approved'`,
    [orgId],
  );
  const { n, computed, undetermined } = rows[0] as { n: number; computed: number; undetermined: number };
  return {
    expiringOrExpired: n,
    expiringOrExpiredByExpirySource: { recorded: n - computed, computed_approval_plus_3_years: computed },
    approvedExpiryNotDetermined: undetermined,
  };
}

/**
 * Compute the real report summary for one of the research-compliance / sponsored-
 * programs report types. Returns null for unknown report types (so the generic
 * orchestrator output is used unchanged).
 */
export async function computeDomainReport(reportTypeId: string, orgId: number, options?: DomainReportOptions): Promise<DomainReportResult | null> {
  // These registers have no client-workspace association. A workspace claim
  // cannot be interpreted as a filter over the organisation's entire register.
  const projectId = reportTypeId === 'grants.portfolio_register' && options?.scopeType === 'project' ? Number(options.scopeId) : undefined;
  if (projectId != null && (!Number.isSafeInteger(projectId) || projectId <= 0)) throw new Error('A grants project filter requires a valid project id.');
  if (options?.clientWorkspaceId != null && projectId == null) throw new UnsupportedReportClientScope('This register cannot be filtered to a client workspace; its records are organization-wide.');
  const computedScope = projectId == null ? 'organization' : 'project';
  const observedAt = now();
  const queries: DomainReportResult['provenance']['queries'] = [];
  const query = (async (input: string, args: unknown[]) => {
    let text = input;
    let parameters = args;
    if (projectId != null) {
      const table = /FROM\s+(grant_[a-z_]+)/i.exec(text)?.[1];
      const predicate = table === 'grant_awards' || table === 'grant_proposals'
        ? `${text.includes('FROM grant_awards a JOIN') ? 'a.' : ''}project_id = $2`
        : `award_id IN (SELECT id FROM grant_awards WHERE organization_id = $1 AND deleted_at IS NULL AND project_id = $2)`;
      text = text.replace(/WHERE (a\.)?organization_id\s*=\s*\$1/, (where) => `${where} AND ${predicate}`);
      parameters = [...args, projectId];
    }
    const response = await pool.query(text, parameters);
    queries.push({ query: text, parameters, rows: response.rows });
    return response;
  }) as typeof pool.query;
  const countBy = (table: string, column: string, organizationId: number, nullKey?: string) => groupedCount(query, table, column, organizationId, nullKey);
  const result = (provider: string, total: number, summary: Record<string, unknown>, blocker?: string): DomainReportResult => {
    const tables = [...new Set(queries.flatMap((q) => [...q.query.matchAll(/(?:FROM|JOIN)\s+([a-z_]+)/gi)].map((m) => m[1])))];
    const atoms: InsightAtomRef[] = tables.map((sourceTable) => ({ sourceTable, transformation: 'aggregation' }));
    return { summary, computedScope, provenance: { observedAt, organizationId: orgId, computedScope, queries }, provider: {
      provider, observedAt, status: total > 0 ? 'ready' : 'missing',
      blocker: total > 0 ? undefined : (blocker ?? `No ${provider} records for this ${computedScope}`), atoms,
      calculation: { method: 'SQL aggregates over recorded, non-deleted rows', computedScope, ...(projectId ? { projectId } : {}) },
    } };
  };
  switch (reportTypeId) {
    case 'fcoi.disclosure_register': {
      const d = await countBy('financial_disclosures', 'status', orgId);
      const f = await countBy('financial_disclosures', 'form_type', orgId);
      return result('fcoi_disclosures', d.total, { disclosures: d.total, byStatus: d.byCol, byForm: f.byCol, signed: d.byCol['signed'] ?? 0 });
    }
    case 'ha.commitment_register': {
      const c = await countBy('regulatory_commitments', 'status', orgId);
      const overdue = (await query(`SELECT count(*)::int n FROM regulatory_commitments WHERE organization_id=$1 AND deleted_at IS NULL AND status NOT IN ('fulfilled','waived','released') AND due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      return result('ha_commitments', c.total, { commitments: c.total, byStatus: c.byCol, overdue });
    }
    case 'iacuc.protocol_register': {
      const p = await countBy('iacuc_protocols', 'status', orgId);
      return result('iacuc_protocols', p.total, { protocols: p.total, byStatus: p.byCol, ...(await iacucExpiry(query, orgId)) });
    }
    case 'irb.submission_register': {
      const s = await countBy('irb_submissions', 'status', orgId);
      const r = await countBy('irb_submissions', 'review_type', orgId);
      return result('irb_submissions', s.total, { submissions: s.total, byStatus: s.byCol, byReviewType: r.byCol });
    }
    case 'ibc.registration_register': {
      const s = await countBy('ibc_registrations', 'status', orgId);
      const b = await countBy('ibc_registrations', 'biosafety_level', orgId, 'not_declared');
      return result('ibc_registrations', s.total, { registrations: s.total, byStatus: s.byCol, byBsl: b.byCol });
    }
    case 'nonclinical.study_send_register': {
      const s = await countBy('nonclinical_studies', 'status', orgId);
      const send = (await query(`SELECT count(*)::int n FROM send_datasets WHERE organization_id=$1 AND deleted_at IS NULL AND validation_status='passed'`, [orgId])).rows[0].n;
      return result('nonclinical_studies', s.total, { studies: s.total, byStatus: s.byCol, sendValidated: send });
    }
    case 'grants.portfolio_register': {
      const aw = await countBy('grant_awards', 'status', orgId);
      const pr = await countBy('grant_proposals', 'status', orgId);
      const inv = await countBy('grant_invoices', 'status', orgId);
      const co = await countBy('grant_closeout_records', 'status', orgId);
      // Closeouts past their 2 CFR 200.344 due date and not yet completed.
      const overdueCloseouts = (await query(`SELECT count(*)::int n FROM grant_closeout_records WHERE organization_id=$1 AND deleted_at IS NULL AND status <> 'completed' AND closeout_due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      const sub = await countBy('grant_subawards', 'screen_status', orgId);
      // Executed subawards that were never cleared by restricted-party screening (2 CFR 200.214 risk).
      const unscreenedExecuted = (await query(`SELECT count(*)::int n FROM grant_subawards WHERE organization_id=$1 AND deleted_at IS NULL AND status='executed' AND screen_status <> 'cleared'`, [orgId])).rows[0].n;
      // Budget vs actual, org-wide (2 CFR 200.308/200.403).
      const totalBudgeted = Number((await query(`SELECT COALESCE(sum(budgeted_amount),0)::float8 s FROM grant_budget_lines WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      const totalExpended = Number((await query(`SELECT COALESCE(sum(amount),0)::float8 s FROM grant_expenditures WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      // Awards whose total expenditures exceed their authorized amount.
      const overspentAwards = (await query(`SELECT count(*)::int n FROM (SELECT a.id FROM grant_awards a JOIN grant_expenditures e ON e.award_id=a.id AND e.organization_id=a.organization_id AND e.deleted_at IS NULL WHERE a.organization_id=$1 AND a.deleted_at IS NULL AND a.total_amount IS NOT NULL GROUP BY a.id, a.total_amount HAVING sum(e.amount) > a.total_amount) x`, [orgId])).rows[0].n;
      // Cost share (2 CFR 200.306) + no-cost extensions (2 CFR 200.308).
      const costShareCommitted = Number((await query(`SELECT COALESCE(sum(cost_share_committed),0)::float8 s FROM grant_awards WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      const costShareContributed = Number((await query(`SELECT COALESCE(sum(amount),0)::float8 s FROM grant_cost_share_contributions WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].s);
      const nce = await countBy('grant_nce_records', 'status', orgId);
      return result('grants_portfolio', aw.total + pr.total, { awards: aw.total, awardsByStatus: aw.byCol, proposals: pr.total, proposalsByStatus: pr.byCol, invoicesByStatus: inv.byCol, closeoutsByStatus: co.byCol, overdueCloseouts, subawards: sub.total, subawardsByScreen: sub.byCol, unscreenedExecuted, totalBudgeted, totalExpended, overspentAwards, costShareCommitted, costShareContributed, costShareShortfall: Math.max(0, costShareCommitted - costShareContributed), ncesByStatus: nce.byCol });
    }
    case 'rim.registration_grid': {
      const r = await countBy('rim_registrations', 'market_status', orgId);
      const products = (await query(`SELECT count(*)::int n FROM rim_products WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      return result('rim_registrations', r.total, { products, registrations: r.total, byMarketStatus: r.byCol, approved: r.byCol['approved'] ?? 0 });
    }
    case 'inspection.readiness_pack': {
      const i = await countBy('inspections', 'status', orgId);
      const find = await countBy('inspection_findings', 'classification', orgId);
      return result('inspections', i.total, { inspections: i.total, byStatus: i.byCol, findingsByClass: find.byCol });
    }
    case 'controlled_substances.inventory_ledger': {
      const s = await countBy('controlled_substances', 'dea_schedule', orgId);
      const reg = (await query(`SELECT count(*)::int n FROM dea_registrations WHERE organization_id=$1 AND deleted_at IS NULL AND status='active'`, [orgId])).rows[0].n;
      const txns = (await query(`SELECT count(*)::int n FROM cs_transactions WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      return result('controlled_substances', s.total, { substances: s.total, bySchedule: s.byCol, activeRegistrations: reg, transactions: txns });
    }
    case 'lifecycle.obligation_calendar': {
      const o = await countBy('lifecycle_obligations', 'status', orgId);
      const overdue = (await query(`SELECT count(*)::int n FROM lifecycle_obligations WHERE organization_id=$1 AND deleted_at IS NULL AND status NOT IN ('approved','closed','submitted') AND due_date < CURRENT_DATE`, [orgId])).rows[0].n;
      return result('lifecycle_obligations', o.total, { obligations: o.total, byStatus: o.byCol, overdue });
    }
    case 'etmf.completeness_pack': {
      const files = (await query(`SELECT count(*)::int n FROM tmf_files WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      const a = await countBy('tmf_artifacts', 'status', orgId);
      const finalPct = a.total > 0 ? Math.round(((a.byCol['final'] ?? 0) / a.total) * 100) : 0;
      return result('etmf', files, { tmfFiles: files, artifacts: a.total, byStatus: a.byCol, finalPct });
    }
    case 'research_compliance.training_status': {
      const ppl = (await query(`SELECT count(*)::int n FROM research_personnel WHERE organization_id=$1 AND deleted_at IS NULL`, [orgId])).rows[0].n;
      const expired = (await query(`SELECT count(*)::int n FROM personnel_training WHERE organization_id=$1 AND deleted_at IS NULL AND expires_date < CURRENT_DATE`, [orgId])).rows[0].n;
      const t = await countBy('personnel_training', 'training_type', orgId);
      return result('research_compliance_training', ppl, { personnel: ppl, trainingRecords: t.total, byType: t.byCol, expired });
    }
    case 'effort.certification_register': {
      const c = await countBy('effort_certifications', 'status', orgId);
      // Lines where actual deviates materially from committed on a sponsored award (2 CFR 200.430) — recert candidates.
      const recert = (await query(`SELECT count(DISTINCT certification_id)::int n FROM effort_lines WHERE organization_id=$1 AND deleted_at IS NULL AND award_id IS NOT NULL AND abs(actual_pct - committed_pct) > 25`, [orgId])).rows[0].n;
      return result('effort_certifications', c.total, { statements: c.total, byStatus: c.byCol, certified: c.byCol['certified'] ?? 0, recertCandidates: recert });
    }
    case 'research_security.coi_register': {
      const d = await countBy('coi_disclosures', 'status', orgId);
      const ty = await countBy('coi_disclosures', 'disclosure_type', orgId);
      // Foreign nexus: foreign appointment/support type OR a non-US country (NSPM-33 / NOT-OD-26-017).
      const foreign = (await query(`SELECT count(*)::int n FROM coi_disclosures WHERE organization_id=$1 AND deleted_at IS NULL AND (disclosure_type IN ('foreign_appointment','foreign_support') OR (country IS NOT NULL AND upper(country) <> 'US'))`, [orgId])).rows[0].n;
      return result('research_security_coi', d.total, { disclosures: d.total, byStatus: d.byCol, byType: ty.byCol, foreignNexus: foreign, unmanagedConflicts: d.byCol['conflict'] ?? 0 });
    }
    case 'research_admin.scorecard': {
      // The cross-domain briefing rendered as a report. Lazy import breaks the
      // import cycle (the briefing module reads this provider for each domain).
      const { buildComplianceBriefing } = await import('../research-compliance/compliance-briefing');
      const b = await buildComplianceBriefing(orgId, { strict: true, onReport: (report) => queries.push(...report.provenance.queries) });
      const byDomain: Record<string, number> = {};
      for (const it of b.items) byDomain[it.domain] = (byDomain[it.domain] ?? 0) + 1;
      return result('research_admin_scorecard', 1, {
        totalAttentionItems: b.totalAttentionItems,
        critical: b.bySeverity.critical, warning: b.bySeverity.warning, info: b.bySeverity.info,
        byDomain, topItems: b.items.slice(0, 12),
      }, 'No attention items across research administration for this organization');
    }
    default:
      return null;
  }
}

/** The report type ids this provider module computes. Declared once, beside the
 *  engine map that routes a run to this module (report-engine.ts). */
export { DOMAIN_REPORT_TYPE_IDS } from './report-engine';
