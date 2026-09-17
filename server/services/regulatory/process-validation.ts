/**
 * Manufacturing process validation + lot release engine.
 *
 * Pure and deterministic. Closes the audit gap "Manufacturing & production
 * controls — absent": no process validation (IQ/OQ/PQ), no reagent lot release
 * / Certificate of Analysis evaluation.
 *
 * Backbone:
 *   - 21 CFR 820.75 — Process validation (when output cannot be fully verified)
 *   - GHTF/SG3/N99-10 — IQ / OQ / PQ stages
 *   - Process capability indices Cp / Cpk / Pp / Ppk
 *   - 21 CFR 820.80 — Receiving, in-process, and finished-device acceptance
 */
import { assessProcessCapability } from '../cmc/process-capability';
import type { ParsedAcceptanceCriterion } from '../cmc/recorded-stability';


// ─────────────────────────────────────────────────────────────────────────────
// IQ/OQ/PQ stage gating
// ─────────────────────────────────────────────────────────────────────────────

export const PV_STAGES = ['iq', 'oq', 'pq'] as const;
export type PvStage = (typeof PV_STAGES)[number];

export interface PvStageStatus {
  stage: PvStage;
  protocolApproved: boolean;
  executed: boolean;
  /** All acceptance criteria met. */
  passed: boolean;
  deviationsOpen: number;
}

export interface ProcessValidationResult {
  /** Highest completed stage in the required IQ→OQ→PQ order. */
  furthestCompletedStage: PvStage | null;
  /** Whether the full IQ/OQ/PQ sequence is validated. */
  fullyValidated: boolean;
  /** Stage that is blocking progress, if any. */
  blockingStage: PvStage | null;
  gaps: string[];
}

/** Evaluate IQ/OQ/PQ progression with strict ordering (no OQ before IQ, etc.). */
export function assessProcessValidation(stages: PvStageStatus[]): ProcessValidationResult {
  const byStage = new Map(stages.map(s => [s.stage, s]));
  const gaps: string[] = [];
  let furthestCompletedStage: PvStage | null = null;
  let blockingStage: PvStage | null = null;

  for (const stage of PV_STAGES) {
    const s = byStage.get(stage);
    const complete = !!s && s.protocolApproved && s.executed && s.passed && s.deviationsOpen === 0;
    if (complete) {
      furthestCompletedStage = stage;
    } else {
      if (!s) gaps.push(`${stage.toUpperCase()} not started.`);
      else {
        if (!s.protocolApproved) gaps.push(`${stage.toUpperCase()} protocol not approved.`);
        if (!s.executed) gaps.push(`${stage.toUpperCase()} not executed.`);
        if (s.executed && !s.passed) gaps.push(`${stage.toUpperCase()} acceptance criteria not met.`);
        if (s.deviationsOpen > 0) gaps.push(`${stage.toUpperCase()} has ${s.deviationsOpen} open deviation(s).`);
      }
      blockingStage = stage;
      break; // strict ordering: cannot credit a later stage past a gap
    }
  }

  return {
    furthestCompletedStage,
    fullyValidated: furthestCompletedStage === 'pq',
    blockingStage,
    gaps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Process capability (Cp / Cpk / Pp / Ppk)
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityArgs {
  measurements: number[];
  lowerSpecLimit?: number;
  upperSpecLimit?: number;
  /** Minimum acceptable Cpk (default 1.33, a common medical-device target). */
  minCpk?: number;
}

export interface CapabilityResult {
  mean: number;
  stdDev: number;
  cp: number | null;
  /** Performance index on the overall sd (Ppk) — what this calculator has always reported as cpk. */
  cpk: number | null;
  /** Within-process Cpk from the moving-range sigma (ISO 22514 individuals convention). */
  cpkWithin: number | null;
  capable: boolean;
  minCpk: number;
  n: number;
  /** Fewer than 25 measurements: the index carries wide sampling error. */
  preliminary: boolean;
  outOfSpecification: number;
  notes: string[];
}

/**
 * Compute process capability indices against one- or two-sided specs.
 *
 * An adapter over the ONE capability implementation
 * (services/cmc/process-capability — ISO 22514 / individuals–moving-range
 * convention). This file used to carry its own: overall sd only, two
 * measurements accepted, no out-of-specification gate. `cpk` here is the
 * performance index on the overall sd (Ppk, the figure the old code
 * reported); the within-process Cpk from the moving range is returned as
 * `cpkWithin`. Fewer than six measurements refuse, as the engine does — an
 * index over two points is not a capability.
 */
export function computeProcessCapability(args: CapabilityArgs): CapabilityResult {
  const { measurements } = args;
  const minCpk = args.minCpk ?? 1.33;
  const { lowerSpecLimit: lsl, upperSpecLimit: usl } = args;
  if (lsl === undefined && usl === undefined) {
    throw new Error('Process capability requires at least one specification limit.');
  }
  const criterion: ParsedAcceptanceCriterion =
    lsl !== undefined && usl !== undefined
      ? { limit: lsl, direction: 'decreasing', upperLimit: usl, twoSided: true }
      : lsl !== undefined
        ? { limit: lsl, direction: 'decreasing', upperLimit: null, twoSided: false }
        : { limit: usl as number, direction: 'increasing', upperLimit: null, twoSided: false };
  const assessed = assessProcessCapability(
    measurements.map((value, i) => ({ batch: `m${i + 1}`, value })),
    criterion,
  );
  if (!assessed.ok) throw new Error(assessed.message);
  const round = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);
  return {
    mean: round(assessed.mean)!,
    stdDev: round(assessed.sdOverall)!,
    cp: round(assessed.pp),
    cpk: round(assessed.ppk),
    cpkWithin: round(assessed.cpk),
    capable: assessed.verdict === 'capable' && assessed.ppk >= minCpk,
    minCpk,
    n: assessed.n,
    preliminary: assessed.preliminary,
    outOfSpecification: assessed.batchesOutOfSpecification.length,
    notes: assessed.notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lot release / Certificate of Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface CoATest {
  parameter: string;
  result: number;
  lowerLimit?: number;
  upperLimit?: number;
}

export interface LotReleaseArgs {
  lotId: string;
  tests: CoATest[];
  /** Whether the manufacturing record (DHR) is complete for the lot. */
  deviceHistoryRecordComplete: boolean;
}

export interface LotReleaseResult {
  lotId: string;
  perTest: { parameter: string; result: number; pass: boolean }[];
  allTestsPass: boolean;
  /** Final disposition. */
  disposition: 'released' | 'rejected' | 'hold';
  failures: string[];
}

/** Evaluate a lot for release against its Certificate-of-Analysis limits. */
export function evaluateLotRelease(args: LotReleaseArgs): LotReleaseResult {
  if (args.tests.length === 0) throw new Error('Lot release requires at least one CoA test.');
  const perTest = args.tests.map(t => {
    const aboveLower = t.lowerLimit === undefined || t.result >= t.lowerLimit;
    const belowUpper = t.upperLimit === undefined || t.result <= t.upperLimit;
    return { parameter: t.parameter, result: t.result, pass: aboveLower && belowUpper };
  });
  const failures = perTest.filter(t => !t.pass).map(t => t.parameter);
  const allTestsPass = failures.length === 0;

  let disposition: LotReleaseResult['disposition'];
  if (!allTestsPass) disposition = 'rejected';
  else if (!args.deviceHistoryRecordComplete) disposition = 'hold';
  else disposition = 'released';

  return {
    lotId: args.lotId,
    perTest,
    allTestsPass,
    disposition,
    failures: [
      ...failures.map(f => `Out-of-specification: ${f}`),
      ...(!args.deviceHistoryRecordComplete ? ['Device History Record incomplete (820.184).'] : []),
    ],
  };
}
