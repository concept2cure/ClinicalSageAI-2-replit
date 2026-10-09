/**
 * IND ICSR transmission persistence service (ICH E2B(R3)).
 *
 * Durable, tenant-scoped, audited storage for E2B(R3) ICSR transmissions to a
 * safety gateway (FDA FAERS / EMA EudraVigilance), tracked through their
 * lifecycle: prepared → transmitting → transmitted (or
 * transmission_unconfirmed) → acknowledged/rejected. Every read/write is
 * scoped to the caller's organizationId (never request input); mutations are
 * audited — mirroring server/services/ind-lifecycle/ind-safety-report-persistence.ts.
 *
 * Prepare composes the ICSR and builds the transmittable message. Transmit
 * hands the PERSISTED message to the gateway transport (icsr-gateway-transport)
 * and records 'transmitted' only on a real, non-simulated receipt — never from
 * a bare state flip. recordAcknowledgment() runs when the agency ACK arrives.
 *
 * 2026-09-23 (W5/D7, MDN final pass): a transmit whose delivery is unconfirmed
 * (the transport's stage 'receipt-unproven': the agency may hold the report)
 * is recorded 'transmission_unconfirmed' and locked against a second send; it
 * used to leave the row 'prepared', so the next transmit sent the same safety
 * report to the agency again.
 *
 * 2026-09-23 (W5/D7, MDN final pass, repair): a transmit claims the row
 * (prepared → transmitting, one conditional UPDATE) before a byte is sent, so a
 * second transmit while the first awaits the agency is refused instead of
 * posting the same report again. Only an attempt that cannot have reached the
 * agency (nothing delivered, refused, not ready, not configured) returns the
 * row to 'prepared'.
 *
 * @module server/services/ind-lifecycle/ind-icsr-transmission-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indIcsrTransmissions, type IndIcsrTransmissionRow } from '../../../shared/schema/ind-icsr-transmissions';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import { composeE2bR3Icsr } from './e2b-icsr-composer';
import { buildIcsrTransmission, parseIcsrAcknowledgment, type IcsrGateway, type IcsrTransmissionResult } from './e2b-icsr-message';
import {
  transmitIcsr,
  IcsrNotReadyError,
  IcsrGatewayNotConfiguredError,
  IcsrGatewayTransmitError,
  type IcsrTransmitReceipt,
  type TransmitIcsrOptions,
} from './icsr-gateway-transport';
import type { AdverseEvent, ICSR } from '../compliance/pharmacovigilanceService';

const logger = createScopedLogger('ind-icsr-transmission-persistence');

export type IcsrTxCtx = { organizationId: number; userId: number };

/**
 * NOT_FOUND / NOT_READY are caller errors. GATEWAY_NOT_CONFIGURED and
 * GATEWAY_TRANSMIT_FAILED both mean the report was NOT transmitted and the row
 * is 'prepared' again — never rendered as success (if returning it to
 * 'prepared' fails, the message says it is held 'transmitting'
 * — 2026-09-23, repair). TRANSMISSION_UNCONFIRMED means
 * the agency may hold the report: the row is 'transmission_unconfirmed' and
 * refuses another transmit until the agency's acknowledgement is recorded
 * (2026-09-23, W5/D7, MDN final pass).
 */
export type IcsrTransmissionErrorCode =
  | 'NOT_FOUND'
  | 'NOT_READY'
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_TRANSMIT_FAILED'
  /** Delivery unconfirmed: the agency may hold the report; the row is locked. */
  | 'TRANSMISSION_UNCONFIRMED'
  /** The ACK carries no readable ICH code; nothing was recorded. */
  | 'ACK_UNREADABLE'
  /** The transmission is not in the state the operation requires. */
  | 'INVALID_STATE'
  /** The ACK names a different message number than this transmission's. */
  | 'ACK_MISMATCH';

export class IcsrTransmissionError extends Error {
  constructor(
    public code: IcsrTransmissionErrorCode,
    message: string,
    /** Structured detail for the caller (the readiness gaps; `transmitted: false`). */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'IcsrTransmissionError';
  }
}

/**
 * A transmission row handed back together with what happened to the 21 CFR
 * Part 11 §11.10(e) audit row this call wrote for it.
 *
 * WO-16C finding 133. The audit writes in this module were
 * `await auditService.logAction({…})` at statement position: awaited, and the
 * value it resolved to dropped. `logAction` does not reject when persistence
 * fails — deliberate policy, an audit-trail outage must not break the action it
 * records — it RESOLVES an `AuditWriteResult` and reports what happened in
 * `persisted`. Awaiting that and discarding it reports exactly as much as not
 * awaiting it, so the row returned here, and the JSON body the ICSR routes in
 * server/routes/ind-lifecycle/registers.routes.ts build by passing it straight
 * to `res.json`, were identical whether the §11.10(e) record for an FDA FAERS /
 * EMA EudraVigilance safety-report transmission existed or did not.
 *
 * `audit` carries that outcome now. Which action's row it is depends on which
 * function returned the shape:
 *   `prepareIcsrTransmission`  → IND_ICSR_TRANSMISSION_PREPARED
 *   `markIcsrTransmitted`      → IND_ICSR_TRANSMITTED
 *   `recordIcsrAcknowledgment` → IND_ICSR_ACKNOWLEDGED
 * (`transmitIcsrTransmission` also writes IND_ICSR_TRANSMISSION_UNCONFIRMED
 * when delivery is unconfirmed, reported in its error's details.)
 * (This used to say the action "is stated on each function that returns this
 * shape". A reviewer counted: two of the three said so, and `prepare` named its
 * action only in the argument. Listing them here is the version that stays true
 * if a docstring below drifts.)
 */
export type AuditedIcsrTransmission = IndIcsrTransmissionRow & { audit: AuditRowOutcome };

/**
 * A transmitted row plus, under its own key, what happened to the audit row(s)
 * for the transmit ATTEMPT — two different records, so two different keys and
 * never one name a reader could take for the other:
 *
 *   - `audit`                → the 'IND_ICSR_TRANSMITTED' row (from markIcsrTransmitted)
 *   - `transmitAttemptAudit` → the 'IND_ICSR_TRANSMIT_ATTEMPT' row(s) the
 *                              transport's audit sink asked for on this call
 *
 * The attempt row is the only durable record this module keeps of an attempt
 * that did not end in a recorded transmission: no column holds a refused one.
 * So it is reported on the refusal paths too, in `IcsrTransmissionError.details` —
 * and on the one failure path that is NOT an IcsrTransmissionError it is logged
 * with the reason, because there the message has already left for the agency and
 * the attempt row is all that says so.
 */
export type TransmittedIcsrTransmission = AuditedIcsrTransmission & {
  transmitAttemptAudit: AuditRowOutcome[];
};

export interface PrepareIcsrTransmissionInput {
  submissionId: number;
  event: AdverseEvent;
  icsr?: ICSR | null;
  gateway: IcsrGateway;
  senderId: string;
  messageNumber: string;
  receiverId?: string;
  now?: Date;
}

/** Compose + build the message and persist it as a 'prepared' transmission (audited). */
export async function prepareIcsrTransmission(
  input: PrepareIcsrTransmissionInput,
  ctx: IcsrTxCtx,
): Promise<AuditedIcsrTransmission> {
  // C.1.7 (fulfils local expedited criteria) comes from the event's own
  // classification; it was hardcoded to Yes here regardless of the event.
  const composed = composeE2bR3Icsr(input.event, { icsr: input.icsr ?? null, now: input.now });
  const transmission = buildIcsrTransmission(composed, {
    gateway: input.gateway,
    senderId: input.senderId,
    receiverId: input.receiverId,
    messageNumber: input.messageNumber,
    messageDate: input.now,
  });

  const [row] = await db
    .insert(indIcsrTransmissions)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      adverseEventId: input.event.id,
      gateway: input.gateway,
      messageNumber: input.messageNumber,
      senderId: input.senderId,
      receiverId: transmission.receiverId,
      status: 'prepared',
      transmitReady: transmission.transmitReady,
      gaps: transmission.gaps as unknown as Record<string, unknown>[],
      message: transmission.message,
      createdBy: ctx.userId,
    })
    .returning();

  // WO-16C #133: reported, not discarded. The INSERT above has committed and the
  // transmission is retrievable through listIcsrTransmissions/getIcsrTransmission,
  // so a lost audit row here is a lost log beside a real record rather than a lost
  // record — the preparation stands and the caller is told. recordAuditRow has
  // already logged the store's own reason against this action and resource id;
  // that text is deliberately not in the returned value.
  const audit = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMISSION_PREPARED',
    resourceType: 'ind_icsr_transmission',
    resourceId: row.id,
    details: { submissionId: input.submissionId, gateway: input.gateway, transmitReady: transmission.transmitReady },
  });
  logger.info('Prepared ICSR transmission', { submissionId: input.submissionId, gateway: input.gateway, transmitReady: transmission.transmitReady, organizationId: ctx.organizationId });
  return { ...(row as IndIcsrTransmissionRow), audit };
}

/** List a submission's ICSR transmissions (org-scoped, stable order). */
export async function listIcsrTransmissions(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<IndIcsrTransmissionRow[]> {
  return (await db
    .select()
    .from(indIcsrTransmissions)
    .where(and(eq(indIcsrTransmissions.organizationId, ctx.organizationId), eq(indIcsrTransmissions.submissionId, submissionId)))
    .orderBy(asc(indIcsrTransmissions.createdAt))) as IndIcsrTransmissionRow[];
}

/** Fetch one ICSR transmission (org-scoped). */
export async function getIcsrTransmission(id: string, ctx: { organizationId: number }): Promise<IndIcsrTransmissionRow> {
  const [row] = await db
    .select()
    .from(indIcsrTransmissions)
    .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)));
  if (!row) throw new IcsrTransmissionError('NOT_FOUND', 'ICSR transmission not found.');
  return row as IndIcsrTransmissionRow;
}

/**
 * Record a claimed transmission as transmitted — ONLY on the strength of a
 * real, non-simulated gateway receipt. A simulated (non-production) receipt, or
 * any receipt whose transport status is not 'transmitted', is refused: nothing
 * reached the agency, and transmitIcsrTransmission returns the row to
 * 'prepared'. Refuses (NOT_READY) when the composed ICSR had mandatory-element
 * gaps. Audited, org-scoped. Its only caller is transmitIcsrTransmission, which
 * holds the row 'transmitting' (2026-09-23, repair).
 */
export async function markIcsrTransmitted(
  id: string,
  ctx: IcsrTxCtx,
  receipt: IcsrTransmitReceipt,
): Promise<AuditedIcsrTransmission> {
  const current = await getIcsrTransmission(id, ctx);
  if (!current.transmitReady) {
    throw new IcsrTransmissionError(
      'NOT_READY',
      'ICSR is not transmit-ready (mandatory-element gaps); resolve gaps before transmitting.',
      { gaps: current.gaps },
    );
  }
  if (receipt.simulated || receipt.status !== 'transmitted') {
    throw new IcsrTransmissionError(
      'GATEWAY_NOT_CONFIGURED',
      `ICSR gateway transport is not configured: the transport returned a ${receipt.status} receipt ` +
        `(${receipt.receiptId}), not an agency acknowledgement. The report was NOT transmitted to ` +
        `${current.gateway}.`,
      { transmitted: false },
    );
  }
  const transmittedAt = new Date(receipt.timestamp);
  if (Number.isNaN(transmittedAt.getTime())) {
    throw new IcsrTransmissionError(
      'GATEWAY_TRANSMIT_FAILED',
      `Gateway receipt ${receipt.receiptId} carried no valid timestamp; the transmission was NOT recorded as transmitted.`,
      { transmitted: false },
    );
  }
  const [row] = await db
    .update(indIcsrTransmissions)
    .set({ status: 'transmitted', transmittedAt, transportReceiptId: receipt.receiptId, updatedAt: new Date() })
    .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)))
    .returning();
  // WO-16C #133. The UPDATE above has committed: the row says 'transmitted' and
  // carries the gateway's own receipt id. An ICSR is a safety report that has
  // actually reached the agency, so the transmission is never un-recorded because
  // its audit row failed — that would deny a send that happened. The record
  // stands and the caller is told what became of the 'IND_ICSR_TRANSMITTED' row.
  const audit = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMITTED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { gateway: current.gateway, receiverId: receipt.receiverId, receiptId: receipt.receiptId, transmittedAt: receipt.timestamp },
  });
  logger.info('Recorded ICSR transmission receipt', { id, gateway: current.gateway, receiptId: receipt.receiptId, organizationId: ctx.organizationId });
  return { ...(row as IndIcsrTransmissionRow), audit };
}

/**
 * Transmit a prepared ICSR to its agency gateway and, only on a real gateway
 * receipt, record it as transmitted. The transport input is rebuilt from the
 * PERSISTED row (message, gateway, receiver, readiness, gaps) — never from
 * request input — so what is sent is exactly what was prepared and audited.
 *
 * The row is claimed first — `UPDATE … SET status = 'transmitting' WHERE … AND
 * status = 'prepared'` — so exactly one transmit sends it; a transmit that
 * loses the claim, or finds the row 'transmitting', is refused INVALID_STATE
 * and sends nothing (2026-09-23, W5/D7, MDN final pass, repair).
 *
 * Fail-closed outcomes returning the row to 'prepared' (nothing reached the
 * agency, or it refused):
 *   - NOT_READY: the transport refuses a message with mandatory gaps (returned).
 *   - GATEWAY_NOT_CONFIGURED: no gateway — production throws; non-production
 *     hands back a simulated receipt, which markIcsrTransmitted refuses.
 *   - GATEWAY_TRANSMIT_FAILED: nothing was delivered (stage 'transport') or the
 *     agency refused it (stage 'gateway-rejected').
 * And one that locks the row:
 *   - TRANSMISSION_UNCONFIRMED: the transport's stage 'receipt-unproven' — the
 *     agency may hold the report. The row becomes 'transmission_unconfirmed'
 *     (recordTransmissionUnconfirmed) and this function refuses to send it again.
 * Any other failure after the claim (a receipt that cannot be recorded, an
 * unexpected error) leaves the row 'transmitting': locked, never re-sent.
 * Every attempt (success or refusal) is audited via the transport's audit sink.
 */
export async function transmitIcsrTransmission(
  id: string,
  ctx: IcsrTxCtx,
  opts: Pick<TransmitIcsrOptions, 'now' | 'config'> = {},
): Promise<TransmittedIcsrTransmission> {
  const current = await getIcsrTransmission(id, ctx);
  assertTransmittable(id, current);
  await claimForTransmit(id, ctx, current);

  const built: IcsrTransmissionResult = {
    message: current.message,
    transmitReady: current.transmitReady,
    gaps: (current.gaps ?? []) as IcsrTransmissionResult['gaps'],
    gateway: current.gateway as IcsrGateway,
    receiverId: current.receiverId,
  };

  // WO-16C #133. The transport calls this sink for every attempt, success or
  // refusal, and the row it asks for is the only durable record of an attempt
  // that ends in a refusal — no column holds one. So each outcome is collected
  // and carried out of this function: in `transmitAttemptAudit` when the
  // transmission is recorded, and in the refusal's `details` on every path
  // below. The sink cannot fail the attempt — recordAuditRow does not throw —
  // and a lost log row is no reason to deny that the message was handed to the
  // gateway.
  const transmitAttemptAudit: AuditRowOutcome[] = [];
  let receipt: IcsrTransmitReceipt;
  try {
    receipt = await transmitIcsr(built, {
      ...opts,
      audit: async (event) => {
        transmitAttemptAudit.push(
          await recordAuditRow({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            action: 'IND_ICSR_TRANSMIT_ATTEMPT',
            resourceType: 'ind_icsr_transmission',
            resourceId: id,
            details: { ...event },
          }),
        );
      },
    });
  } catch (err) {
    throw await transmitFailure({ id, ctx, current, transmitAttemptAudit }, err);
  }

  try {
    return { ...(await markIcsrTransmitted(id, ctx, receipt)), transmitAttemptAudit };
  } catch (err) {
    throw await receiptNotRecorded({ id, ctx, current, transmitAttemptAudit }, receipt, err);
  }
}

/**
 * Refuse a transmit unless the row is 'prepared'. A second call on a
 * transmitted, acknowledged or rejected row used to send the same message
 * number to the agency again and overwrite the receipt, as governed-transmit's
 * ACTIVE_TRANSMITTAL refusal exists to prevent on the eCTD side.
 */
function assertTransmittable(id: string, current: IndIcsrTransmissionRow): void {
  if (current.status === 'transmission_unconfirmed') {
    // 2026-09-23 (W5/D7, MDN final pass): the agency may already hold this
    // report; a second send would file it twice.
    throw new IcsrTransmissionError(
      'INVALID_STATE',
      `ICSR transmission ${id} was sent to ${current.gateway} but delivery is unconfirmed ` +
        `(transport message ${current.transportReceiptId ?? 'unknown'}); it is not sent again. Confirm at the agency: ` +
        'if the agency has it, record its acknowledgement against this transmission; if it does not, release it ' +
        'before transmitting again.',
      { status: current.status, transportMessageId: current.transportReceiptId },
    );
  }
  if (current.status === 'transmitting') throw transmitInProgress(id, current);
  if (current.status !== 'prepared') {
    throw new IcsrTransmissionError(
      'INVALID_STATE',
      `ICSR transmission ${id} is '${current.status}'; only a prepared transmission is sent. Prepare a follow-up or nullification as a new transmission.`,
      { status: current.status },
    );
  }
}

/**
 * Claim the row (prepared → transmitting) before a byte is sent. The status
 * check in assertTransmittable is a read; two transmits could both pass it and
 * both post the report. Only one conditional UPDATE can match; the other is
 * refused INVALID_STATE. A failed UPDATE throws, and nothing is sent.
 * 2026-09-23 (W5/D7, MDN final pass, repair): new.
 */
async function claimForTransmit(id: string, ctx: IcsrTxCtx, current: IndIcsrTransmissionRow): Promise<void> {
  const [claimed] = await db
    .update(indIcsrTransmissions)
    .set({ status: 'transmitting', updatedAt: new Date() })
    .where(and(
      eq(indIcsrTransmissions.id, id),
      eq(indIcsrTransmissions.organizationId, ctx.organizationId),
      eq(indIcsrTransmissions.status, 'prepared'),
    ))
    .returning();
  if (!claimed) throw transmitInProgress(id, current);
}

/** A transmit attempt on a claimed ('transmitting') row. */
interface ClaimedAttempt {
  id: string;
  ctx: IcsrTxCtx;
  current: IndIcsrTransmissionRow;
  transmitAttemptAudit: AuditRowOutcome[];
}

/**
 * The error transmitIcsrTransmission throws when the transport threw. A
 * 'receipt-unproven' outcome locks the row (recordTransmissionUnconfirmed).
 * Every other transport error is thrown before a byte could reach the agency
 * (not ready, not configured, a credential file unreadable) or classed
 * NOT_DELIVERED / REFUSED_BY_AGENCY by the shared classifier: the agency cannot
 * hold the report, so the claim is released (2026-09-23, repair).
 */
async function transmitFailure(attempt: ClaimedAttempt, err: unknown): Promise<IcsrTransmissionError> {
  const { id, ctx, current, transmitAttemptAudit } = attempt;
  if (err instanceof IcsrGatewayTransmitError && err.stage === 'receipt-unproven') {
    return recordTransmissionUnconfirmed(id, ctx, current, err, transmitAttemptAudit);
  }
  const released = await releaseClaim(id, ctx);
  if (err instanceof IcsrNotReadyError) {
    return new IcsrTransmissionError('NOT_READY', `${err.message}${released.note}`, { gaps: err.gaps, transmitAttemptAudit, status: released.status });
  }
  if (err instanceof IcsrGatewayNotConfiguredError) {
    return new IcsrTransmissionError('GATEWAY_NOT_CONFIGURED', `${err.message}${released.note}`, { transmitted: false, transmitAttemptAudit, status: released.status });
  }
  const reason = err instanceof Error ? err.message : String(err);
  logger.error('ICSR gateway transmit failed', { id, gateway: current.gateway, organizationId: ctx.organizationId, reason, status: released.status });
  const state = released.status === 'prepared'
    ? "the transmission remains 'prepared'"
    : `the transmission is held 'transmitting'${released.note}`;
  return new IcsrTransmissionError(
    'GATEWAY_TRANSMIT_FAILED',
    `ICSR was NOT transmitted to ${current.gateway}; ${state}. Gateway transport failed: ${reason}`,
    { transmitted: false, transmitAttemptAudit, status: released.status },
  );
}

/**
 * What transmitIcsrTransmission throws when markIcsrTransmitted refused or
 * failed. Its refusal's code and sentence are kept exactly as it framed them;
 * only what happened to the attempt row is added, which the caller would
 * otherwise lose (WO-16C #133).
 * 2026-09-23 (W5/D7, MDN final pass, repair): a simulated / statusless receipt
 * reached no agency, so the claim is released. A REAL receipt that could not be
 * recorded (no valid timestamp, a failed UPDATE) leaves the row 'transmitting':
 * the agency has the report, and the row must not be sent again.
 */
async function receiptNotRecorded(attempt: ClaimedAttempt, receipt: IcsrTransmitReceipt, err: unknown): Promise<unknown> {
  const { id, ctx, current, transmitAttemptAudit } = attempt;
  const simulated = receipt.simulated || receipt.status !== 'transmitted';
  const released = simulated ? await releaseClaim(id, ctx) : { status: 'transmitting' as const, note: '' };
  if (err instanceof IcsrTransmissionError) {
    const held = !simulated
      ? ` The agency accepted it (receipt ${receipt.receiptId}); the row is held 'transmitting' and will not be sent again.`
      : released.status === 'prepared' ? " The transmission remains 'prepared'." : released.note;
    return new IcsrTransmissionError(err.code, `${err.message}${held}`, { ...err.details, transmitAttemptAudit, status: released.status });
  }
  logger.error('ICSR receipt could not be recorded; row held transmitting', {
    id, gateway: current.gateway, organizationId: ctx.organizationId, receiptId: receipt.receiptId, simulated,
    reason: err instanceof Error ? err.message : String(err),
  });
  return err;
}

/** INVALID_STATE for a row another transmit holds (or held when it was interrupted). */
function transmitInProgress(id: string, current: IndIcsrTransmissionRow): IcsrTransmissionError {
  return new IcsrTransmissionError(
    'INVALID_STATE',
    `ICSR transmission ${id} is already being transmitted to ${current.gateway} (a transmit is in progress, or was ` +
      'interrupted); it is not sent again. If no transmit is running, confirm at the agency whether it has the ' +
      'report before it is released.',
    { status: 'transmitting' },
  );
}

/**
 * Return a claimed row ('transmitting') to 'prepared' after an attempt that
 * cannot have reached the agency. If the UPDATE fails the row stays
 * 'transmitting' — locked, the safe side — and `note` says so for the caller.
 * 2026-09-23 (W5/D7, MDN final pass, repair): new.
 */
async function releaseClaim(id: string, ctx: IcsrTxCtx): Promise<{ status: 'prepared' | 'transmitting'; note: string }> {
  try {
    await db
      .update(indIcsrTransmissions)
      .set({ status: 'prepared', updatedAt: new Date() })
      .where(and(
        eq(indIcsrTransmissions.id, id),
        eq(indIcsrTransmissions.organizationId, ctx.organizationId),
        eq(indIcsrTransmissions.status, 'transmitting'),
      ))
      .returning();
    return { status: 'prepared', note: '' };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('ICSR claim could not be released; row held transmitting', { id, organizationId: ctx.organizationId, reason });
    return {
      status: 'transmitting',
      note: ` Returning it to 'prepared' failed (${reason}); it stays 'transmitting' and will not be sent until released.`,
    };
  }
}

/**
 * Record a transmit whose delivery is unconfirmed — the transport's stage
 * 'receipt-unproven': a 2xx not tied to this message, a 5xx, or a failure
 * after the message was released to an authenticated gateway — and return the
 * error transmitIcsrTransmission throws.
 *
 * The row becomes 'transmission_unconfirmed' (a status only this function
 * writes; the column is TEXT with no CHECK) with the AS2 / transport message id
 * this platform sent in transport_receipt_id — what the agency files it under
 * — and one `errors` entry holding the agency's response verbatim, the HTTP
 * status and the reason. It is audited IND_ICSR_TRANSMISSION_UNCONFIRMED. The
 * error is never framed as "NOT transmitted" or `transmitted: false`: the
 * agency may hold the report.
 *
 * transmitIcsrTransmission refuses to send from this status;
 * recordIcsrAcknowledgment accepts the agency ACK from it (the ACK proves
 * receipt). No operator release path exists yet (residual): the row stays
 * locked, which is the safe side.
 *
 * If the UPDATE fails, the row stays 'transmitting' (claimed before the send),
 * which is locked too; the error says so, and the attempt row
 * (transmitAttemptAudit) and the audit row below still record that the agency
 * may hold the report. (2026-09-23, repair: before the claim it stayed
 * 'prepared' and could be sent again.)
 *
 * 2026-09-23 (W5/D7, MDN final pass): new. A 'receipt-unproven' outcome was
 * reported "ICSR was NOT transmitted … the transmission remains 'prepared'",
 * and the next transmit sent the same report again.
 */
async function recordTransmissionUnconfirmed(
  id: string,
  ctx: IcsrTxCtx,
  current: IndIcsrTransmissionRow,
  err: IcsrGatewayTransmitError,
  transmitAttemptAudit: AuditRowOutcome[],
): Promise<IcsrTransmissionError> {
  const entry = {
    kind: 'transmission_unconfirmed',
    stage: err.stage,
    reason: err.message,
    httpStatus: err.httpStatus,
    agencyResponseRaw: err.agencyResponseRaw,
    transportMessageId: err.transportMessageId,
    recordedAt: new Date().toISOString(),
  };
  let recordFailure: string | null = null;
  try {
    await db
      .update(indIcsrTransmissions)
      .set({
        status: 'transmission_unconfirmed',
        transportReceiptId: err.transportMessageId,
        errors: [entry] as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      })
      .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)))
      .returning();
  } catch (writeErr: unknown) {
    recordFailure = writeErr instanceof Error ? writeErr.message : String(writeErr);
  }
  const audit = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMISSION_UNCONFIRMED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { gateway: current.gateway, ...entry, statusRecorded: recordFailure === null, recordFailure },
  });
  logger.warn('ICSR delivery unconfirmed', {
    id, gateway: current.gateway, organizationId: ctx.organizationId,
    transportMessageId: err.transportMessageId, httpStatus: err.httpStatus, recordFailure,
  });
  const lock = recordFailure === null
    ? `Transmission ${id} is recorded 'transmission_unconfirmed' and will not be sent again.`
    : `Recording that failed (${recordFailure}); the row stays 'transmitting' and will not be sent again.`;
  return new IcsrTransmissionError(
    'TRANSMISSION_UNCONFIRMED',
    `${err.message} ${lock} Confirm at the agency: if it has the report, record its acknowledgement against ` +
      'this transmission; if it does not, release the transmission before sending again.',
    {
      deliveryUnconfirmed: true,
      status: recordFailure === null ? 'transmission_unconfirmed' : 'transmitting',
      transportMessageId: err.transportMessageId,
      httpStatus: err.httpStatus,
      audit,
      transmitAttemptAudit,
    },
  );
}

/**
 * Record an agency acknowledgment (ACK) against a transmission: parse it and set
 * the status to 'acknowledged' (AA/AE) or 'rejected' (AR), storing the ack code
 * and any errors. Accepted from 'transmitted' and 'transmission_unconfirmed'.
 * Audited, org-scoped.
 */
export async function recordIcsrAcknowledgment(
  id: string,
  ackXml: string,
  ctx: IcsrTxCtx,
): Promise<AuditedIcsrTransmission> {
  const current = await getIcsrTransmission(id, ctx); // tenant-scoped existence check (404 otherwise)
  const ack = parseIcsrAcknowledgment(ackXml);

  // Three things this recorded as an acknowledgement that are not one. An ACK
  // with no readable code parsed to 'unknown' and mapped to 'acknowledged'. An
  // ACK for a report that was never transmitted — status still 'prepared' —
  // was accepted. And the acknowledged message number was stored but never
  // compared with this transmission's own, so any agency ACK could close any
  // report. Each was an IND_ICSR_ACKNOWLEDGED audit row and an acknowledgedAt
  // from the platform clock over an agency act that did not happen.
  if (ack.ackCode === 'unknown') {
    throw new IcsrTransmissionError(
      'ACK_UNREADABLE',
      'The acknowledgement carries no readable ICH ACK code (AA/AE/AR); nothing was recorded.',
    );
  }
  // 2026-09-23 (W5/D7, MDN final pass): 'transmission_unconfirmed' is
  // accepted too — the agency's own ACK for this message number is the proof
  // of receipt the transport could not give.
  if (current.status !== 'transmitted' && current.status !== 'transmission_unconfirmed') {
    throw new IcsrTransmissionError(
      'INVALID_STATE',
      `An acknowledgement can only be recorded against a transmitted report, or one whose delivery is ` +
        `unconfirmed (current: ${current.status}).`,
    );
  }
  if (ack.acknowledgedMessageNumber && ack.acknowledgedMessageNumber !== current.messageNumber) {
    throw new IcsrTransmissionError(
      'ACK_MISMATCH',
      `The acknowledgement names message ${ack.acknowledgedMessageNumber}; this transmission is ${current.messageNumber}.`,
    );
  }
  const status = ack.ackCode === 'AR' ? 'rejected' : 'acknowledged';

  const [row] = await db
    .update(indIcsrTransmissions)
    .set({
      status,
      ackCode: ack.ackCode,
      acknowledgedMessageNumber: ack.acknowledgedMessageNumber,
      errors: ack.errors as unknown as Record<string, unknown>[],
      acknowledgedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)))
    .returning();

  // WO-16C #133. The UPDATE above has committed the agency's own act — an
  // acceptance, or an AR rejection of a safety report — with its ACK code and
  // the time it was recorded. That is not undone because the audit row failed;
  // the caller is told instead what became of the 'IND_ICSR_ACKNOWLEDGED' row.
  const audit = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_ACKNOWLEDGED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { ackCode: ack.ackCode, status, previousStatus: current.status },
  });
  return { ...(row as IndIcsrTransmissionRow), audit };
}
