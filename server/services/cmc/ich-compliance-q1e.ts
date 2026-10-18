/**
 * ICH Q1E: what the recorded stability data supports, against what the dossier
 * claims — judged at the program's stage.
 *
 * ## Why this rule exists
 *
 * The platform already computes a real Q1E evaluation: `shelf-life-poolability`
 * runs the ANCOVA combinability test at α = 0.25 and estimates the supported
 * shelf life from the recorded data. Nothing reported a Q1E **verdict**, because
 * `ICH_GUIDELINES_CHECKED` stopped at Q1A(R2). So a §3.2.P.8 shelf-life claim
 * that ran past what the data on file supports — or that extrapolated with no
 * accelerated study behind it at all — raised no finding anywhere, while the
 * composed dossier printed the claim as the applicant's statement.
 *
 * ## Q1E is a registration guideline, so the stage decides what it means
 *
 * The CMC regulatory record scopes Q1E to `marketing` and `post_approval`
 * (`knowledge/cmc-regulatory-record.json`, id `ich-q1e`): its subject is how to
 * propose a re-test period or shelf life in a registration application, and its
 * Appendix A decision trees cap extrapolation beyond the period covered by
 * long-term data. For a clinical-trial application the question is a different
 * one — 21 CFR 312.23(a)(7)(ii) asks for stability data supporting the duration
 * of the proposed study, not a registered shelf life — so a claim beyond the
 * data is a gap to justify there, not a Q1E registration failure.
 *
 * This is the same stage-dependence `ich-compliance-q2.ts` has, for the same
 * reason: a rule that judges a phase-1 IND by a marketing-application standard
 * puts a FAIL on a compliant dossier.
 *
 * ## It refuses to guess
 *
 * The claim and the coverage are free text on the register ("24 months at
 * 25C/60%RH (proposed)", duration "24", time points "0,3,6,12,24"). Where the
 * months cannot be read unambiguously the finding is `not_evaluated` with the
 * raw text as its evidence — never a pass, and never a number the parser
 * invented. `25C/60%RH` contains "25" and "60"; a parser that took the first
 * integer it saw would report a 25-month claim the register never made.
 *
 * @module server/services/cmc/ich-compliance-q1e
 */
import { cite } from './ich-compliance-q2';
import {
  blockedInputs,
  notEvaluatedFinding,
  type IchCheckFinding,
  type ProgramStage,
  type ProjectInputs,
} from './ich-compliance-rules';

/**
 * Months from a stability text, or null when it does not state a period
 * unambiguously.
 *
 * Only a number WITH a unit counts, or a string that is nothing but a number
 * (the register's own `duration` column is written that way). Anything else —
 * a storage condition, a percentage, a temperature — reads as no period at all,
 * which is the honest answer: the caller then reports `not_evaluated`.
 */
export function monthsIn(text: unknown): number | null {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^\d{1,3}$/.test(t)) return Number(t);
  const m = t.match(/(\d{1,3})(?:\.\d+)?\s*(months?|mos?\b|years?|yrs?\b|weeks?|wks?\b)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (/^y/.test(m[2])) return n * 12;
  if (/^w/.test(m[2])) return Math.round((n * 12) / 52);
  return n;
}

/** The largest month value in a comma/space separated list of time points. */
export function latestTimePoint(text: unknown): number | null {
  const parts = String(text ?? '').split(/[,;/|]+|\s+/).map((p) => p.trim()).filter(Boolean);
  const months = parts.map((p) => monthsIn(p)).filter((n): n is number => n !== null);
  return months.length === 0 ? null : Math.max(...months);
}

const LONG_TERM = /long/i;
const ACCELERATED = /accel/i;
const LONG_TERM_CONDITION = /\b(25|30)\s*°?\s*c/i;
const ACCELERATED_CONDITION = /\b40\s*°?\s*c/i;

function isLongTerm(s: Record<string, unknown>): boolean {
  return LONG_TERM.test(String(s.studyType ?? '')) || LONG_TERM_CONDITION.test(String(s.storageCondition ?? ''));
}
function isAccelerated(s: Record<string, unknown>): boolean {
  return ACCELERATED.test(String(s.studyType ?? '')) || ACCELERATED_CONDITION.test(String(s.storageCondition ?? ''));
}

/** How far the long-term data on file actually reaches, in months. */
export function longTermCoverage(studies: Array<Record<string, unknown>>): number | null {
  const covered = studies
    .filter(isLongTerm)
    .map((s) => {
      const points = latestTimePoint(s.timePoints);
      const duration = monthsIn(s.duration);
      const both = [points, duration].filter((n): n is number => n !== null);
      return both.length === 0 ? null : Math.max(...both);
    })
    .filter((n): n is number => n !== null);
  return covered.length === 0 ? null : Math.max(...covered);
}

/**
 * The shelf-life claim the register states, with the study that states it.
 * The LARGEST claim is the one judged: it is the one the dossier would carry.
 */
export function statedClaim(
  studies: Array<Record<string, unknown>>,
): { months: number; study: string; raw: string } | { months: null; raw: string[] } {
  const unreadable: string[] = [];
  let best: { months: number; study: string; raw: string } | null = null;
  for (const s of studies) {
    const raw = String(s.shelfLifeClaim ?? '').trim();
    if (!raw) continue;
    const months = monthsIn(raw);
    if (months === null) {
      unreadable.push(raw);
      continue;
    }
    if (!best || months > best.months) {
      /* `?? 'unnamed study'` would not catch the empty string, and the
         register's study title is nullable: an evidence line then read
         "(24 months, )" and named nothing. */
      best = { months, study: String(s.studyName ?? '').trim() || 'a study with no recorded title', raw };
    }
  }
  return best ?? { months: null, raw: unreadable };
}

/**
 * The Q1E extrapolation ceiling for a marketing application: up to twice the
 * period covered by long-term data, and never more than 12 months beyond it
 * (Q1E §2.6 and the Appendix A decision trees, for the case where accelerated
 * data show no significant change).
 */
export function q1eCeiling(coverage: number): number {
  return Math.min(coverage * 2, coverage + 12);
}

const CITATION = 'ICH Q1E §2.6 and Appendix A — evaluating stability data and the limits on extrapolation beyond the period covered by long-term data.';
const IND_CITATION = '21 CFR 312.23(a)(7)(ii) — stability data supporting the duration of the proposed clinical study.';

/** A Q1E finding, with this module's citation filled in. */
function q1e(
  ruleId: string,
  status: IchCheckFinding['status'],
  message: string,
  evidence: string[],
  citation = cite('ich-q1e') || CITATION,
): IchCheckFinding {
  return { guideline: 'Q1E', ruleId, status, message, evidence, citation };
}

/**
 * What the stage makes of a claim that runs past the data: a registration
 * failure for a marketing application, a gap to justify otherwise.
 */
function stageExpectation(stage: ProgramStage | null | undefined): {
  marketing: boolean;
  shortfall: 'fail' | 'warning';
  note: string;
} {
  if (stage?.application === 'marketing') {
    return {
      marketing: true,
      shortfall: 'fail',
      note: 'This program files a marketing application, where Q1E governs the proposed shelf life.',
    };
  }
  if (stage?.application === 'clinical_trial') {
    return {
      marketing: false,
      shortfall: 'warning',
      note:
        'This program files a clinical-trial application, where the stability data must support the duration of the '
        + 'proposed study rather than a registered shelf life; a claim beyond the data is a gap to justify, not a Q1E '
        + 'registration failure.',
    };
  }
  return {
    marketing: false,
    shortfall: 'warning',
    note:
      'The program records no application type, so Q1E is judged as a gap to justify rather than a registration '
      + 'failure; record the application type to be judged at the right standard.',
  };
}

/**
 * The findings that mean the check could NOT run — returned instead of a
 * judgement, never alongside one. Null when there is something to judge.
 */
function unevaluable(inp: ProjectInputs, studies: Array<Record<string, unknown>>): IchCheckFinding[] | null {
  const blocked = blockedInputs(inp, ['stability']);
  if (blocked.length > 0) {
    return [notEvaluatedFinding('Q1E', 'Q1E_NOT_EVALUATED', blocked, cite('ich-q1e') || CITATION)];
  }
  if (studies.length === 0) {
    /* Q1A(R2) already reports the absence of stability studies as its own
       finding. Reporting it twice would double-count one gap, so Q1E says only
       that it had nothing to evaluate. */
    return [q1e(
      'Q1E_NO_STABILITY',
      'not_evaluated',
      'No stability studies are recorded, so there is no data to evaluate a shelf-life claim against. '
        + 'The absence itself is reported under Q1A(R2).',
      ['stability study count: 0'],
    )];
  }
  return null;
}

/** The claim as a number of months, or the finding that says why it is not one. */
function readClaim(studies: Array<Record<string, unknown>>):
  | { ok: true; months: number; study: string; raw: string }
  | { ok: false; finding: IchCheckFinding } {
  const claim = statedClaim(studies);
  if (claim.months !== null) return { ok: true, ...claim };
  if (claim.raw.length > 0) {
    return { ok: false, finding: q1e(
      'Q1E_CLAIM_NOT_READABLE',
      'not_evaluated',
      `A shelf-life claim is recorded but its period cannot be read: ${claim.raw.map((r) => `"${r}"`).join(', ')}. `
        + 'State it as a number of months or years (for example "24 months"). This is not a pass: the claim was not evaluated.',
      claim.raw.map((r) => `shelf_life: ${r}`),
    ) };
  }
  return { ok: false, finding: q1e(
    'Q1E_NO_CLAIM',
    'warning',
    'No shelf-life claim is recorded on any stability study. §3.2.P.8.1 states the proposed shelf life and its '
      + 'storage condition, and the composed section has no other source for it.',
    [`stability study count: ${studies.length}; studies stating a shelf life: 0`],
  ) };
}

/** What a claim running past the data is, at this stage. */
function extrapolationFindings(
  claim: { months: number; study: string; raw: string },
  coverage: number,
  accelerated: number,
  stage: ProgramStage | null | undefined,
): IchCheckFinding[] {
  const { marketing, shortfall, note } = stageExpectation(stage);
  const facts = [
    `claim: ${claim.raw} (${claim.months} months, ${claim.study})`,
    `long-term coverage: ${coverage} months`,
    `accelerated study count: ${accelerated}`,
  ];
  const findings: IchCheckFinding[] = [];

  if (accelerated === 0) {
    findings.push(q1e(
      'Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED',
      shortfall,
      `The claim of ${claim.months} months runs past the ${coverage} months the long-term data covers, and no accelerated `
        + `study is recorded. Q1E admits extrapolation only where accelerated data show no significant change. ${note}`,
      facts,
    ));
  }

  const ceiling = q1eCeiling(coverage);
  if (marketing) {
    if (claim.months > ceiling) {
      findings.push(q1e(
        'Q1E_EXTRAPOLATION_BEYOND_LIMIT',
        'fail',
        `The claim of ${claim.months} months exceeds what Q1E admits from ${coverage} months of long-term data: at most `
          + `${ceiling} months (twice the covered period, and no more than 12 months beyond it).`,
        [...facts, `Q1E ceiling: ${ceiling} months`],
      ));
    }
  } else {
    findings.push(q1e(
      'Q1E_CLAIM_BEYOND_DATA',
      'warning',
      `The claim of ${claim.months} months runs ${claim.months - coverage} month(s) past the ${coverage} months the `
        + `long-term data covers. ${note}`,
      facts,
      stage?.application === 'clinical_trial' ? IND_CITATION : (cite('ich-q1e') || CITATION),
    ));
  }
  return findings;
}

/** One Q1E finding set for a project. */
export function checkQ1E(inp: ProjectInputs): IchCheckFinding[] {
  const studies = inp.stability;
  const stop = unevaluable(inp, studies);
  if (stop) return stop;

  const claim = readClaim(studies);
  if (!claim.ok) return [claim.finding];

  const coverage = longTermCoverage(studies);
  if (coverage === null) {
    return [q1e(
      'Q1E_COVERAGE_NOT_READABLE',
      'not_evaluated',
      `A shelf-life claim of ${claim.months} months is recorded, but how far the long-term data reaches cannot be read `
        + 'from the studies on file: none states a duration or time points that parse as a period. '
        + 'This is not a pass; the claim was not evaluated against the data.',
      studies.filter(isLongTerm).map((s) =>
        `${String(s.studyName ?? '').trim() || 'a study with no recorded title'}: `
        + `duration "${String(s.duration ?? '')}", time points "${String(s.timePoints ?? '')}"`),
    )];
  }

  const accelerated = studies.filter(isAccelerated).length;
  if (claim.months > coverage) {
    return extrapolationFindings(claim, coverage, accelerated, inp.stage);
  }
  return [q1e(
    'Q1E_CLAIM_WITHIN_DATA',
    'pass',
    `The claim of ${claim.months} months is within the ${coverage} months the long-term data covers`
      + `${accelerated > 0 ? `, with ${accelerated} accelerated study/studies on file` : ''}.`,
    [
      `claim: ${claim.raw} (${claim.months} months, ${claim.study})`,
      `long-term coverage: ${coverage} months`,
      `accelerated study count: ${accelerated}`,
    ],
  )];
}

/** Re-exported for the checker's finding assembly, which needs the stage shape. */
export type { ProgramStage };
