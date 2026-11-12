/**
 * The interim analysis plan's efficacy boundaries, from the exact
 * group-sequential engine (../stats/group-sequential-oc.ts). Split out of
 * document-generator.ts, which only prints what this returns.
 *
 * Until 2026-11-12 the plan printed `±(2.96 − 0.6·t)` at each interim look and
 * a fixed ±1.97 at the final analysis whatever α was, under the name
 * "O'Brien–Fleming-type". For two interim looks that is ±2.76 and ±2.56 where
 * the Lan–DeMets O'Brien–Fleming boundaries are ±3.71 and ±2.51: a first look
 * crossed under the null about thirty times as often as the design it named.
 * RULE 2: a figure in governed content comes from a deterministic engine. The
 * engine was already in the repository; nothing here computes a boundary
 * itself.
 *
 * What is solved, and what is refused:
 *  - The engine's α is two-sided (computation-engine.ts), so the efficacy
 *    boundary is solved at one-sided α/2. A superiority test is two-sided and
 *    its boundary is mirrored; a non-inferiority test is one-sided.
 *  - Looks are equally spaced in information, which is what the plan's Timing
 *    section states: the engine's input (StatisticalInput) carries the NUMBER
 *    of interim analyses and nothing about when they fall. The section says so
 *    in its own words, so a reader does not take them for looks at any other
 *    fraction.
 *  - This is the engine-input view, for a worked example and a design alike.
 *    The study-design spine has its own, richer one over the same engine
 *    (../study-design/interim-oc.ts): the design's RECORDED fractions, spending
 *    function and boundaries, with discrepancies named. Nothing here replaces
 *    it.
 *  - One comparison of two groups on one primary endpoint (a mean, a
 *    proportion or a time to event), tested for superiority or non-inferiority.
 *    Anything else — equivalence by two one-sided tests, a performance goal,
 *    diagnostic accuracy with co-primary endpoints, more than two groups, more
 *    than one primary endpoint — gets NO numbers and the reason. These
 *    boundaries control the error of one test in one direction; printed for a
 *    different test they would be a figure with nothing behind it.
 */
import type { ComputationResult, StatisticalInput } from './types';
import { computeOperatingCharacteristic, solveSpendingBoundaries } from '../stats/group-sequential-oc';
import { normalCdf, normalQuantile } from '../stats/normal';

/** Interim looks the plan solves boundaries for. The solve is quadratic in its
 *  grid for every look, and the count arrives unvalidated from the request. */
export const MAX_INTERIM_LOOKS = 10;

export interface InterimLookBoundary {
  /** 1-based. The last entry is the final analysis. */
  look: number;
  final: boolean;
  informationFraction: number;
  /** Efficacy boundary on the z-scale (upper; a two-sided test mirrors it). */
  boundary: number;
  /** 1 − Φ(boundary). */
  nominalOneSidedP: number;
  /** Cumulative one-sided alpha spent by this look. */
  cumulativeOneSidedAlpha: number;
}

export type InterimBoundaries =
  | {
      kind: 'solved';
      looks: InterimLookBoundary[];
      /** A two-sided test, whose boundary is mirrored; otherwise one-sided. */
      twoSided: boolean;
      /** The one-sided level the boundary was solved to spend: α/2. */
      oneSidedAlpha: number;
      /** The single-look power the sample size was computed for. */
      singleLookPower: number;
      /** P(cross an efficacy boundary by the final analysis) at the drift that
       *  gives the single-look power, at the same maximum sample size; null
       *  when the single-look power is not a figure a drift can be read from. */
      powerUnderBoundaries: number | null;
    }
  | { kind: 'not_computed'; reason: string };

const COMPARISON_ENDPOINTS: ReadonlySet<string> = new Set(['continuous', 'binary', 'time_to_event']);
const ONE_DIRECTION_TESTS: ReadonlySet<string> = new Set(['superiority', 'non_inferiority', 'adaptive']);

/** Why this design gets no boundary, or null when it is the one comparison the boundaries are for. */
function refusalFor(input: StatisticalInput, interimLooks: number): string | null {
  if (!Number.isInteger(interimLooks) || interimLooks < 1) {
    return 'the number of interim analyses is not a whole number of one or more';
  }
  if (interimLooks > MAX_INTERIM_LOOKS) {
    return `boundaries are computed for up to ${MAX_INTERIM_LOOKS} interim analyses, and this design records ${interimLooks}`;
  }
  if (!(input.alpha > 0 && input.alpha < 1)) return 'the significance level is not between 0 and 1';
  if (input.clientTrack === 'medical_device' && input.studyType === 'performance') {
    return 'the design is tested against a performance goal, not as a comparison of two groups';
  }
  if (!ONE_DIRECTION_TESTS.has(input.studyType)) {
    return input.studyType === 'equivalence'
      ? 'equivalence is shown by two one-sided tests, and these boundaries control one test in one direction'
      : 'the design is not a superiority or non-inferiority comparison of two groups';
  }
  if (!COMPARISON_ENDPOINTS.has(input.endpointType)) {
    return 'the primary endpoint is not a mean, a proportion or a time to event compared between two groups';
  }
  if ((input.numberOfGroups ?? 2) !== 2) {
    return 'the design has more than one comparison, and the alpha each takes into a group-sequential test depends on the multiplicity procedure';
  }
  if ((input.numberOfEndpoints ?? 1) > 1) {
    return 'the design has more than one primary endpoint, and the alpha each takes into a group-sequential test depends on the multiplicity procedure';
  }
  return null;
}

/**
 * The plan's efficacy boundaries for `interimLooks` interim analyses and the
 * final one, equally spaced in information — or the reason none is printed.
 */
export function interimBoundaries(
  input: StatisticalInput,
  comp: ComputationResult,
  interimLooks: number,
): InterimBoundaries {
  const reason = refusalFor(input, interimLooks);
  if (reason) return { kind: 'not_computed', reason };

  const oneSidedAlpha = input.alpha / 2;
  const fractions = Array.from({ length: interimLooks + 1 }, (_, i) => (i + 1) / (interimLooks + 1));
  fractions[fractions.length - 1] = 1;

  let solved: ReturnType<typeof solveSpendingBoundaries>;
  try {
    solved = solveSpendingBoundaries(fractions, oneSidedAlpha, 'obrien-fleming');
  } catch (error) {
    return {
      kind: 'not_computed',
      reason: `the group-sequential engine did not solve them (${error instanceof Error ? error.message : 'no reason given'})`,
    };
  }
  if (solved.efficacyBoundaries.length !== fractions.length || solved.efficacyBoundaries.some((z) => !Number.isFinite(z))) {
    return { kind: 'not_computed', reason: 'the group-sequential engine returned no finite boundary for every look' };
  }

  const looks: InterimLookBoundary[] = fractions.map((informationFraction, i) => ({
    look: i + 1,
    final: i === fractions.length - 1,
    informationFraction,
    boundary: solved.efficacyBoundaries[i],
    nominalOneSidedP: 1 - normalCdf(solved.efficacyBoundaries[i]),
    cumulativeOneSidedAlpha: solved.cumulativeAlpha[i],
  }));

  /* The drift the single-look test has at its stated power: E[Z] = z_{1−α/2} + z_{power}.
     The same drift under the boundaries is the design's power at the same maximum N. */
  const singleLookPower = comp.power;
  let powerUnderBoundaries: number | null = null;
  if (singleLookPower > 0.5 && singleLookPower < 1) {
    const drift = normalQuantile(1 - oneSidedAlpha) + normalQuantile(singleLookPower);
    const oc = computeOperatingCharacteristic(
      { informationFractions: fractions, efficacyBoundaries: solved.efficacyBoundaries },
      drift,
    );
    if (Number.isFinite(oc.rejectProbability)) powerUnderBoundaries = oc.rejectProbability;
  }

  return {
    kind: 'solved',
    looks,
    twoSided: input.studyType !== 'non_inferiority',
    oneSidedAlpha,
    singleLookPower,
    powerUnderBoundaries,
  };
}

/* ── The plan's "Alpha Spending" section, printed from the above ─────────── */

const z2 = (z: number, twoSided: boolean) => `${twoSided ? '±' : ''}${z.toFixed(2)}`;
const p4 = (p: number) => (p < 0.00005 ? '<0.0001' : p.toFixed(4));
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
/** 0.05 / 2 is 0.025, not 0.025000000000000001: six significant figures, no trailing zeros. */
const level = (a: number) => String(Number(a.toPrecision(6)));

/** Section 3 of the interim analysis plan: the boundaries the engine solved, or why there are none. */
export function interimAlphaSpendingSection(input: StatisticalInput, b: InterimBoundaries): string {
  if (b.kind === 'not_computed') {
    return (
      `## 3. Alpha Spending\n\n` +
      `A group-sequential design needs a pre-specified alpha-spending function (for example Lan–DeMets O'Brien–Fleming), ` +
      `so that the cumulative spend at the final analysis equals the study-wide α = ${input.alpha}.\n\n` +
      `No boundary is printed for this design: ${b.reason}. The boundaries are to be computed for the test this design ` +
      `uses, and fixed before the first look.\n\n`
    );
  }
  const sided = b.twoSided
    ? `The test is two-sided at α = ${input.alpha}: each direction spends α/2 = ${level(b.oneSidedAlpha)}, the boundary is symmetric, and the cumulative spend at the final analysis equals the study-wide α.`
    : `The test is one-sided at α/2 = ${level(b.oneSidedAlpha)} (α = ${input.alpha} is stated two-sided), and the cumulative spend at the final analysis equals that level.`;
  let c =
    `## 3. Alpha Spending\n\n` +
    `Efficacy boundaries follow the Lan–DeMets O'Brien–Fleming alpha-spending function: little alpha is spent at an early ` +
    `look, and the final analysis stays close to the single-look critical value. ${sided}\n\n` +
    /* Four narrow columns. At 390 px a wider table hid the last digit of its last column
       ("0.000" for 0.0001), which is a different number: the look and its information
       fraction share a cell, and the sentence under the table says what the short
       headings mean. */
    `| Look | Boundary (Z) | Nominal p | α spent |\n|---|---|---|---|\n`;
  for (const l of b.looks) {
    c += `| ${l.final ? 'Final' : l.look} (${(l.informationFraction * 100).toFixed(0)}%) | ${z2(l.boundary, b.twoSided)} | ${p4(l.nominalOneSidedP)} | ${p4(l.cumulativeOneSidedAlpha)} |\n`;
  }
  c +=
    `\nEach look is shown with its share of the planned information. Nominal p is the one-sided p-value at the boundary; α spent is the cumulative one-sided alpha.\n` +
    `\n*Computed by the group-sequential engine: the exact recursive integration of the joint distribution of the ` +
    `sequential test statistics, for looks equally spaced in information. A look taken at a different information ` +
    `fraction has a different boundary; recompute from the information observed at each look.*\n\n`;
  if (b.powerUnderBoundaries !== null) {
    c +=
      `At the same maximum sample size, the probability of crossing an efficacy boundary by the final analysis is ` +
      `${pct1(b.powerUnderBoundaries)}, against ${pct1(b.singleLookPower)} for the single-look test the sample size was computed for.\n\n`;
  }
  if (input.studyType === 'adaptive') {
    c +=
      `These boundaries cover the efficacy looks only. Any other adaptation (sample-size re-estimation, dropping an arm, ` +
      `enrichment) needs its own control of the Type I error, which this plan does not compute.\n\n`;
  }
  return c;
}
