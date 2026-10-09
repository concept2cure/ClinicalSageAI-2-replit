/**
 * What is said beside a transmittal that left the platform when something
 * after the send did not hold. Pure wording over a GovernedTransmitOutcome, so
 * a caller can say it without loading the transmit service.
 *
 * Split out of governed-transmit.ts 2026-09-28, when the AnA transmit handler
 * started reporting these too (see transmitOutcomeNotices).
 */
import type { GovernedTransmitOutcome } from './governed-transmit';

/** Operator wording for a content change that landed during the send. */
export const CONTENT_CHANGED_DURING_TRANSMIT =
  'The package content changed while the transmission was in progress. The agency received the assembled bundle ' +
  'as recorded on this transmittal (its sha256); the package no longer matches it. Review the change and re-assemble ' +
  'before any further transmission.';

/**
 * What a caller must say beside a transmittal that genuinely left the platform
 * when something after the send did not hold: the package changed during the
 * send, the filed sequence could not be recorded, or the governed-action
 * ledger entry — the record that this transmission happened and who
 * authorised it — could not be written. The bytes are with the agency either
 * way, so none of these fails the transmit; each is reported, never folded
 * into a clean success.
 *
 * One construction for both callers (POST .../transmit in
 * routes/mdx-submission-gateway.ts and AnA's `k510_workflow.transmit`). Until
 * 2026-09-28 only the HTTP route built these; the AnA handler kept the ledger
 * failure in its own audit row and answered a plain success.
 */
export function transmitOutcomeNotices(
  outcome: Pick<GovernedTransmitOutcome, 'ledgerWriteFailed' | 'contentAfterTransmit' | 'filedSequenceRecorded' | 'filedSequenceReason'>,
): {
  filedSequenceWarning?: string;
  contentWarning?: string;
  ledgerWriteFailed?: true;
  ledgerWarning?: string;
} {
  return {
    ...(outcome.filedSequenceRecorded === false
      ? {
          filedSequenceWarning:
            'The transmission completed, but this sequence could not be added to the package filed history. ' +
            (outcome.filedSequenceReason === 'no-usable-manifest'
              // Said plainly, because the next assembly will otherwise refuse
              // with "file sequence 0000 first" — which the operator did.
              ? 'Its bundle descriptor carries no readable leaf inventory (it was assembled before the inventory was recorded, or the stored one is malformed), ' +
                'so there is nothing to add. Re-assemble the package before the next sequence so it has a baseline to diff against.'
              : 'Record it manually before assembling the next sequence, which derives each leaf operation from that history.'),
        }
      : {}),
    ...(outcome.contentAfterTransmit === 'drift' ? { contentWarning: CONTENT_CHANGED_DURING_TRANSMIT } : {}),
    ...(outcome.ledgerWriteFailed
      ? {
          ledgerWriteFailed: true as const,
          ledgerWarning:
            'The transmission completed, but its governed-action ledger entry could not be written. Record this transmittal manually and raise it with your administrator before relying on the audit trail.',
        }
      : {}),
  };
}
