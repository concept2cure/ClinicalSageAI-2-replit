/**
 * IND ICSR transmission persistence service (ICH E2B(R3)).
 *
 * Durable, tenant-scoped, audited storage for E2B(R3) ICSR transmissions to a
 * safety gateway (FDA FAERS / EMA EudraVigilance), tracked through their
 * lifecycle: prepared → transmitted → acknowledged/rejected. Every read/write is
 * scoped to the caller's organizationId (never request input); mutations are
 * audited — mirroring server/services/ind-lifecycle/ind-safety-report-persistence.ts.
 *
 * Prepare composes the ICSR and builds the transmittable message. Transmit
 * hands the PERSISTED message to the gateway transport (icsr-gateway-transport)
 * and records 'transmitted' only on a real, non-simulated receipt — never from
 * a bare state flip. recordAcknowledgment() runs when the agency ACK arrives.
 *
 * @module server/services/ind-lifecycle/ind-icsr-transmission-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indIcsrTransmissions, type IndIcsrTransmissionRow } from '../../../shared/schema/ind-icsr-transmissions';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { composeE2bR3Icsr } from './e2b-icsr-composer';
import { buildIcsrTransmission, parseIcsrAcknowledgment, type IcsrGateway, type IcsrTransmissionResult } from './e2b-icsr-message';
import {
  transmitIcsr,
  IcsrNotReadyError,
  IcsrGatewayNotConfiguredError,
  type IcsrTransmitReceipt,
  type TransmitIcsrOptions,
} from './icsr-gateway-transport';
import type { AdverseEvent, ICSR } from '../compliance/pharmacovigilanceService';

const logger = createScopedLogger('ind-icsr-transmission-persistence');

export type IcsrTxCtx = { organizationId: number; userId: number };

/**
 * NOT_FOUND / NOT_READY are caller errors. GATEWAY_NOT_CONFIGURED and
 * GATEWAY_TRANSMIT_FAILED both mean the report was NOT transmitted and the row
 * stays 'prepared' — never rendered as success.
 */
export type IcsrTransmissionErrorCode =
  | 'NOT_FOUND'
  | 'NOT_READY'
  | 'GATEWAY_NOT_CONFIGURED'
  | 'GATEWAY_TRANSMIT_FAILED'
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
): Promise<IndIcsrTransmissionRow> {
  const composed = composeE2bR3Icsr(input.event, { icsr: input.icsr ?? null, expedited: true, now: input.now });
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

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMISSION_PREPARED',
    resourceType: 'ind_icsr_transmission',
    resourceId: row.id,
    details: { submissionId: input.submissionId, gateway: input.gateway, transmitReady: transmission.transmitReady },
  });
  logger.info('Prepared ICSR transmission', { submissionId: input.submissionId, gateway: input.gateway, transmitReady: transmission.transmitReady, organizationId: ctx.organizationId });
  return row as IndIcsrTransmissionRow;
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
 * Record a prepared transmission as transmitted — ONLY on the strength of a
 * real, non-simulated gateway receipt. A simulated (non-production) receipt, or
 * any receipt whose transport status is not 'transmitted', is refused and the
 * row stays 'prepared': nothing reached the agency. Refuses (NOT_READY) when
 * the composed ICSR had mandatory-element gaps. Audited, org-scoped.
 */
export async function markIcsrTransmitted(
  id: string,
  ctx: IcsrTxCtx,
  receipt: IcsrTransmitReceipt,
): Promise<IndIcsrTransmissionRow> {
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
        `${current.gateway}; the transmission remains 'prepared'.`,
      { transmitted: false },
    );
  }
  const transmittedAt = new Date(receipt.timestamp);
  if (Number.isNaN(transmittedAt.getTime())) {
    throw new IcsrTransmissionError(
      'GATEWAY_TRANSMIT_FAILED',
      `Gateway receipt ${receipt.receiptId} carried no valid timestamp; the transmission was NOT recorded and remains 'prepared'.`,
      { transmitted: false },
    );
  }
  const [row] = await db
    .update(indIcsrTransmissions)
    .set({ status: 'transmitted', transmittedAt, transportReceiptId: receipt.receiptId, updatedAt: new Date() })
    .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)))
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMITTED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { gateway: current.gateway, receiverId: receipt.receiverId, receiptId: receipt.receiptId, transmittedAt: receipt.timestamp },
  });
  logger.info('Recorded ICSR transmission receipt', { id, gateway: current.gateway, receiptId: receipt.receiptId, organizationId: ctx.organizationId });
  return row as IndIcsrTransmissionRow;
}

/**
 * Transmit a prepared ICSR to its agency gateway and, only on a real gateway
 * receipt, record it as transmitted. The transport input is rebuilt from the
 * PERSISTED row (message, gateway, receiver, readiness, gaps) — never from
 * request input — so what is sent is exactly what was prepared and audited.
 *
 * Fail-closed outcomes, every one leaving the row 'prepared':
 *   - NOT_READY: the transport refuses a message with mandatory gaps (returned).
 *   - GATEWAY_NOT_CONFIGURED: no gateway — production throws; non-production
 *     hands back a simulated receipt, which markIcsrTransmitted refuses.
 *   - GATEWAY_TRANSMIT_FAILED: a configured gateway failed or rejected the send.
 * Every attempt (success or refusal) is audited via the transport's audit sink.
 */
export async function transmitIcsrTransmission(
  id: string,
  ctx: IcsrTxCtx,
  opts: Pick<TransmitIcsrOptions, 'now' | 'config'> = {},
): Promise<IndIcsrTransmissionRow> {
  const current = await getIcsrTransmission(id, ctx);
  const built: IcsrTransmissionResult = {
    message: current.message,
    transmitReady: current.transmitReady,
    gaps: (current.gaps ?? []) as IcsrTransmissionResult['gaps'],
    gateway: current.gateway as IcsrGateway,
    receiverId: current.receiverId,
  };

  let receipt: IcsrTransmitReceipt;
  try {
    receipt = await transmitIcsr(built, {
      ...opts,
      audit: async (event) => {
        await auditService.logAction({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'IND_ICSR_TRANSMIT_ATTEMPT',
          resourceType: 'ind_icsr_transmission',
          resourceId: id,
          details: { ...event },
        });
      },
    });
  } catch (err) {
    if (err instanceof IcsrNotReadyError) {
      throw new IcsrTransmissionError('NOT_READY', err.message, { gaps: err.gaps });
    }
    if (err instanceof IcsrGatewayNotConfiguredError) {
      throw new IcsrTransmissionError('GATEWAY_NOT_CONFIGURED', err.message, { transmitted: false });
    }
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('ICSR gateway transmit failed', { id, gateway: current.gateway, organizationId: ctx.organizationId, reason });
    throw new IcsrTransmissionError(
      'GATEWAY_TRANSMIT_FAILED',
      `ICSR was NOT transmitted to ${current.gateway}; the transmission remains 'prepared'. Gateway transport failed: ${reason}`,
      { transmitted: false },
    );
  }

  return markIcsrTransmitted(id, ctx, receipt);
}

/**
 * Record an agency acknowledgment (ACK) against a transmission: parse it and set
 * the status to 'acknowledged' (AA/AE) or 'rejected' (AR), storing the ack code
 * and any errors. Audited, org-scoped.
 */
export async function recordIcsrAcknowledgment(
  id: string,
  ackXml: string,
  ctx: IcsrTxCtx,
): Promise<IndIcsrTransmissionRow> {
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
  if (current.status !== 'transmitted') {
    throw new IcsrTransmissionError(
      'INVALID_STATE',
      `An acknowledgement can only be recorded against a transmitted report (current: ${current.status}).`,
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

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_ACKNOWLEDGED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { ackCode: ack.ackCode, status },
  });
  return row as IndIcsrTransmissionRow;
}
