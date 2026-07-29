/**
 * IND submission overview aggregator.
 *
 * Combines a submission's eCTD sequences into a single dashboard summary
 * (counts by type/status, the latest sequence number, dispatch/validation
 * roll-ups). The pure summarizer is the tested core; the route that loads the
 * submission + its sequences from submission-service lives in
 * ind-lifecycle.routes.ts.
 */

/** The minimal sequence shape this aggregator reads (a subset of EctdSequence). */
export interface SequenceLike {
  sequenceNumber: string;
  type: string;
  status: string;
  validationStatus?: string | null;
  dispatchStatus?: string | null;
}

export interface SequenceSummary {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  /** Highest 4-digit sequence number present (the most recent submission), or null. */
  latestSequenceNumber: string | null;
  /** Count with dispatchStatus 'sent' or 'acknowledged'. */
  dispatched: number;
  /** Count with validationStatus 'passed'. */
  validated: number;
  /** Count with validationStatus 'failed' (needs attention). */
  validationFailures: number;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Summarize a submission's sequences. Deterministic; order-independent.
 */
export function summarizeSequences(sequences: SequenceLike[]): SequenceSummary {
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let latest: string | null = null;
  let dispatched = 0;
  let validated = 0;
  let validationFailures = 0;

  for (const seq of sequences) {
    increment(byType, seq.type);
    increment(byStatus, seq.status);
    if (/^\d{4}$/.test(seq.sequenceNumber)) {
      if (latest === null || seq.sequenceNumber > latest) latest = seq.sequenceNumber;
    }
    if (seq.dispatchStatus === 'sent' || seq.dispatchStatus === 'acknowledged') dispatched += 1;
    if (seq.validationStatus === 'passed') validated += 1;
    if (seq.validationStatus === 'failed') validationFailures += 1;
  }

  return {
    total: sequences.length,
    byType,
    byStatus,
    latestSequenceNumber: latest,
    dispatched,
    validated,
    validationFailures,
  };
}
