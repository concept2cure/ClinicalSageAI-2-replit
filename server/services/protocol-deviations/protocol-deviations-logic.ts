/**
 * Protocol Deviations & CAPA deterministic logic (Capability C2C-18b)
 *
 * Pure, DB-free, LLM-free: what a deviation's ASSESSMENT indicates about
 * reporting, and the CAPA closure gate.
 *
 * ── Rewritten 2026-09-22 from regulatory research ────────────────────────────
 * The previous version cited 45 CFR 46.108(a)(4) and "ICH E6(R2) §4.5.3 /
 * §5.20 (prompt deviation reporting)" and attached a 3-day window to critical
 * and a 10-day window to major deviations. None of that holds:
 *   • 46.108(a)(4) is the IRB's procedure for reporting unanticipated problems
 *     and serious or continuing noncompliance in Common-Rule research — not a
 *     rule that every major deviation is reportable, and not the sponsor's or
 *     investigator's duty.
 *   • ICH E6(R2) 4.5.3 says the investigator documents and explains ANY
 *     deviation. It has no "minor deviations are logged rather than reported"
 *     carve-out; 5.20 is the sponsor's handling of noncompliance.
 *   • No US regulation, FDA guidance, ICH guideline or the EU Regulation sets
 *     3 / 10 days for deviations. Those are IRB or sponsor SOP windows.
 * And an unassessed deviation defaulted to severity 'minor', so it came out
 * "not reportable" on an assessment nobody made.
 * Research record: docs/evidence/REGULATORY-SME/2026-09-22/.
 *
 * ── What this module now says ────────────────────────────────────────────────
 *   • Severity and safety impact are a PERSON'S assessment. Until both are
 *     recorded, the status is `assessment_required` and nothing is decided.
 *   • Every deviation is documented, explained and reported to the sponsor.
 *   • A prompt report to the IRB is INDICATED when the deviation is assessed
 *     major/critical, is in the safety category, or affects subject safety —
 *     the investigator reports changes and unanticipated problems to the IRB
 *     promptly (21 CFR 312.66), and which deviations the IRB wants, and when,
 *     is set by the IRB's written procedures. "Promptly" has no fixed day count
 *     in the regulations, so none is invented here.
 *   • The only fixed regulatory clocks are listed as CONDITIONAL notices:
 *     a serious breach under Regulation (EU) 536/2014 (7 days, Art. 52) and a
 *     device deviation made to protect a subject in an emergency (5 working
 *     days, 21 CFR 812.150(a)(4)). Whether either applies is a separate
 *     determination this module does not make.
 *   • minor/major/critical is this platform's internal scale. The regulatory
 *     distinction is "important" / not important (ICH E3 Q&A (R1)), which the
 *     sponsor defines per trial.
 *
 * @module server/services/protocol-deviations/protocol-deviations-logic
 */

export type DeviationCategory = 'enrollment' | 'consent' | 'procedure' | 'safety' | 'data' | 'other';
/** Internal scale, assessed by a person. Not a regulatory category. */
export type DeviationSeverity = 'minor' | 'major' | 'critical';
export type DeviationStatus = 'open' | 'under_review' | 'capa_pending' | 'closed';
export type CapaActionStatus = 'open' | 'in_progress' | 'completed' | 'verified';

// ─── Bases ───────────────────────────────────────────────────────────────────

const DOCUMENT_BASIS =
  'ICH E6(R2) 4.5.3 — the investigator documents and explains any deviation from the approved protocol; it is reported to the sponsor, which decides per trial which deviations are important (ICH E3 Q&A (R1)).';
const IRB_PROMPT_BASIS =
  '21 CFR 312.66 — the investigator promptly reports to the IRB all changes in the research activity and all unanticipated problems involving risk to subjects or others. Which deviations the IRB requires, and by when, is set by its written procedures (21 CFR 56.108(a)(3), (b)); the regulations give no fixed day count for "promptly".';
const NOT_ASSESSED_BASIS =
  'Severity and effect on subject safety have not been assessed, so whether a prompt report is indicated is not determined. An unassessed deviation is not a minor one.';

// ─── Reportability ───────────────────────────────────────────────────────────

export interface ReportabilityInput {
  /** null = not assessed. */
  severity: DeviationSeverity | null;
  /** null = not recorded. */
  category: DeviationCategory | null;
  /** Did it affect (or could it affect) subject safety, rights or welfare? null = not assessed. */
  affectsSafety: boolean | null;
}

export type ReportabilityStatus = 'assessment_required' | 'prompt_irb_report_indicated' | 'no_prompt_report_indicated';

/** A fixed regulatory clock that applies only if its condition is determined to be met. */
export interface ConditionalClock {
  id: 'eu-ctr-serious-breach' | 'us-device-emergency-deviation';
  days: number;
  unit: 'calendar' | 'working';
  /** From when the clock runs. */
  anchor: string;
  /** The separate determination that makes it apply. */
  appliesIf: string;
  basis: string;
}

export interface ReportabilityResult {
  status: ReportabilityStatus;
  /** Stored as is_reportable: a prompt IRB report is indicated (true), not indicated (false), or not determined (null). */
  reportable: boolean | null;
  basis: string;
  /** What is owed for every deviation, whatever its severity. */
  obligations: string[];
  /** Fixed regulatory windows — conditional; never computed from severity. */
  conditionalClocks: ConditionalClock[];
}

export const CONDITIONAL_CLOCKS: readonly ConditionalClock[] = [
  {
    id: 'eu-ctr-serious-breach', days: 7, unit: 'calendar',
    anchor: 'the sponsor becoming aware of the breach',
    appliesIf: 'the trial is under Regulation (EU) No 536/2014 and the deviation is a serious breach — one likely to affect to a significant degree the safety and rights of a subject or the reliability and robustness of the data',
    basis: 'Regulation (EU) No 536/2014, Article 52 — the sponsor notifies the Member States concerned through the EU portal without undue delay and not later than seven days',
  },
  {
    id: 'us-device-emergency-deviation', days: 5, unit: 'working',
    anchor: 'the emergency',
    appliesIf: 'the study is a device investigation and the deviation from the investigational plan was made to protect the life or physical well-being of a subject in an emergency',
    basis: '21 CFR 812.150(a)(4) — the investigator notifies the sponsor and the reviewing IRB as soon as possible, and in no event later than 5 working days after the emergency',
  },
];

const OBLIGATIONS: readonly string[] = [
  'Document and explain the deviation, and report it to the sponsor (ICH E6(R2) 4.5.3).',
  'A deviation made without prior IRB approval to eliminate an apparent immediate hazard to subjects is reported to the IRB promptly (21 CFR 312.66) and, under an IND, to FDA by protocol amendment (21 CFR 312.30(b)(2)(ii)).',
];

/**
 * What the assessment indicates about reporting. Undeclared inputs are never
 * read as "no": until severity and safety impact are both assessed, the answer
 * is `assessment_required` — unless something already recorded indicates a
 * prompt report, which is reported as soon as it is known.
 */
export function assessReportability(input: ReportabilityInput): ReportabilityResult {
  const base = { obligations: [...OBLIGATIONS], conditionalClocks: CONDITIONAL_CLOCKS.map((c) => ({ ...c })) };
  const indicated =
    input.severity === 'major' || input.severity === 'critical' ||
    input.affectsSafety === true || input.category === 'safety';
  if (indicated) {
    return { ...base, status: 'prompt_irb_report_indicated', reportable: true, basis: IRB_PROMPT_BASIS };
  }
  if (input.severity === null || input.affectsSafety === null) {
    return { ...base, status: 'assessment_required', reportable: null, basis: NOT_ASSESSED_BASIS };
  }
  return {
    ...base,
    status: 'no_prompt_report_indicated',
    reportable: false,
    basis:
      `${DOCUMENT_BASIS} Assessed minor with no effect on subject safety, so no prompt IRB report is indicated by this assessment. ` +
      'This is NOT a determination that it need not be reported: the IRB\'s written procedures may still require it, and it is still reported to the sponsor.',
  };
}

/** Assessed = both severity and safety impact recorded. */
export function isAssessed(input: { severity: DeviationSeverity | null; affectsSafety: boolean | null }): boolean {
  return input.severity !== null && input.affectsSafety !== null;
}

// ─── CAPA closure gate ───────────────────────────────────────────────────────

export interface CapaClosureInput {
  deviationStatus: DeviationStatus;
  capaActions: { status: CapaActionStatus }[];
  /** Severity and safety impact both recorded. A deviation nobody assessed cannot be closed. */
  assessed: boolean;
}

export interface CapaClosureResult {
  readyToClose: boolean;
  blockers: string[];
}

/**
 * Evaluate whether a deviation is eligible to close: not already closed, its
 * severity and safety impact assessed, at least one CAPA action recorded, and
 * every CAPA action completed or verified. Pure — the gate closeDeviationTx
 * enforces.
 */
export function evaluateCapaClosure(input: CapaClosureInput): CapaClosureResult {
  const blockers: string[] = [];
  if (input.deviationStatus === 'closed') {
    blockers.push('Deviation is already closed.');
  }
  if (!input.assessed) {
    blockers.push('The deviation\'s severity and effect on subject safety have not been assessed; assess it before closing.');
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
