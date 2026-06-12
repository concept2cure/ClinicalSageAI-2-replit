/**
 * Cross-domain research-compliance briefing.
 *
 * AnA's tools are atomic and single-domain; nothing answers "what needs my
 * attention?" across the whole research-administration footprint. This service
 * fans across the Report-OS domain providers (the same numbers the reports
 * compute) and extracts the high-signal, time-sensitive items — overdue
 * commitments and closeouts, expiring IACUC protocols and training, unmanaged
 * COI, restricted-party gaps, budget over-runs — into one prioritized list.
 *
 * Read-only, org-scoped, deterministic: no new queries, no LLM. Each item cites
 * the regulation/standard that makes it matter so the briefing is defensible.
 *
 * @module server/services/research-compliance/compliance-briefing
 */

import { computeDomainReport } from '../report-os/research-compliance-report-providers';

export type BriefingSeverity = 'critical' | 'warning' | 'info';

export interface BriefingItem {
  domain: string;
  signal: string;
  count: number;
  severity: BriefingSeverity;
  basis: string;
}

export interface ComplianceBriefing {
  generatedAt: string;
  items: BriefingItem[];
  totalAttentionItems: number;
  bySeverity: Record<BriefingSeverity, number>;
}

/** Pull a non-negative integer signal out of a domain summary, defaulting to 0. */
function n(summary: Record<string, unknown> | undefined, key: string): number {
  const v = summary?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Sum the values of a {label: count} status map for a set of keys. */
function sumKeys(summary: Record<string, unknown> | undefined, mapKey: string, keys: string[]): number {
  const m = summary?.[mapKey] as Record<string, number> | undefined;
  if (!m) return 0;
  return keys.reduce((s, k) => s + (typeof m[k] === 'number' ? m[k] : 0), 0);
}

/**
 * Each entry maps a domain report to the urgent signals worth surfacing. The
 * extractor receives the report summary and returns the attention items (only
 * those with count > 0 are kept).
 */
const EXTRACTORS: { reportTypeId: string; extract: (s: Record<string, unknown> | undefined) => BriefingItem[] }[] = [
  {
    reportTypeId: 'ha.commitment_register',
    extract: (s) => [{ domain: 'HA Commitments', signal: 'overdue regulatory commitments', count: n(s, 'overdue'), severity: 'critical', basis: 'FDAAA 505(o) / 21 CFR 314.81 — PMR/PMC reporting' }],
  },
  {
    reportTypeId: 'iacuc.protocol_register',
    extract: (s) => [{ domain: 'IACUC', signal: 'protocols expiring or expired (≤90d)', count: n(s, 'expiringOrExpired'), severity: 'critical', basis: 'PHS Policy IV.C.5 — 3-year de novo review' }],
  },
  {
    reportTypeId: 'lifecycle.obligation_calendar',
    extract: (s) => [{ domain: 'Lifecycle', signal: 'overdue lifecycle obligations', count: n(s, 'overdue'), severity: 'critical', basis: '21 CFR 314.70 / EU Reg 1234/2008 — variations & reporting' }],
  },
  {
    reportTypeId: 'research_compliance.training_status',
    extract: (s) => [{ domain: 'Training', signal: 'expired training records', count: n(s, 'expired'), severity: 'critical', basis: '"No index until trained" — role-gated CITI/GCP currency' }],
  },
  {
    reportTypeId: 'research_security.coi_register',
    extract: (s) => [
      { domain: 'Research Security', signal: 'unmanaged conflicts', count: n(s, 'unmanagedConflicts'), severity: 'critical', basis: '42 CFR 50 Subpart F — manage/reduce/eliminate FCOI' },
      { domain: 'Research Security', signal: 'foreign-nexus disclosures to review', count: n(s, 'foreignNexus'), severity: 'warning', basis: 'NSPM-33 / NOT-OD-26-017 — research security' },
    ],
  },
  {
    reportTypeId: 'effort.certification_register',
    extract: (s) => [{ domain: 'Effort', signal: 'statements needing recertification', count: n(s, 'recertCandidates'), severity: 'warning', basis: '2 CFR 200.430 — material committed↔actual deviation' }],
  },
  {
    reportTypeId: 'grants.portfolio_register',
    extract: (s) => [
      { domain: 'Grants', signal: 'closeouts overdue (>120d)', count: n(s, 'overdueCloseouts'), severity: 'critical', basis: '2 CFR 200.344 — final reports within 120 days' },
      { domain: 'Grants', signal: 'awards over-spent vs authorized', count: n(s, 'overspentAwards'), severity: 'critical', basis: '2 CFR 200.403 — allowable & within authorized amount' },
      { domain: 'Grants', signal: 'subawards executed without a clean screen', count: n(s, 'unscreenedExecuted'), severity: 'critical', basis: '2 CFR 200.214 — suspension & debarment' },
      { domain: 'Grants', signal: 'cost-share shortfall (committed not met)', count: n(s, 'costShareShortfall') > 0 ? 1 : 0, severity: 'warning', basis: '2 CFR 200.306 — cost sharing / matching' },
      { domain: 'Grants', signal: 'no-cost extensions awaiting approval', count: sumKeys(s, 'ncesByStatus', ['requested']), severity: 'info', basis: '2 CFR 200.308 — period-of-performance extensions' },
    ],
  },
  {
    reportTypeId: 'inspection.readiness_pack',
    extract: (s) => [{ domain: 'Inspection', signal: 'open critical/major findings', count: sumKeys(s, 'findingsByClass', ['critical', 'major']), severity: 'warning', basis: '21 CFR 20 / ICH E6 — inspection readiness & CAPA' }],
  },
  {
    reportTypeId: 'fcoi.disclosure_register',
    extract: (s) => [{ domain: 'FCOI', signal: 'disclosures not yet signed', count: sumKeys(s, 'byStatus', ['draft', 'submitted', 'under_review']), severity: 'info', basis: '21 CFR 54 — investigator financial disclosure' }],
  },
];

/**
 * Build the prioritized briefing for an organization. Items are ordered
 * critical → warning → info, then by count descending.
 */
export async function buildComplianceBriefing(orgId: number): Promise<ComplianceBriefing> {
  const items: BriefingItem[] = [];
  for (const { reportTypeId, extract } of EXTRACTORS) {
    let summary: Record<string, unknown> | undefined;
    try {
      const report = await computeDomainReport(reportTypeId, orgId);
      summary = report?.summary;
    } catch {
      summary = undefined; // a missing domain table shouldn't sink the whole briefing
    }
    for (const item of extract(summary)) {
      if (item.count > 0) items.push(item);
    }
  }

  const rank: Record<BriefingSeverity, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);

  const bySeverity: Record<BriefingSeverity, number> = { critical: 0, warning: 0, info: 0 };
  for (const it of items) bySeverity[it.severity] += 1;

  return { generatedAt: new Date().toISOString(), items, totalAttentionItems: items.length, bySeverity };
}
