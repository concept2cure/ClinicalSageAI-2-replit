/**
 * The one quality-gating assessment: a section against the gating rule that
 * covers it. Both validation routes — POST /validate-section and
 * POST /batch-validate — run it; each keeps only its own way of deriving the
 * gate level (see docs/api/quality-gating-api-reference.md).
 *
 * A section is ASSESSED only when something was actually checked. No rule, a
 * rule whose required-factor list cannot be read, a rule naming a factor that
 * does not exist, and a rule naming no active factor with validation criteria
 * are each NOT ASSESSED — `valid: null, assessed: false` — never a pass.
 * Nothing can write a gating rule or a CTQ factor today (their create and
 * update routes answer 501 NOT_AVAILABLE — RULE 2), so without this an empty
 * store chose the verdict: every section read as passing.
 *
 * @module server/services/qms/quality-gating-verdict
 */
import type { ctqFactors } from '../../../shared/schema';

type CtqFactor = typeof ctqFactors.$inferSelect;
export type GatingLevel = 'hard' | 'soft' | 'info';

export const NOT_ASSESSED_MESSAGE =
  'No quality gating rule is defined for this section, so it was not assessed.';

export function notAssessedSection(sectionCode: string, message: string = NOT_ASSESSED_MESSAGE) {
  return {
    sectionCode,
    valid: null,
    assessed: false as const,
    message,
    validations: [] as Array<Record<string, unknown>>,
  };
}

/**
 * The factor ids a rule requires, as stored: a JSON array of numbers or of
 * numeric strings (both forms exist — the governed CTQ delete matches either).
 * `unreadable` when the stored value is not such an array.
 */
export function requiredFactorIdsOf(raw: unknown): { ids: number[]; unreadable: boolean } {
  if (!Array.isArray(raw)) return { ids: [], unreadable: raw != null };
  const ids: number[] = [];
  for (const v of raw) {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n <= 0) return { ids: [], unreadable: true };
    if (!ids.includes(n)) ids.push(n);
  }
  return { ids, unreadable: false };
}

/** A rule with no recorded threshold takes the column's default, 100: a hard gate. */
export function gateLevelByThreshold(minimumMandatoryCompletion: number | null | undefined): GatingLevel {
  const threshold = minimumMandatoryCompletion ?? 100;
  return threshold >= 100 ? 'hard' : threshold >= 80 ? 'soft' : 'info';
}

function termsOf(factor: CtqFactor): string[] {
  return (factor.validationCriteria ?? '')
    .toLowerCase()
    .split(',')
    .map(term => term.trim())
    .filter(Boolean);
}

const MEETS = 'Section meets quality requirements';
const CRITICAL = 'Section contains critical quality issues';
const WARNINGS = 'Section contains quality warnings';

/**
 * Assess one section against the rule that covers it. `factors` may hold more
 * rows than the rule names (a batch fetches once for all its rules); only the
 * named ones are used.
 *
 * - A missing high-risk term fails a hard or soft gate and is reported on an
 *   informational one.
 * - A missing medium-risk term warns on a soft gate and is reported on an
 *   informational one; under a hard gate only the factor's own entry shows it.
 * - A missing low-risk term is reported and never affects the result.
 */
export function assessSection(input: {
  sectionCode: string;
  content: string;
  requiredCtqFactorIds: unknown;
  factors: CtqFactor[];
  gatingLevel: GatingLevel;
  allowOverride?: boolean | null;
}) {
  const { sectionCode, gatingLevel } = input;
  const { ids, unreadable } = requiredFactorIdsOf(input.requiredCtqFactorIds);
  if (unreadable) {
    return notAssessedSection(
      sectionCode,
      'The gating rule for this section has a required-factor list that cannot be read, so it was not assessed.',
    );
  }
  const byId = new Map(input.factors.map(f => [f.id, f]));
  const missing = ids.filter(id => !byId.has(id));
  if (missing.length > 0) {
    return notAssessedSection(
      sectionCode,
      `The gating rule for this section names CTQ factor ${missing.join(', ')}, which does not exist in this organization, so it was not assessed.`,
    );
  }
  const checked = ids
    .map(id => byId.get(id)!)
    .filter(f => f.status === 'active' && termsOf(f).length > 0);
  if (checked.length === 0) {
    return notAssessedSection(
      sectionCode,
      'The gating rule for this section names no active CTQ factor with validation criteria, so it was not assessed.',
    );
  }

  const content = input.content.toLowerCase();
  let highMissed = false;
  let mediumMissed = false;
  const validations = checked.map(factor => {
    const missingTerms = termsOf(factor).filter(term => !content.includes(term));
    const passed = missingTerms.length === 0;
    if (!passed && factor.riskLevel === 'high') highMissed = true;
    if (!passed && factor.riskLevel === 'medium') mediumMissed = true;
    return {
      factorId: factor.id,
      factorName: factor.name,
      category: factor.category,
      riskLevel: factor.riskLevel,
      passed,
      message: passed ? 'Validation passed' : `Missing required terms: ${missingTerms.join(', ')}`,
      details: factor.description,
    };
  });

  let valid = true;
  let message = MEETS;
  if (gatingLevel === 'hard') {
    if (highMissed) [valid, message] = [false, CRITICAL];
  } else if (gatingLevel === 'soft') {
    if (highMissed) [valid, message] = [false, CRITICAL];
    else if (mediumMissed) message = WARNINGS;
  } else if (highMissed) {
    message = `${CRITICAL} (informational)`;
  } else if (mediumMissed) {
    message = `${WARNINGS} (informational)`;
  }

  return {
    sectionCode,
    valid,
    assessed: true as const,
    gatingLevel,
    message,
    allowOverride: input.allowOverride ?? null,
    validations,
  };
}

export type SectionAssessment = ReturnType<typeof assessSection>;

/**
 * A batch's verdict. `false` when any section failed; otherwise `null` when any
 * section was not assessed; `true` only when every section was assessed and
 * none failed.
 */
export function batchVerdict(sections: SectionAssessment[]) {
  const failed = sections.filter(s => s.valid === false).length;
  const notAssessed = sections.filter(s => s.valid === null).length;
  const hasWarnings = sections.some(s => s.valid === false || s.validations.some(v => v.passed === false));
  const unassessed =
    `${notAssessed} of ${sections.length} sections ${notAssessed === 1 ? 'was' : 'were'} not assessed; ` +
    'each section’s result says why.';

  let message: string;
  if (failed > 0) {
    message = 'One or more sections contain critical quality issues' + (notAssessed > 0 ? `. ${unassessed}` : '');
  } else if (notAssessed > 0) {
    message = unassessed + (hasWarnings ? ' Some assessed sections contain quality warnings.' : '');
  } else {
    message = hasWarnings ? 'Sections contain quality warnings' : 'All sections meet quality requirements';
  }

  return {
    valid: failed > 0 ? false : notAssessed > 0 ? null : true,
    assessed: notAssessed === 0,
    hasWarnings,
    message,
  };
}
