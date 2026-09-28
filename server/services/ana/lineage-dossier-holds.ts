/**
 * AnA's own Manual holds, as the lineage dossier reads them (row 74, slice
 * S4) — kept beside lineage-dossier.ts rather than in it, so the run policy's
 * part of the dossier is one small module and the dossier (row 60's) gains a
 * field, not a reader.
 *
 * @module server/services/ana/lineage-dossier-holds
 */
import { isPolicyHoldOutcome, stepLabels, type PolicyHoldOutcome } from '@shared/ana/run-policy';

/**
 * One of AnA's OWN holds under Manual (row 74): she stopped before a step and
 * waited for the person. Distinct from the dossier's human controls on
 * purpose — the pause was the run policy's, not a person's, so it is not a
 * control; the person's "Run this step" that answered it IS one, and appears
 * there as a resume. Together they explain a resume that has no matching
 * human pause.
 */
export interface DossierPolicyHold {
  /** The assistant turn (1-based), numbered as the reasoning and controls are. */
  turn: number;
  /** The round she held before. */
  round: number;
  reason: 'manual';
  /** The steps she was about to run, by label. */
  next: string[];
  /**
   * How it was settled (shared/ana/run-policy.ts POLICY_HOLD_OUTCOMES).
   * `superseded` is not a hold: a steer sent while she worked replaced the
   * step before it was shown — kept so the step's fate is on the record.
   */
  outcome: PolicyHoldOutcome;
  at: string | null;
  /** The turn's run policy as stored with the message. */
  runPolicy: string | null;
}

/**
 * One turn's Manual holds, from the message metadata (tool-trace.ts
 * withTurnEnding). A malformed entry is COUNTED as unreadable, never dropped
 * in silence: a corrupt record must not read as "no holds".
 */
export function policyHoldsOf(
  meta: Record<string, unknown>,
  turn: number,
): { holds: DossierPolicyHold[]; unreadable: number } {
  const runPolicy = typeof meta.runPolicy === 'string' ? meta.runPolicy : null;
  const stored: unknown[] = Array.isArray(meta.policyHolds) ? meta.policyHolds : [];
  const holds: DossierPolicyHold[] = [];
  for (const raw of stored) {
    const h = raw as Record<string, unknown> | null;
    if (!h || typeof h !== 'object' || !Number.isInteger(h.round) || h.reason !== 'manual') continue;
    if (!isPolicyHoldOutcome(h.outcome)) continue;
    holds.push({
      turn,
      round: h.round as number,
      reason: 'manual',
      next: stepLabels(h.next),
      outcome: h.outcome,
      at: typeof h.at === 'string' ? h.at : null,
      runPolicy,
    });
  }
  return { holds, unreadable: stored.length - holds.length };
}
