/**
 * Which dispatch states mean the agency has a sequence (2026-10-19).
 *
 * `status = 'dispatched'` sets dispatch_status 'pending': queued for transmit,
 * not filed (submission-service.ts dispatch; prior-sequence-loader.ts says the
 * same). A transmit in flight is 'transmitting'; a receipt moves it to 'sent'
 * or 'rejected', and an acknowledgement to 'acknowledged'. Only 'sent' and
 * 'acknowledged' mean the agency received it.
 *
 * Only a PRODUCTION send files a sequence (F1, row D7, 2026-11-01). A send to
 * the agency's test environment ('staging'), and a receipt from it, leave the
 * sequence 'pending' whatever the test environment answered
 * (submission-service.ts toDispatchStatus, fda-esg-receipts.ts
 * resolveReceiptSequence), the package spine's rule reached onto the sequence
 * spine (governed-transmit.ts recordTransmittedSequence, sweep F14). So no
 * state below is ever set by a test send, and every reader of this list, an
 * allow-list, reads a test send as not filed with no change of its own.
 *
 * Here, in a module of its own, so a reader that only needs the rule does not
 * import the submission service's whole graph. submission-service.ts
 * (resendRefusal's neighbour, isFiled) and the commitment fulfilment evidence
 * (ha-interactions/commitment-fulfilment.ts) read it from here, the second as a
 * bound parameter. Older copies of the same list remain in
 * ectd/prior-sequence-loader.ts and routes/c2c/documents.ts (named as owed in
 * docs/evidence/D2-COMMITMENT-FULFILMENT/2026-10-19/README.md).
 *
 * @module server/services/submission-service/filed-dispatch
 */

export const FILED_DISPATCH_STATUSES = ['sent', 'acknowledged'] as const;
export type FiledDispatchStatus = (typeof FILED_DISPATCH_STATUSES)[number];

/** True when the agency received the sequence: dispatch status 'sent' or 'acknowledged'. */
export function isFiledDispatchStatus(status: unknown): status is FiledDispatchStatus {
  return typeof status === 'string' && (FILED_DISPATCH_STATUSES as readonly string[]).includes(status);
}
