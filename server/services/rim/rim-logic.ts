/**
 * RIM-lite deterministic logic (Capability C2C-12)
 *
 * Pure, DB-free, LLM-free: the region → expected label-type mapping, renewal
 * urgency, registration-grid summarization, and the label-currency gate (an
 * approved market should carry a current approved label of the right type).
 * Grounded in FDA (21 CFR 201; USPI) and EU (Directive 2001/83/EC; SmPC/PIL)
 * labeling and the EU 5-year MA renewal.
 *
 * @module server/services/rim/rim-logic
 */

import type { LabelType, MarketStatus } from '../../../shared/schema/rim';

function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** The label type a market expects, with citation. US → USPI; EU → SmPC. */
export function expectedLabelType(country: string): { labelType: LabelType; citation: string } {
  const c = country.trim().toUpperCase();
  if (c === 'US' || c === 'USA') return { labelType: 'uspi', citation: 'FDA 21 CFR 201.56-201.57 (USPI)' };
  if (c === 'EU' || ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'SE', 'PL', 'IE', 'AT', 'DK', 'FI', 'PT', 'GR', 'CZ'].includes(c)) {
    return { labelType: 'smpc', citation: 'EU Directive 2001/83/EC (SmPC)' };
  }
  return { labelType: 'core_data_sheet', citation: 'Company Core Data Sheet (CCDS)' };
}

export type RenewalUrgency = 'overdue' | 'due_90' | 'due_180' | 'later' | 'not_applicable';

/** Renewal urgency for an approved registration. Pure. */
export function renewalUrgency(marketStatus: MarketStatus, renewalDueDate: string | null, today: string): RenewalUrgency {
  if (marketStatus !== 'approved' || !renewalDueDate) return 'not_applicable';
  const due = toDays(renewalDueDate);
  const now = toDays(today);
  if (due == null || now == null) return 'not_applicable';
  if (due < now) return 'overdue';
  const days = due - now;
  if (days <= 90) return 'due_90';
  if (days <= 180) return 'due_180';
  return 'later';
}

export interface GridRow {
  country: string;
  marketStatus: MarketStatus;
  renewalDueDate?: string | null;
}

export interface GridSummary {
  total: number;
  byStatus: Record<string, number>;
  approved: number;
  renewalsOverdue: number;
  renewalsDue180: number;
}

/** Summarize the registration grid. Pure. */
export function summarizeGrid(rows: GridRow[], today: string): GridSummary {
  const s: GridSummary = { total: rows.length, byStatus: {}, approved: 0, renewalsOverdue: 0, renewalsDue180: 0 };
  for (const r of rows) {
    s.byStatus[r.marketStatus] = (s.byStatus[r.marketStatus] ?? 0) + 1;
    if (r.marketStatus === 'approved') s.approved += 1;
    const u = renewalUrgency(r.marketStatus, r.renewalDueDate ?? null, today);
    if (u === 'overdue') s.renewalsOverdue += 1;
    else if (u === 'due_90' || u === 'due_180') s.renewalsDue180 += 1;
  }
  return s;
}

export type LabelFindingSeverity = 'critical' | 'major' | 'minor';
export type LabelRiskLevel = 'high' | 'medium' | 'low';

export interface LabelFinding {
  severity: LabelFindingSeverity;
  message: string;
  basis: string;
}

export interface LabelCurrencyInput {
  registrations: Array<{ country: string; marketStatus: MarketStatus }>;
  /** Approved labels keyed by `${country}|${labelType}` and bare `${labelType}` for core. */
  approvedLabels: Array<{ country: string | null; labelType: LabelType }>;
}

/**
 * Label-currency gate. Every approved market should carry a current approved
 * label of the region-appropriate type (or a core data sheet fallback). Pure —
 * cited findings + risk level.
 */
export function evaluateLabelCurrency(p: LabelCurrencyInput): { findings: LabelFinding[]; riskLevel: LabelRiskLevel } {
  const findings: LabelFinding[] = [];
  const have = new Set(p.approvedLabels.map((l) => `${(l.country ?? '').toUpperCase()}|${l.labelType}`));
  const haveCore = p.approvedLabels.some((l) => l.labelType === 'core_data_sheet');

  for (const reg of p.registrations) {
    if (reg.marketStatus !== 'approved') continue;
    const { labelType, citation } = expectedLabelType(reg.country);
    const key = `${reg.country.toUpperCase()}|${labelType}`;
    if (!have.has(key) && !(labelType === 'core_data_sheet' && haveCore)) {
      findings.push({
        severity: 'major',
        message: `Approved market ${reg.country} has no current approved ${labelType.toUpperCase()} label.`,
        basis: citation,
      });
    }
  }

  const riskLevel: LabelRiskLevel = findings.length === 0 ? 'low' : findings.length > 2 ? 'high' : 'medium';
  return { findings, riskLevel };
}
