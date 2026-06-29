/**
 * Protocol Deviations & CAPA deterministic logic (Capability C2C-18b)
 *
 * Pure, DB-free, LLM-free: the reportability assessment (whether a deviation must
 * be reported and by when) and the CAPA closure gate (whether a deviation is
 * eligible to close given the state of its corrective/preventive actions).
 *
 * Reportability is grounded in 45 CFR 46.108(a)(4) — the IRB's prompt-reporting
 * obligation for unanticipated problems / serious or continuing noncompliance —
 * and ICH E6(R2) §4.5.3 / §5.20 (prompt deviation reporting). Major/critical
 * deviations and any deviation affecting subject safety are reportable; critical
 * deviations are reported within ~3 days and major within ~10 days.
 *
 * @module server/services/protocol-deviations/protocol-deviations-logic
 */

export type DeviationCategory = 'enrollment' | 'consent' | 'procedure' | 'safety' | 'data' | 'other';
export type DeviationSeverity = 'minor' | 'major' | 'critical';
export type DeviationStatus = 'open' | 'under_review' | 'capa_pending' | 'closed';
export type CapaActionStatus = 'open' | 'in_progress' | 'completed' | 'verified';

const REPORT_BASIS =
  '45 CFR 46.108(a)(4) (prompt reporting of unanticipated problems / serious or continuing noncompliance) ' +
  'and ICH E6(R2) §4.5.3 / §5.20 (prompt deviation reporting)';
const NO_REPORT_BASIS =
  'ICH E6(R2) §4.5.3 — minor deviations not affecting subject safety/rights or data integrity are logged and ' +
  'summarized rather than promptly reported';

// ─── Reportability ───────────────────────────────────────────────────────────

export interface ReportabilityInput {
  severity: DeviationSeverity;
  category: DeviationCategory;
  /** Explicit flag that the deviation affected (or could affect) subject safety. */
  affectsSafety?: boolean;
}

export interface ReportabilityResult {
  reportable: boolean;
  /** Reporting window in calendar days (0 when not reportable). */
  timelinessDays: number;
  basis: string;
}

/**
 * Assess whether a deviation must be promptly reported and the reporting window.
 * Major/critical severity, the 'safety' category, or an explicit affectsSafety
 * flag make a deviation reportable. Critical deviations are reported within ~3
 * days; major (or safety-affecting) within ~10 days. Pure — the deterministic
 * basis the service surfaces on create and the review tool returns.
 */
export function assessReportability(input: ReportabilityInput): ReportabilityResult {
  const affectsSafety = input.affectsSafety === true || input.category === 'safety';
  const reportable = input.severity === 'major' || input.severity === 'critical' || affectsSafety;
  if (!reportable) {
    return { reportable: false, timelinessDays: 0, basis: NO_REPORT_BASIS };
  }
  const timelinessDays = input.severity === 'critical' ? 3 : 10;
  return { reportable: true, timelinessDays, basis: REPORT_BASIS };
}

// ─── CAPA closure gate ───────────────────────────────────────────────────────

export interface CapaClosureInput {
  deviationStatus: DeviationStatus;
  capaActions: { status: CapaActionStatus }[];
}

export interface CapaClosureResult {
  readyToClose: boolean;
  blockers: string[];
}

/**
 * Evaluate whether a deviation is eligible to close. A deviation must not already
 * be closed, must have at least one CAPA action recorded, and every CAPA action
 * must be completed or verified. Pure — the deterministic gate the service
 * enforces on closeDeviationTx.
 */
export function evaluateCapaClosure(input: CapaClosureInput): CapaClosureResult {
  const blockers: string[] = [];
  if (input.deviationStatus === 'closed') {
    blockers.push('Deviation is already closed.');
  }
  if (input.capaActions.length === 0) {
    blockers.push('No CAPA actions recorded; record and complete corrective/preventive actions before closing.');
  }
  const unresolved = input.capaActions.filter((a) => a.status !== 'completed' && a.status !== 'verified');
  if (unresolved.length > 0) {
    blockers.push(`${unresolved.length} CAPA action(s) are not yet completed/verified.`);
  }
  return { readyToClose: blockers.length === 0, blockers };
}
