/**
 * NIH Other Support deterministic logic (Capability C2C-24A)
 *
 * Pure, DB-free, LLM-free: roll a person's Other Support entries into committed
 * person-month totals (by status and combined), flag effort overcommitment, and
 * score disclosure readiness used to gate certification. Grounded in NIH GPS 2.5.1
 * (Other Support) and the research-security disclosure notices NOT-OD-19-114 /
 * NOT-OD-21-073 (foreign components, in-kind, overlap). NIH treats 12 calendar
 * months of committed effort as 100% — committing more than 12 across all active
 * support is an overcommitment that must be resolved.
 *
 * @module server/services/other-support/other-support-logic
 */

export const OTHER_SUPPORT_BASIS = 'NIH GPS 2.5.1 / NOT-OD-19-114 / NOT-OD-21-073';

/** NIH treats 12 calendar months of committed effort as 100% effort. */
export const MAX_CALENDAR_MONTHS_PER_YEAR = 12;

export type OtherSupportEntryStatus = 'active' | 'pending';

export interface OtherSupportEntryView {
  supportType?: string | null;
  projectTitle?: string | null;
  fundingSource?: string | null;
  status: OtherSupportEntryStatus | string;
  isForeign?: boolean;
  foreignCountry?: string | null;
  personMonthsCalendar?: number | null;
  personMonthsAcademic?: number | null;
  personMonthsSummer?: number | null;
  majorGoals?: string | null;
  overlapStatement?: string | null;
  awardIdentifier?: string | null;
}

export interface PersonMonthTotals {
  calendar: number;
  academic: number;
  summer: number;
  /** Combined committed person-months (calendar + academic + summer). */
  total: number;
}

export interface OtherSupportSummary {
  entryCount: number;
  activeCount: number;
  pendingCount: number;
  foreignCount: number;
  active: PersonMonthTotals;
  pending: PersonMonthTotals;
  combined: PersonMonthTotals;
  /** Active committed person-months exceed 12/yr (NIH >100% effort). */
  overcommitted: boolean;
  basis: string;
}

export interface OtherSupportFinding {
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

export interface OtherSupportReadinessResult {
  readyToCertify: boolean;
  blockers: string[];
  findings: OtherSupportFinding[];
  summary: OtherSupportSummary;
}

function round2(n: number): number { return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100; }
function pm(v: number | null | undefined): number { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; }
function hasText(s: string | null | undefined): boolean { return typeof s === 'string' && s.trim().length > 0; }

function totalsFor(entries: OtherSupportEntryView[]): PersonMonthTotals {
  let calendar = 0, academic = 0, summer = 0;
  for (const e of entries) {
    calendar += pm(e.personMonthsCalendar);
    academic += pm(e.personMonthsAcademic);
    summer += pm(e.personMonthsSummer);
  }
  calendar = round2(calendar); academic = round2(academic); summer = round2(summer);
  return { calendar, academic, summer, total: round2(calendar + academic + summer) };
}

/**
 * Roll the entries into per-status and combined committed person-month totals and
 * flag effort overcommitment (active committed person-months > 12/yr). Pure.
 */
export function computeOtherSupportSummary(entries: OtherSupportEntryView[]): OtherSupportSummary {
  const active = entries.filter((e) => e.status === 'active');
  const pending = entries.filter((e) => e.status === 'pending');
  const activeTotals = totalsFor(active);
  const pendingTotals = totalsFor(pending);
  const combinedTotals = totalsFor(entries);

  return {
    entryCount: entries.length,
    activeCount: active.length,
    pendingCount: pending.length,
    foreignCount: entries.filter((e) => e.isForeign === true).length,
    active: activeTotals,
    pending: pendingTotals,
    combined: combinedTotals,
    overcommitted: activeTotals.total > MAX_CALENDAR_MONTHS_PER_YEAR,
    basis: OTHER_SUPPORT_BASIS,
  };
}

/**
 * Score the document's disclosure readiness and produce the deterministic gate the
 * service enforces on certify. Blockers: no entries; any entry missing a project
 * title, funding source, major goals or overlap statement; any foreign entry
 * missing its country; effort overcommitment. Pure. (NIH GPS 2.5.1.)
 */
export function evaluateOtherSupportReadiness(entries: OtherSupportEntryView[]): OtherSupportReadinessResult {
  const summary = computeOtherSupportSummary(entries);
  const blockers: string[] = [];
  const findings: OtherSupportFinding[] = [];

  if (entries.length === 0) {
    blockers.push('No Other Support entries — add each funding source / resource, or attest "None".');
    findings.push({ severity: 'critical', message: 'Other Support has no entries to certify.' });
  }

  entries.forEach((e, i) => {
    const label = hasText(e.projectTitle) ? `"${(e.projectTitle as string).trim()}"` : `entry #${i + 1}`;
    if (!hasText(e.projectTitle)) { blockers.push(`Entry #${i + 1} is missing a project title.`); findings.push({ severity: 'critical', message: `Entry #${i + 1} is missing a project title.` }); }
    if (!hasText(e.fundingSource)) { blockers.push(`Entry ${label} is missing a funding source.`); findings.push({ severity: 'critical', message: `Entry ${label} is missing a funding source.` }); }
    if (!hasText(e.majorGoals)) { blockers.push(`Entry ${label} is missing major goals.`); findings.push({ severity: 'critical', message: `Entry ${label} is missing major goals (${OTHER_SUPPORT_BASIS}).` }); }
    if (!hasText(e.overlapStatement)) { blockers.push(`Entry ${label} is missing an overlap statement.`); findings.push({ severity: 'critical', message: `Entry ${label} is missing an overlap statement (${OTHER_SUPPORT_BASIS}).` }); }
    if (e.isForeign === true && !hasText(e.foreignCountry)) { blockers.push(`Foreign entry ${label} is missing its country of the foreign component.`); findings.push({ severity: 'critical', message: `Foreign entry ${label} must disclose the country (NOT-OD-21-073).` }); }
  });

  if (summary.overcommitted) {
    blockers.push(`Active committed effort is ${summary.active.total} person-months — exceeds the ${MAX_CALENDAR_MONTHS_PER_YEAR}-month (100%) maximum.`);
    findings.push({ severity: 'critical', message: `Effort overcommitment: ${summary.active.total} active committed person-months > ${MAX_CALENDAR_MONTHS_PER_YEAR} (NIH 100% effort).` });
  }

  return { readyToCertify: blockers.length === 0, blockers, findings, summary };
}

// ─── Export ──────────────────────────────────────────────────────────────────

export interface OtherSupportExportRow {
  order: number;
  supportType: string;
  projectTitle: string;
  fundingSource: string;
  status: string;
  isForeign: boolean;
  foreignCountry: string | null;
  personMonths: PersonMonthTotals;
  majorGoals: string | null;
  overlapStatement: string | null;
  awardIdentifier: string | null;
}

export interface OtherSupportExport {
  rows: OtherSupportExportRow[];
  summary: OtherSupportSummary;
  readiness: OtherSupportReadinessResult;
}

/** Assemble an ordered, exportable Other Support view + summary + readiness. Pure. */
export function buildOtherSupportExport(entries: OtherSupportEntryView[]): OtherSupportExport {
  const rows: OtherSupportExportRow[] = entries.map((e, i) => ({
    order: i + 1,
    supportType: typeof e.supportType === 'string' ? e.supportType : 'grant',
    projectTitle: (e.projectTitle ?? '').toString(),
    fundingSource: (e.fundingSource ?? '').toString(),
    status: e.status,
    isForeign: e.isForeign === true,
    foreignCountry: e.foreignCountry ?? null,
    personMonths: totalsFor([e]),
    majorGoals: e.majorGoals ?? null,
    overlapStatement: e.overlapStatement ?? null,
    awardIdentifier: e.awardIdentifier ?? null,
  }));
  return { rows, summary: computeOtherSupportSummary(entries), readiness: evaluateOtherSupportReadiness(entries) };
}
