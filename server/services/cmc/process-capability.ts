/**
 * Process capability over recorded batch results.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * ICH Q6A sets the specification; whether the process can meet it batch after
 * batch is a capability question, and the registers already carry the two
 * inputs — a series of batch results and the acceptance criterion they are
 * judged against. This computes the conventional indices over them and
 * refuses, with the reason, whenever the data cannot support one.
 *
 *   Pp / Ppk  — performance, from the OVERALL sample standard deviation
 *               (n − 1): what the batches on file actually did.
 *   Cp / Cpk  — capability, from the WITHIN estimate of sigma taken from the
 *               average moving range of consecutive batches, MR̄ / d₂ with
 *               d₂(2) = 1.128 — the individuals-chart convention (ISO 22514,
 *               Montgomery), since a batch result is a subgroup of one.
 *
 * One-sided criteria carry one index (Cpu or Cpl); Cp/Pp are stated only for
 * a two-sided range. The 1.33 / 1.00 grades are the conventional ones and are
 * reported as grades, not as a regulatory requirement — ICH sets none.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 * Fewer than six batches, no parseable criterion, or a series with no
 * variation refuse rather than answer. Under 25 batches the estimate is
 * marked preliminary — the sampling error on a capability index from a
 * handful of batches is large, and the section must say so.
 *
 * @module server/services/cmc/process-capability
 */
import type { ParsedAcceptanceCriterion } from './recorded-stability';

export interface BatchResultPoint {
  batch: string;
  value: number;
}

export type ProcessCapabilityRefusalCode =
  | 'CRITERION_NOT_RECORDED'
  /* Rows of one test recorded against DIFFERENT criteria. Distinct from
     CRITERION_NOT_RECORDED: "we hold two specifications for this test" and "we
     hold none" send a staffer to different records, and both were reported as
     the same code with the Note column reading "criteria disagree" over a
     series that recorded no criterion at all. */
  | 'CRITERIA_DISAGREE'
  | 'INSUFFICIENT_BATCHES'
  | 'NO_VARIATION';

export interface ProcessCapabilityRefusal {
  ok: false;
  code: ProcessCapabilityRefusalCode;
  message: string;
  /** Batches whose result was not numeric, named so nothing is silently dropped. */
  excludedBatches: string[];
}

export type CapabilityVerdict = 'capable' | 'marginal' | 'not-capable';

export interface ProcessCapabilityAssessed {
  ok: true;
  n: number;
  mean: number;
  /** Sample standard deviation (n − 1). */
  sdOverall: number;
  /** Within-process sigma from the average moving range, MR̄ / 1.128. */
  sdWithin: number;
  limits: { lower: number | null; upper: number | null };
  /** Null on a one-sided criterion. */
  cp: number | null;
  cpk: number;
  /** Null on a one-sided criterion. */
  pp: number | null;
  ppk: number;
  /** Named, never folded into the index: a batch outside the specification. */
  batchesOutOfSpecification: string[];
  excludedBatches: string[];
  /** True under 25 batches: the index is stated with its sampling caveat. */
  preliminary: boolean;
  /** Against the conventional grades: ≥ 1.33 capable, ≥ 1.00 marginal, below not capable; any OOS batch is not capable. */
  verdict: CapabilityVerdict;
  notes: string[];
  citation: string;
}

export type ProcessCapabilityOutcome = ProcessCapabilityAssessed | ProcessCapabilityRefusal;

export const MINIMUM_BATCHES = 6;
export const PRELIMINARY_BELOW = 25;
/** d₂ for subgroups of two — the moving-range constant. */
const D2_MOVING_RANGE = 1.128;

const CITATION =
  'ICH Q6A (specifications); capability indices per ISO 22514-2 and the individuals/moving-range convention (Montgomery, Introduction to Statistical Quality Control)';

function round(v: number, dp = 4): number {
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

export function assessProcessCapability(
  points: BatchResultPoint[],
  criterion: ParsedAcceptanceCriterion | null,
): ProcessCapabilityOutcome {
  const excludedBatches = points.filter((p) => !Number.isFinite(p.value)).map((p) => p.batch);
  const usable = points.filter((p) => Number.isFinite(p.value));

  if (!criterion) {
    return {
      ok: false,
      code: 'CRITERION_NOT_RECORDED',
      message: 'No acceptance criterion is recorded for this attribute, so there is no specification to measure capability against.',
      excludedBatches,
    };
  }
  if (usable.length < MINIMUM_BATCHES) {
    return {
      ok: false,
      code: 'INSUFFICIENT_BATCHES',
      message: `${usable.length} numeric batch result(s) are recorded; a capability index needs at least ${MINIMUM_BATCHES}.` +
        (excludedBatches.length ? ` ${excludedBatches.length} result(s) were not numeric (${excludedBatches.join(', ')}).` : ''),
      excludedBatches,
    };
  }

  const n = usable.length;
  const values = usable.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sdOverall = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
  const movingRanges = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const sdWithin = movingRanges.reduce((a, b) => a + b, 0) / movingRanges.length / D2_MOVING_RANGE;
  if (sdOverall === 0 || sdWithin === 0) {
    return {
      ok: false,
      code: 'NO_VARIATION',
      message: `All ${n} batch results are identical (${values[0]}), so sigma is zero and a capability index is undefined. Either the results are recorded at too coarse a precision to carry variation, or the series is not a measurement.`,
      excludedBatches,
    };
  }

  /* The criterion parser reports a two-sided range as its lower bound plus
     `upperLimit`; a one-sided criterion as `limit` on the side its comparator
     names. */
  const lower = criterion.twoSided ? criterion.limit : criterion.direction === 'decreasing' ? criterion.limit : null;
  const upper = criterion.twoSided ? criterion.upperLimit : criterion.direction === 'increasing' ? criterion.limit : null;

  const upperIndex = (sd: number) => (upper === null ? null : (upper - mean) / (3 * sd));
  const lowerIndex = (sd: number) => (lower === null ? null : (mean - lower) / (3 * sd));
  const minOf = (a: number | null, b: number | null): number => {
    const both = [a, b].filter((x): x is number => x !== null);
    return Math.min(...both);
  };
  const cpk = round(minOf(upperIndex(sdWithin), lowerIndex(sdWithin)));
  const ppk = round(minOf(upperIndex(sdOverall), lowerIndex(sdOverall)));
  const cp = upper !== null && lower !== null ? round((upper - lower) / (6 * sdWithin)) : null;
  const pp = upper !== null && lower !== null ? round((upper - lower) / (6 * sdOverall)) : null;

  const batchesOutOfSpecification = usable
    .filter((p) => (upper !== null && p.value > upper) || (lower !== null && p.value < lower))
    .map((p) => p.batch);

  const preliminary = n < PRELIMINARY_BELOW;
  const verdict: CapabilityVerdict =
    batchesOutOfSpecification.length > 0 ? 'not-capable' : ppk >= 1.33 ? 'capable' : ppk >= 1.0 ? 'marginal' : 'not-capable';

  const notes: string[] = [];
  if (preliminary) {
    notes.push(`Preliminary: ${n} batches. A capability index from fewer than ${PRELIMINARY_BELOW} batches carries wide sampling error and is not a demonstrated capability.`);
  }
  if (batchesOutOfSpecification.length > 0) {
    notes.push(`${batchesOutOfSpecification.length} batch(es) outside the specification: ${batchesOutOfSpecification.join(', ')}. The process is not capable over this series whatever the index says.`);
  }
  if (excludedBatches.length > 0) {
    notes.push(`${excludedBatches.length} result(s) were not numeric and are excluded: ${excludedBatches.join(', ')}.`);
  }
  if (Math.abs(cpk - ppk) > 0.25) {
    notes.push('Cpk and Ppk differ by more than 0.25: batch-to-batch variation exceeds the within-process estimate, which points to a drifting or shifting process rather than random scatter.');
  }

  return {
    ok: true,
    n,
    mean: round(mean, 6),
    sdOverall: round(sdOverall, 6),
    sdWithin: round(sdWithin, 6),
    limits: { lower, upper },
    cp,
    cpk,
    pp,
    ppk,
    batchesOutOfSpecification,
    excludedBatches,
    preliminary,
    verdict,
    notes,
    citation: CITATION,
  };
}
