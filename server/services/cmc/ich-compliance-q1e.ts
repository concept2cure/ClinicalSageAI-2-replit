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
/* The recorded pull points, read by the one reader the stability section and
   the poolability estimator use — it already tells UNREADABLE data from ABSENT
   data, which is the distinction this rule turns on. A second parser here would
   be a second answer to "what data is on file". */
import { readRecordedStabilityResults, parseMonthTime } from './recorded-stability';
/* The scope vocabulary is owned by the shared module every register resolves
   its side through; this is its seventh consumer, not a second parser. */
import { normalizeMaterialScope, scopeCovers, type CmcMaterialScope } from '../../../shared/cmc/material-scope';
import {
  blockedInputs,
  notEvaluatedFinding,
  type IchCheckFinding,
  type ProgramStage,
  type ProjectInputs,
} from './ich-compliance-rules';

/**
 * The longest shelf life that is a period rather than a typo. ICH Q1A's own
 * long-term study runs to 12 months at submission and a registered shelf life
 * is rarely past 5 years; 50 years is a generous ceiling and still catches a
 * mistyped figure. Past it the text does not state a credible period, which is
 * reported as *not evaluated* rather than judged.
 */
const MAX_CREDIBLE_MONTHS = 600;

/**
 * Months from a stability text, or null when it does not state a credible
 * period unambiguously.
 *
 * Only a number WITH a unit counts, or a string that is nothing but a number
 * (the register's own `duration` column is written that way). Anything else —
 * a storage condition, a percentage, a temperature — reads as no period at all,
 * which is the honest answer: the caller then reports `not_evaluated`.
 *
 * ── Three ways the first version got a number wrong ──────────────────────────
 * Found by probing it with register-shaped text (the review of 2026-10-18,
 * docs/evidence/CMC-M3-GA/2026-10-18/06-ich-q1e-verdict/):
 *   "1000 months" → 0. `\d{1,3}` could not span four digits, so the match
 *       backtracked onto "000 months". A nonsense claim then PASSED.
 *   "0.5 years" → 0 and "1.5 years" → 12. The decimal was matched and then
 *       discarded, so half a year was no months and 18 months was 12.
 *   "24]" and "[0" (a JSON-shaped time-point list) → null, which understated
 *       the coverage and invented an extrapolation.
 * The number is now taken whole, the fraction is kept, and a figure too large
 * to be a shelf life is refused instead of truncated.
 */
export function monthsIn(text: unknown): number | null {
  const t = String(text ?? '').trim().toLowerCase().replace(/^[[({\s]+|[\])}\s]+$/g, '');
  if (!t) return null;
  const credible = (n: number) => (n > 0 && n <= MAX_CREDIBLE_MONTHS ? n : null);
  if (/^\d+(?:\.\d+)?$/.test(t)) return credible(Math.round(Number(t)));
  /* The number is taken WHOLE — `(?!\d)` after it, so "1000" never matches as
     "100" and never backtracks onto a suffix — and its unit must follow. */
  const m = t.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)(?!\d)\s*(months?|mos?\b|years?|yrs?\b|weeks?|wks?\b)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (/^y/.test(m[2])) return credible(Math.round(n * 12));
  if (/^w/.test(m[2])) return credible(Math.round((n * 12) / 52));
  return credible(Math.round(n));
}

/**
 * The largest month value in a comma/space separated list of time points.
 *
 * A time point is parsed by the CANONICAL time parser, not by `monthsIn`: the
 * register writes them as bare numbers, as "Month 24", and inside a
 * JSON-shaped list, and `monthsIn` — written for the claim's free text —
 * refuses the second of those and refuses a bare `0`. `monthsIn` keeps the
 * claim and the planned duration, which are prose ("24 months at 25C/60%RH")
 * and need a unit; a pull point's time is a number on a schedule and needs
 * this one.
 */
export function latestTimePoint(text: unknown): number | null {
  const parts = String(text ?? '')
    .split(/[,;/|]+|\s+/)
    .map((p) => p.trim().replace(/^[[({"']+|[\])}"']+$/g, ''))
    .filter(Boolean);
  const months = parts.map((p) => parseMonthTime(p)).filter((n): n is number => n !== null);
  return months.length === 0 ? null : Math.max(...months);
}

/**
 * Which ICH condition a study is, decided by its TYPE first and its storage
 * condition only when the type says nothing.
 *
 * The first version tested the type and the condition with `||`, and matched
 * 25 °C or 30 °C as long-term either way. Two consequences, both wrong, both
 * reproduced against register-shaped data:
 *
 *  - **A refrigerated product.** Its long-term condition is 5 °C ± 3 °C and its
 *    accelerated condition is 25 °C ± 2 °C / 60% RH (ICH Q1A(R2) §2.2.7.3). The
 *    5 °C study matched nothing, and the 25 °C ACCELERATED study matched
 *    long-term — so the coverage was the accelerated study's 6 months and a
 *    correct 24-month claim came back `fail`. A rule that fails a compliant
 *    dossier is the defect `ich-compliance-q2.ts` was rewritten to remove.
 *  - **An intermediate-only programme.** 30 °C / 65% RH is the INTERMEDIATE
 *    condition in climatic zones I and II, and the long-term condition in zone
 *    IVb. Counting it as long-term let a 12-month intermediate study justify a
 *    12-month claim with no long-term data at all, and it `pass`ed.
 *
 * So a study whose type names it accelerated or intermediate is never
 * long-term, whatever its temperature reads.
 */
const ACCELERATED_TYPE = /accel/i;
const INTERMEDIATE_TYPE = /interm/i;
const LONG_TERM_TYPE = /long|primary|real.?time/i;
const LONG_TERM_CONDITION = /\b(25|30)\s*°?\s*c/i;
const ACCELERATED_CONDITION = /\b40\s*°?\s*c/i;

export function isAccelerated(s: Record<string, unknown>): boolean {
  const type = String(s.studyType ?? '');
  if (ACCELERATED_TYPE.test(type)) return true;
  if (INTERMEDIATE_TYPE.test(type) || LONG_TERM_TYPE.test(type)) return false;
  return ACCELERATED_CONDITION.test(String(s.storageCondition ?? ''));
}

export function isLongTerm(s: Record<string, unknown>): boolean {
  const type = String(s.studyType ?? '');
  if (ACCELERATED_TYPE.test(type) || INTERMEDIATE_TYPE.test(type)) return false;
  if (LONG_TERM_TYPE.test(type)) return true;
  return LONG_TERM_CONDITION.test(String(s.storageCondition ?? ''));
}

/**
 * How far one study's RECORDED data reaches, in months, and how far its plan
 * says it will.
 *
 * These are not the same thing and the first version conflated them: it took
 * `max(latestTimePoint(timePoints), monthsIn(duration))`, both of which are the
 * PLAN. A study registered today with `duration: '24'` and no results reported
 * "long-term coverage: 24 months", and a 24-month claim came back `pass` —
 * against zero months of data. That is the sharpest fabrication this rule could
 * produce: it told the reader the data supports a claim when none of it exists
 * yet.
 *
 * `recorded` is the furthest pull point that carries a result. `unreadable` is
 * the column holding something that could not be parsed, which is NOT the same
 * as a study that recorded nothing — a verdict must not read the first as the
 * second.
 */
export function studyCoverage(s: Record<string, unknown>): {
  recorded: number | null;
  planned: number | null;
  unreadable: boolean;
} {
  const planned = (() => {
    const points = latestTimePoint(s.timePoints);
    const duration = monthsIn(s.duration);
    const both = [points, duration].filter((n): n is number => n !== null);
    return both.length === 0 ? null : Math.max(...both);
  })();
  const read = readRecordedStabilityResults(s.results);
  if (read.unreadable) return { recorded: null, planned, unreadable: true };
  const withResult = read.points.filter(
    (pt) => pt.result !== undefined && pt.result !== null && String(pt.result).trim() !== '',
  );
  const months = withResult
    /* The canonical parser for this field. `monthsIn` is the claim's parser and
       reads "Month 24" as nothing, so a complete study labelled that way
       reported 0 months recorded and FAILED a compliant dossier. */
    .map((pt) => parseMonthTime(pt.timePoint))
    .filter((n): n is number => n !== null);
  /* No recorded point at all is zero months of data, not "unknown": the study
     exists and has produced nothing. Zero is then compared with the claim like
     any other figure, so a claim over a study with no results is reported. */
  return { recorded: months.length === 0 ? 0 : Math.max(...months), planned, unreadable: false };
}

/**
 * How far the long-term data on file reaches across a scope's studies, with the
 * per-study figures a reader needs to check it.
 *
 * The maximum is taken, which is what a pooled claim rests on — and the
 * per-study list is returned with it, because one long batch carrying several
 * short ones is exactly the case Q1E's poolability test exists to decide and
 * this rule cannot: the evidence names each study's own figure so the reader
 * sees it.
 */
export function longTermCoverage(studies: Array<Record<string, unknown>>): number | null {
  return coverageDetail(studies).recorded;
}

export function coverageDetail(studies: Array<Record<string, unknown>>): {
  recorded: number | null;
  planned: number | null;
  unreadable: string[];
  perStudy: string[];
} {
  const longTerm = studies.filter(isLongTerm);
  const unreadable: string[] = [];
  const perStudy: string[] = [];
  const recordedMonths: number[] = [];
  const plannedMonths: number[] = [];
  for (const s of longTerm) {
    const name = String(s.studyName ?? '').trim() || 'a study with no recorded title';
    const c = studyCoverage(s);
    if (c.unreadable) {
      unreadable.push(name);
      perStudy.push(`${name}: recorded results unreadable; planned ${c.planned ?? '?'} months`);
      continue;
    }
    if (c.recorded !== null) recordedMonths.push(c.recorded);
    if (c.planned !== null) plannedMonths.push(c.planned);
    perStudy.push(`${name}: ${c.recorded} months recorded, ${c.planned ?? '?'} months planned`);
  }
  return {
    recorded: recordedMonths.length === 0 ? null : Math.max(...recordedMonths),
    planned: plannedMonths.length === 0 ? null : Math.max(...plannedMonths),
    unreadable,
    perStudy,
  };
}

/**
 * The shelf-life claim the register states, with the study that states it.
 * The LARGEST claim is the one judged: it is the one the dossier would carry.
 *
 * An UNREADABLE claim defeats the whole answer, even when a readable one sits
 * beside it. The first version returned the readable claim and dropped the
 * other, so a programme stating "12 months" on one study and "thirty-six
 * months" on another was judged on the 12 and reported `pass` — a pass over a
 * claim nobody evaluated, which is the one thing this rule must not produce.
 * Since the dropped text may state the LARGER period, the honest answer is that
 * the claim is not readable.
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
  if (unreadable.length > 0) return { months: null, raw: unreadable };
  return best ?? { months: null, raw: [] };
}

/**
 * The scope a study belongs to: the drug substance, the drug product, or
 * unstated. Q1A(R2) and Q1E treat them separately — a drug substance has a
 * RE-TEST PERIOD and a drug product a SHELF LIFE, on their own data — and the
 * register carries the field (`scope`, 'DS' | 'DP').
 *
 * Judged together, a drug substance's 36-month re-test period was compared with
 * the drug product's 24 months of coverage, because the largest claim won
 * whatever it belonged to: a compliant pair came back `fail`.
 */
export function scopeOf(s: Record<string, unknown>): CmcMaterialScope | 'unstated' {
  const raw = s.scope ?? s.stabilityScope ?? s.stability_scope;
  if (String(raw ?? '').trim() === '') return 'unstated';
  /* The one vocabulary: 'ds' | 'dp' | 'api' | 'both' | the long forms all
     resolve here, so this rule and the write-through cannot disagree about
     which side a study is for. The first version parsed 'DS'/'DP' itself and
     therefore never matched the write-through's own `drug_substance` /
     `drug_product` / `both` — the DS/DP split was dead code on real data. */
  return normalizeMaterialScope(raw, 'drug_product');
}

/** What the finding calls a scope. */
const SCOPE_NOUN: Record<CmcMaterialScope | 'unstated', string> = {
  drug_substance: 'the drug substance (§3.2.S.7, a re-test period)',
  drug_product: 'the drug product (§3.2.P.8, a shelf life)',
  both: 'the drug substance and the drug product together',
  unstated: 'the studies that state no scope',
};

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
/**
 * The ceiling is Q1E's WIDEST allowance, which belongs to the branch where
 * accelerated data show no significant change. Where significant change occurs
 * at the accelerated condition — or at the intermediate one — Appendix A admits
 * less. Whether significant change occurred is a judgement over the recorded
 * results that this rule does not make, so the ceiling it states is the most
 * permissive one and it says so rather than implying the narrow branches were
 * considered.
 */
const CEILING_CAVEAT =
  'That ceiling is Q1E\u2019s widest allowance, for the case where accelerated data show no significant change; '
  + 'Appendix A admits less where significant change occurs at the accelerated or intermediate condition, which this '
  + 'check does not evaluate.';
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
      note: 'This project files a marketing application, where Q1E governs the proposed shelf life.',
    };
  }
  if (stage?.application === 'clinical_trial') {
    return {
      marketing: false,
      shortfall: 'warning',
      note:
        'This project files a clinical-trial application, where the stability data must support the duration of the '
        + 'proposed study rather than a registered shelf life; a claim beyond the data is a gap to justify, not a Q1E '
        + 'registration failure.',
    };
  }
  return {
    marketing: false,
    shortfall: 'warning',
    note:
      'The project records no application type, so Q1E is judged as a gap to justify rather than a registration '
      + 'failure; record the application type to be judged at the right standard.',
  };
}

/**
 * Why the stage is absent, in the finding's own words: a programme that records
 * none, or a read that failed. The first version said "records no application
 * type" for both, which asserts something about the programme that an
 * unreadable stage does not establish.
 */
function stageNote(inp: ProjectInputs, fallback: string): string {
  const blocked = blockedInputs(inp, ['stage']);
  if (inp.stage || blocked.length === 0) return fallback;
  return `The project's application type could not be read (${blocked.map((b) => b.reason).join('; ')}), `
    + 'so Q1E is judged as a gap to justify rather than a registration failure. This is not a finding that the '
    + 'project records no type: the check could not read one.';
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
function extrapolationFindings(a: {
  claim: { months: number; study: string; raw: string };
  coverage: number;
  accelerated: number;
  facts: string[];
  inp: ProjectInputs;
}): IchCheckFinding[] {
  const { claim, coverage, accelerated, facts, inp } = a;
  const stage = inp.stage;
  const expectation = stageExpectation(stage);
  const { marketing, shortfall } = expectation;
  const note = stageNote(inp, expectation.note);
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
          + `${ceiling} months (twice the covered period, and no more than 12 months beyond it). ${CEILING_CAVEAT}`,
        [...facts, `Q1E ceiling: ${ceiling} months`],
      ));
    } else {
      /* An extrapolation INSIDE the allowance still has to be reported. With
         no finding at all the guideline's row stayed at its initialised
         'not_applicable' (ich-compliance-checker.ts), so a dossier that
         extrapolated could read as a guideline that did not apply to it. */
      findings.push(q1e(
        'Q1E_EXTRAPOLATION_WITHIN_LIMIT',
        'warning',
        `The claim of ${claim.months} months extrapolates past the ${coverage} months of long-term data recorded, within `
          + `what Q1E admits from that period (at most ${ceiling} months). The extrapolation itself is what §3.2.P.8.1 `
          + `justifies, with the statistical evaluation Q1E §2.6 asks for. ${CEILING_CAVEAT}`,
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

  /* Judged per scope: a drug substance's re-test period rests on the drug
     substance's own data and a drug product's shelf life on the product's.
     Where no study states a scope there is one group, judged as before, and
     the finding says which group it speaks for. */
  const groups = new Map<CmcMaterialScope | 'unstated', Array<Record<string, unknown>>>();
  const put = (k: CmcMaterialScope | 'unstated', s: Record<string, unknown>) => {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  };
  for (const s of studies) {
    const scope = scopeOf(s);
    if (scope === 'both') {
      /* `scopeCovers('both', side)` is true for either, so a study recorded for
         both sides is evidence for both and is judged in each group. */
      for (const side of ['drug_substance', 'drug_product'] as const) {
        if (scopeCovers('both', side)) put(side, s);
      }
      continue;
    }
    put(scope, s);
  }
  const sides: Array<CmcMaterialScope | 'unstated'> = ['drug_substance', 'drug_product', 'unstated'];
  const findings: IchCheckFinding[] = [];
  for (const scope of sides) {
    const group = groups.get(scope);
    if (!group) continue;
    findings.push(...judgeScope(group, scope, inp, groups.size > 1));
  }
  return findings;
}

/** One scope's verdict: the claim its own studies state, against their own data. */
function judgeScope(
  studies: Array<Record<string, unknown>>,
  scope: CmcMaterialScope | 'unstated',
  inp: ProjectInputs,
  named: boolean,
): IchCheckFinding[] {
  const stage = inp.stage;
  /* The scope is named in the message only when there is more than one, so a
     programme that records no scope reads exactly as it did before. */
  const where = named ? ` For ${SCOPE_NOUN[scope]}.` : '';
  const claim = readClaim(studies);
  if (!claim.ok) {
    return [{ ...claim.finding, message: claim.finding.message + where }];
  }

  const cover = coverageDetail(studies);
  const longTermCount = studies.filter(isLongTerm).length;
  if (longTermCount === 0) {
    /* A distinct case from "the figures do not parse": there is no long-term
       study at all, so there is nothing a claim could be measured against.
       Reported as its own rule rather than under a message that asserts the
       studies' durations were unreadable, which they were not. */
    return [q1e(
      'Q1E_NO_LONG_TERM_STUDY',
      'not_evaluated',
      `A shelf-life claim of ${claim.months} months is recorded, but no long-term study is on file to measure it `
        + `against. Q1A(R2) reports the missing condition; this claim was not evaluated.${where}`,
      studies.map((s) => describeStudy(s)),
    )];
  }
  if (cover.unreadable.length > 0) {
    return [q1e(
      'Q1E_RESULTS_UNREADABLE',
      'not_evaluated',
      `A shelf-life claim of ${claim.months} months is recorded, but ${cover.unreadable.length} long-term study/studies `
        + 'hold recorded results that cannot be read, so how far the data reaches is unknown. Recorded-and-unreadable is '
        + `not the same as nothing recorded, and neither is a pass.${where}`,
      [...cover.unreadable.map((n) => `unreadable results: ${n}`), ...cover.perStudy],
    )];
  }
  if (cover.recorded === null) {
    return [q1e(
      'Q1E_COVERAGE_NOT_READABLE',
      'not_evaluated',
      `A shelf-life claim of ${claim.months} months is recorded, but how far the long-term data reaches cannot be read `
        + `from the studies on file. This is not a pass; the claim was not evaluated against the data.${where}`,
      studies.map((s) => describeStudy(s)),
    )];
  }

  const coverage = cover.recorded;
  const accelerated = studies.filter(isAccelerated).length;
  const facts = [
    `claim: ${claim.raw} (${claim.months} months, ${claim.study})`,
    `long-term data RECORDED: ${coverage} months`,
    `long-term data PLANNED: ${cover.planned ?? '?'} months`,
    `long-term studies: ${longTermCount}; accelerated studies: ${accelerated}`,
    `scope: ${scope}`,
    ...cover.perStudy,
  ];
  if (claim.months > coverage) {
    return extrapolationFindings({ claim, coverage, accelerated, facts, inp }).map(
      (f) => ({ ...f, message: f.message + where }),
    );
  }
  /* A pass on a clinical-trial application says what it is a pass OF. The row
     is headed Q1E, and Q1E governs a registration application's proposed shelf
     life — so without this the report asserted Q1E compliance for a programme
     the guideline's own scope does not cover. */
  const governs = stage?.application === 'marketing'
    ? ''
    : ' Q1E itself governs a registration application\u2019s proposed shelf life; what is measured here is the'
      + ' claim against the data on file, which for this project supports the duration of the proposed study'
      + ' (21 CFR 312.23(a)(7)(ii)).';
  return [q1e(
    'Q1E_CLAIM_WITHIN_DATA',
    'pass',
    `The claim of ${claim.months} months is within the ${coverage} months of long-term data recorded`
      + `${accelerated > 0 ? `, with ${accelerated} accelerated study/studies on file` : ''}.${where}${governs}`,
    facts,
  )];
}

/** One study, as a finding's evidence line. */
function describeStudy(s: Record<string, unknown>): string {
  const c = studyCoverage(s);
  return `${String(s.studyName ?? '').trim() || 'a study with no recorded title'}: `
    + `type "${String(s.studyType ?? '')}", condition "${String(s.storageCondition ?? '')}", `
    + `planned ${c.planned ?? '?'} months, recorded ${c.unreadable ? 'unreadable' : c.recorded} months`;
}

/** Re-exported for the checker's finding assembly, which needs the stage shape. */
export type { ProgramStage };
