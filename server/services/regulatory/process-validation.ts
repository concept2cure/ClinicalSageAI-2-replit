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
  cpk: number | null;
  capable: boolean;
  minCpk: number;
}

/** Compute process capability indices against one- or two-sided specs. */
export function computeProcessCapability(args: CapabilityArgs): CapabilityResult {
  const { measurements } = args;
  if (measurements.length < 2) {
    throw new Error('Process capability requires at least 2 measurements.');
  }
  const minCpk = args.minCpk ?? 1.33;
  const n = measurements.length;
  const mean = measurements.reduce((s, v) => s + v, 0) / n;
  const variance = measurements.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const round = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

  const { lowerSpecLimit: lsl, upperSpecLimit: usl } = args;
  let cp: number | null = null;
  if (lsl !== undefined && usl !== undefined && stdDev > 0) {
    cp = (usl - lsl) / (6 * stdDev);
  }

  let cpk: number | null = null;
  if (stdDev > 0) {
    const cpu = usl !== undefined ? (usl - mean) / (3 * stdDev) : Infinity;
    const cpl = lsl !== undefined ? (mean - lsl) / (3 * stdDev) : Infinity;
    const candidate = Math.min(cpu, cpl);
    cpk = Number.isFinite(candidate) ? candidate : null;
  }

  return {
    mean: round(mean)!,
    stdDev: round(stdDev)!,
    cp: round(cp),
    cpk: round(cpk),
    capable: cpk !== null && cpk >= minCpk,
    minCpk,
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
