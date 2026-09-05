/**
 * f2 similarity between two RECORDED dissolution profiles.
 *
 * ── Why this exists, and what it replaces ────────────────────────────────────
 * f2 is a regulatory conclusion computed from means. The arithmetic is four
 * lines; everything that makes the number mean anything is the eligibility
 * check around it, and the engine this replaces had the arithmetic right and
 * the eligibility wrong in six ways at once. It accepted profiles sampled at
 * different times as long as the arrays were the same length (returning
 * f2 = 100 "SIMILAR" for 10/20/30 min against 15/30/60 min with identical
 * means); it graded f2 on as few as one surviving timepoint; it never excluded
 * t = 0, where both profiles are 0 by construction and the point inflates
 * similarity; it defaulted the unit count to 12 and then printed "12 units
 * tested per product" as a fact about a study nobody said had twelve units; it
 * listed the 20%/10% coefficient-of-variation limits as prose in a conditions
 * array with no variability field in its input to evaluate them against; and it
 * compared a two-decimal ROUNDED f2 against 50, so a true 49.99973 was reported
 * as 50 and PASS.
 *
 * This computes f2 or REFUSES, with the reason and the offending rows. Every
 * condition it reports as evaluated was actually evaluated against data in the
 * input.
 *
 * One implementation, three callers: the AnA typed-number tool, the AnA
 * recorded twin over the dissolution register, and the CMC surface.
 */

/** One timepoint of a profile, as the dissolution register records it. */
export interface DissolutionPoint {
  /** Nominal sampling time in minutes. */
  timepointMin: number;
  /** Mean percent of label claim dissolved. */
  meanPercent: number;
  /** Vessels contributing to THIS mean. Never defaulted. */
  unitsTested?: number | null;
  /** Absolute standard deviation, percentage points. */
  sdPercent?: number | null;
  /** Coefficient of variation, percent. */
  rsdPercent?: number | null;
}

export interface DissolutionProfileInput {
  role: 'reference' | 'test';
  productName?: string;
  batchNumber?: string;
  /** The apparatus/medium/speed the profile was run under, as recorded. */
  method?: Record<string, unknown>;
  points: DissolutionPoint[];
}

export type F2RefusalCode =
  | 'MISSING_PROFILE'
  | 'NO_TIMEPOINTS'
  | 'TIMEPOINTS_DO_NOT_MATCH'
  | 'TOO_FEW_TIMEPOINTS'
  | 'MEAN_MISSING'
  | 'UNITS_NOT_RECORDED'
  | 'VARIABILITY_NOT_RECORDED'
  | 'EARLY_VARIABILITY_EXCEEDED'
  | 'LATE_VARIABILITY_EXCEEDED'
  | 'BOTH_VERY_RAPIDLY_DISSOLVING'
  | 'METHOD_DOES_NOT_MATCH';

export interface F2Refusal {
  outcome: 'refused';
  code: F2RefusalCode;
  message: string;
  offending: Array<{ role?: string; timepointMin?: number; observed?: string; required: string }>;
  alternative?: string;
}

export interface F2Computed {
  outcome: 'computed';
  /** The unrounded statistic. Reported to one decimal, compared unrounded. */
  f2: number;
  f2Reported: string;
  f2Similar: boolean;
  f1: number;
  f1Reported: string;
  f1WithinBand: boolean;
  inputsUsed: {
    includedTimepointsMin: number[];
    n: number;
    referenceMeans: number[];
    testMeans: number[];
    zeroTimepointExcluded: boolean;
    above85Truncation: { applied: boolean; atTimepointMin: number | null; discardedTimepointsMin: number[] };
    unitsTested: { reference: number; test: number };
  };
  /** Only conditions this call actually evaluated against the input. */
  checksEvaluated: Array<{ condition: string; required: string; observed: string }>;
  /** What f2 does and does not establish — fixed text, never softened. */
  scope: string;
}

export type F2Result = F2Computed | F2Refusal;

const MIN_TIMEPOINTS = 3;
const EARLY_RSD_LIMIT = 20;
const LATE_RSD_LIMIT = 10;
const SIMILARITY_CUTOFF = 50;

const SCOPE_STATEMENT =
  'f2 compares two mean in-vitro profiles in one medium as a point estimate with no confidence interval. ' +
  'It is not a bioequivalence conclusion, it says nothing about any other medium, and it is computed over ' +
  'the timepoints listed above only.';

function refuse(
  code: F2RefusalCode,
  message: string,
  offending: F2Refusal['offending'] = [],
  alternative?: string,
): F2Refusal {
  return { outcome: 'refused', code, message, offending, alternative };
}

/** The variability of a point, from whichever of SD or %RSD was recorded. */
function rsdOf(p: DissolutionPoint): number | null {
  if (p.rsdPercent !== undefined && p.rsdPercent !== null && Number.isFinite(Number(p.rsdPercent))) {
    return Number(p.rsdPercent);
  }
  if (
    p.sdPercent !== undefined && p.sdPercent !== null && Number.isFinite(Number(p.sdPercent)) &&
    Number.isFinite(Number(p.meanPercent)) && Number(p.meanPercent) > 0
  ) {
    return (Number(p.sdPercent) / Number(p.meanPercent)) * 100;
  }
  return null;
}

/**
 * Compare two recorded profiles.
 *
 * `profileUnits` is the per-profile unit count where the points do not carry
 * their own. It is REQUIRED: an f2 over an unknown number of vessels is not a
 * regulatory statistic, and defaulting it to twelve is the specific lie this
 * engine was rebuilt to stop telling.
 */
export function compareDissolutionProfiles(
  reference: DissolutionProfileInput | null | undefined,
  test: DissolutionProfileInput | null | undefined,
  options: { referenceUnits?: number | null; testUnits?: number | null; requireMatchingMethod?: boolean } = {},
): F2Result {
  if (!reference || !test || !Array.isArray(reference.points) || !Array.isArray(test.points)) {
    return refuse('MISSING_PROFILE', 'A reference profile and a test profile are both required.', [], 'not_a_profile_comparison');
  }
  if (reference.points.length === 0 || test.points.length === 0) {
    return refuse('NO_TIMEPOINTS', 'One of the profiles records no timepoint.', [
      { role: 'reference', observed: String(reference.points.length), required: 'at least one timepoint' },
      { role: 'test', observed: String(test.points.length), required: 'at least one timepoint' },
    ]);
  }

  const unitsFor = (p: DissolutionProfileInput, fallback: number | null | undefined): number | null => {
    const fromPoints = p.points
      .map((pt) => (pt.unitsTested === undefined || pt.unitsTested === null ? null : Number(pt.unitsTested)))
      .filter((n): n is number => n !== null && Number.isFinite(n) && n > 0);
    if (fromPoints.length > 0) return Math.min(...fromPoints);
    const n = Number(fallback);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const refUnits = unitsFor(reference, options.referenceUnits);
  const testUnits = unitsFor(test, options.testUnits);
  if (refUnits === null || testUnits === null) {
    return refuse(
      'UNITS_NOT_RECORDED',
      'The number of units behind each mean is not recorded, so f2 cannot be computed. It is not assumed to be twelve.',
      [
        { role: 'reference', observed: refUnits === null ? 'not recorded' : String(refUnits), required: 'a recorded unit count' },
        { role: 'test', observed: testUnits === null ? 'not recorded' : String(testUnits), required: 'a recorded unit count' },
      ],
    );
  }

  /* Sampling times must be the SAME times, not merely the same count. Two
     profiles read at 10/20/30 and 15/30/60 minutes are not comparable, and
     comparing them index-by-index produced f2 = 100 for profiles that share no
     timepoint at all. */
  const timeOf = (p: DissolutionPoint) => Number(p.timepointMin);
  const refTimes = reference.points.map(timeOf);
  const testTimes = test.points.map(timeOf);
  if (refTimes.some((t) => !Number.isFinite(t)) || testTimes.some((t) => !Number.isFinite(t))) {
    return refuse('NO_TIMEPOINTS', 'A timepoint is missing or is not a number.', []);
  }
  const sameTimes =
    refTimes.length === testTimes.length && refTimes.every((t, i) => t === testTimes[i]);
  if (!sameTimes) {
    return refuse(
      'TIMEPOINTS_DO_NOT_MATCH',
      'The two profiles are not sampled at the same times, so they cannot be compared point by point.',
      [
        { role: 'reference', observed: refTimes.join(', '), required: 'identical sampling times' },
        { role: 'test', observed: testTimes.join(', '), required: 'identical sampling times' },
      ],
      'resample_at_matching_timepoints',
    );
  }

  const means = (p: DissolutionProfileInput) => p.points.map((pt) => Number(pt.meanPercent));
  const refMeans = means(reference);
  const testMeans = means(test);
  const badMean = refMeans.findIndex((m) => !Number.isFinite(m));
  const badTestMean = testMeans.findIndex((m) => !Number.isFinite(m));
  if (badMean >= 0 || badTestMean >= 0) {
    return refuse('MEAN_MISSING', 'A mean percent dissolved is missing or is not a number.', [
      ...(badMean >= 0 ? [{ role: 'reference', timepointMin: refTimes[badMean], observed: String(reference.points[badMean].meanPercent), required: 'a numeric mean' }] : []),
      ...(badTestMean >= 0 ? [{ role: 'test', timepointMin: testTimes[badTestMean], observed: String(test.points[badTestMean].meanPercent), required: 'a numeric mean' }] : []),
    ]);
  }

  /* Both very rapidly dissolving: f2 is not the question. Reporting a number
     here alongside "the profiles are similar" is how the previous engine ended
     up returning f2Pass=false next to an interpretation saying they were
     similar — two contradictory fields in one governed result. */
  const veryRapid = (times: number[], m: number[]) =>
    times.some((t, i) => t <= 15 && m[i] >= 85);
  if (veryRapid(refTimes, refMeans) && veryRapid(testTimes, testMeans)) {
    return refuse(
      'BOTH_VERY_RAPIDLY_DISSOLVING',
      'Both profiles reach 85% or more within 15 minutes. An f2 comparison is not required in that case, and computing one here would present a number the guidance does not ask for as the basis of the conclusion.',
      [],
      'no_f2_needed_very_rapidly_dissolving',
    );
  }

  /* t = 0 is 0% for both profiles by construction. Including it adds a zero
     difference that inflates f2 (adding a 0/0 point moved a real comparison
     from 42.08 to 45.19). */
  const zeroIndex = refTimes.indexOf(0);
  const keep: number[] = [];
  for (let i = 0; i < refTimes.length; i += 1) {
    if (i === zeroIndex) continue;
    keep.push(i);
  }

  /* At most ONE point at or above 85% for either profile is included. */
  const truncation = { applied: false, atTimepointMin: null as number | null, discardedTimepointsMin: [] as number[] };
  const included: number[] = [];
  for (const i of keep) {
    included.push(i);
    if (refMeans[i] >= 85 || testMeans[i] >= 85) {
      truncation.applied = keep.indexOf(i) < keep.length - 1;
      truncation.atTimepointMin = refTimes[i];
      truncation.discardedTimepointsMin = keep.slice(keep.indexOf(i) + 1).map((j) => refTimes[j]);
      break;
    }
  }

  if (included.length < MIN_TIMEPOINTS) {
    return refuse(
      'TOO_FEW_TIMEPOINTS',
      `f2 requires at least ${MIN_TIMEPOINTS} comparable timepoints; ${included.length} remain after excluding t = 0 and truncating above 85% dissolution.`,
      [{ observed: String(included.length), required: `at least ${MIN_TIMEPOINTS}` }],
      'resample_earlier_timepoints',
    );
  }

  /* The variability gate, actually evaluated. The previous engine listed these
     limits as prose and had no field to check them against. */
  const firstIncluded = included[0];
  const variabilityOffenders: F2Refusal['offending'] = [];
  let anyVariabilityMissing = false;
  for (const i of included) {
    for (const [role, profile] of [['reference', reference], ['test', test]] as const) {
      const rsd = rsdOf(profile.points[i]);
      if (rsd === null) {
        anyVariabilityMissing = true;
        variabilityOffenders.push({ role, timepointMin: refTimes[i], observed: 'not recorded', required: 'SD or %RSD' });
        continue;
      }
      const limit = i === firstIncluded ? EARLY_RSD_LIMIT : LATE_RSD_LIMIT;
      if (rsd > limit) {
        return refuse(
          i === firstIncluded ? 'EARLY_VARIABILITY_EXCEEDED' : 'LATE_VARIABILITY_EXCEEDED',
          `The ${role} profile varies by ${rsd.toFixed(1)}% at ${refTimes[i]} min, above the ${limit}% limit that makes a mean-based f2 comparison valid.`,
          [{ role, timepointMin: refTimes[i], observed: `${rsd.toFixed(1)}%`, required: `at most ${limit}%` }],
          'bootstrap_f2_or_multivariate_distance',
        );
      }
    }
  }
  if (anyVariabilityMissing) {
    return refuse(
      'VARIABILITY_NOT_RECORDED',
      'f2 is only valid where variability is within the accepted limits, and no standard deviation or %RSD is recorded at every included timepoint, so that condition cannot be evaluated.',
      variabilityOffenders,
    );
  }

  const diffs = included.map((i) => refMeans[i] - testMeans[i]);
  const meanSquaredDifference = diffs.reduce((s, d) => s + d * d, 0) / included.length;
  const f2 = 50 * Math.log10(Math.pow(1 + meanSquaredDifference, -0.5) * 100);
  const sumAbs = included.reduce((s, i) => s + Math.abs(refMeans[i] - testMeans[i]), 0);
  const sumRef = included.reduce((s, i) => s + refMeans[i], 0);
  const f1 = sumRef > 0 ? (sumAbs / sumRef) * 100 : 0;

  const checksEvaluated: F2Computed['checksEvaluated'] = [
    { condition: 'Identical sampling times', required: 'the same timepoints in both profiles', observed: refTimes.join(', ') + ' min' },
    { condition: 'Comparable timepoints', required: `at least ${MIN_TIMEPOINTS}`, observed: String(included.length) },
    { condition: 'Units per profile', required: 'recorded', observed: `reference ${refUnits}, test ${testUnits}` },
    {
      condition: 'Variability at the first included timepoint',
      required: `at most ${EARLY_RSD_LIMIT}%`,
      observed: `${Math.max(rsdOf(reference.points[firstIncluded]) ?? 0, rsdOf(test.points[firstIncluded]) ?? 0).toFixed(1)}%`,
    },
    {
      condition: 'Variability at the later included timepoints',
      required: `at most ${LATE_RSD_LIMIT}%`,
      observed: `${Math.max(
        ...included.slice(1).flatMap((i) => [rsdOf(reference.points[i]) ?? 0, rsdOf(test.points[i]) ?? 0]),
        0,
      ).toFixed(1)}%`,
    },
    {
      condition: 'At most one point at or above 85% dissolution',
      required: 'one',
      observed: truncation.atTimepointMin === null ? 'none reached 85%' : `truncated after ${truncation.atTimepointMin} min`,
    },
  ];

  return {
    outcome: 'computed',
    f2,
    f2Reported: f2.toFixed(1),
    /* Compared UNROUNDED. Rounding to two decimals first reported a true
       49.99973 as 50 and similar. */
    f2Similar: f2 >= SIMILARITY_CUTOFF,
    f1,
    f1Reported: f1.toFixed(1),
    f1WithinBand: f1 <= 15,
    inputsUsed: {
      includedTimepointsMin: included.map((i) => refTimes[i]),
      n: included.length,
      referenceMeans: included.map((i) => refMeans[i]),
      testMeans: included.map((i) => testMeans[i]),
      zeroTimepointExcluded: zeroIndex >= 0,
      above85Truncation: truncation,
      unitsTested: { reference: refUnits, test: testUnits },
    },
    checksEvaluated,
    scope: SCOPE_STATEMENT,
  };
}

/**
 * Read a dissolution register row's stored points into the engine's shape.
 *
 * The register's json rows are typed by a human into a pipe-delimited field, so
 * every value arrives as a string; nothing is defaulted on the way in — a blank
 * cell stays absent and the engine refuses on it.
 */
export function pointsFromRecordedProfile(rows: unknown): DissolutionPoint[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const row = r as Record<string, unknown>;
      const num = (v: unknown): number | null => {
        if (v === undefined || v === null || String(v).trim() === '') return null;
        const n = Number(String(v).trim());
        return Number.isFinite(n) ? n : null;
      };
      return {
        timepointMin: num(row.timepoint ?? row.timepointMin) as number,
        meanPercent: num(row.meanPercent ?? row.mean) as number,
        unitsTested: num(row.n ?? row.unitsTested),
        sdPercent: num(row.sd ?? row.sdPercent),
        rsdPercent: num(row.rsd ?? row.rsdPercent),
      };
    });
}
