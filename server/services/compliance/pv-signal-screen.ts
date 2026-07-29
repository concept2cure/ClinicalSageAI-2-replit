/**
 * Pharmacovigilance signal screen.
 *
 * Activates the (previously dormant) disproportionality math into a runnable
 * batch screen: given many drug–event 2x2 contingency counts, compute each
 * pair's PRR / ROR / chi-squared / EBGM / EB05 and surface the detected signals
 * ranked by strength. Pure / deterministic.
 *
 * Conventional signal rule (from pv-signal-detection): PRR>=2 AND chiSquared>=4
 * AND a>=3.
 */

import {
  computeDisproportionality,
  type ContingencyCounts,
  type DisproportionalityResult,
} from './pv-signal-detection';

export interface SignalScreenInput {
  /** Suspect product (e.g. a drug name or code). */
  drug: string;
  /** Adverse-event term (e.g. a MedDRA PT). */
  event: string;
  counts: ContingencyCounts;
}

export interface SignalScreenRow {
  drug: string;
  event: string;
  result: DisproportionalityResult;
}

export interface SignalScreen {
  /** All pairs, signals first, then by EB05 descending (most robust signals top). */
  rows: SignalScreenRow[];
  summary: {
    total: number;
    signals: number;
  };
}

/**
 * Run the disproportionality screen over a batch of drug–event pairs. Rows are
 * ordered with detected signals first, then by EB05 (the conservative shrinkage
 * estimate) descending; ties broken by PRR then by drug/event for determinism.
 */
export function runSignalScreen(inputs: SignalScreenInput[]): SignalScreen {
  const rows: SignalScreenRow[] = inputs.map((i) => ({
    drug: i.drug,
    event: i.event,
    result: computeDisproportionality(i.counts),
  }));

  rows.sort((a, b) => {
    if (a.result.signalDetected !== b.result.signalDetected) return a.result.signalDetected ? -1 : 1;
    if (b.result.eb05 !== a.result.eb05) return b.result.eb05 - a.result.eb05;
    if (b.result.prr !== a.result.prr) return b.result.prr - a.result.prr;
    return a.drug < b.drug ? -1 : a.drug > b.drug ? 1 : a.event < b.event ? -1 : a.event > b.event ? 1 : 0;
  });

  return {
    rows,
    summary: { total: rows.length, signals: rows.filter((r) => r.result.signalDetected).length },
  };
}
