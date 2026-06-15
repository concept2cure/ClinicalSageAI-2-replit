/**
 * IND ICSR transmission persistence service (ICH E2B(R3)).
 *
 * Durable, tenant-scoped, audited storage for E2B(R3) ICSR transmissions to a
 * safety gateway (FDA FAERS / EMA EudraVigilance), tracked through their
 * lifecycle: prepared → transmitted → acknowledged/rejected. Every read/write is
 * scoped to the caller's organizationId (never request input); mutations are
 * audited — mirroring server/services/ind-lifecycle/ind-safety-report-persistence.ts.
 *
 * Prepare composes the ICSR and builds the transmittable message; the byte-level
 * AS2 transport is an external adapter that calls markTransmitted() on success,
 * and recordAcknowledgment() when the agency ACK arrives.
 *
 * @module server/services/ind-lifecycle/ind-icsr-transmission-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indIcsrTransmissions, type IndIcsrTransmissionRow } from '../../../shared/schema/ind-icsr-transmissions';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { composeE2bR3Icsr } from './e2b-icsr-composer';
import { buildIcsrTransmission, parseIcsrAcknowledgment, type IcsrGateway } from './e2b-icsr-message';
import type { AdverseEvent, ICSR } from '../compliance/pharmacovigilanceService';

const logger = createScopedLogger('ind-icsr-transmission-persistence');

export type IcsrTxCtx = { organizationId: number; userId: number };

export class IcsrTransmissionError extends Error {
  constructor(public code: 'NOT_FOUND' | 'NOT_READY', message: string) {
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
 * Mark a prepared transmission as transmitted. Refuses (NOT_READY) when the
 * composed ICSR had mandatory-element gaps — a non-conformant message must not
 * be sent. Audited, org-scoped.
 */
export async function markIcsrTransmitted(id: string, ctx: IcsrTxCtx): Promise<IndIcsrTransmissionRow> {
  const current = await getIcsrTransmission(id, ctx);
  if (!current.transmitReady) {
    throw new IcsrTransmissionError('NOT_READY', 'ICSR is not transmit-ready (mandatory-element gaps); resolve gaps before transmitting.');
  }
  const [row] = await db
    .update(indIcsrTransmissions)
    .set({ status: 'transmitted', transmittedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(indIcsrTransmissions.id, id), eq(indIcsrTransmissions.organizationId, ctx.organizationId)))
    .returning();
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ICSR_TRANSMITTED',
    resourceType: 'ind_icsr_transmission',
    resourceId: id,
    details: { gateway: current.gateway },
  });
  return row as IndIcsrTransmissionRow;
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
  await getIcsrTransmission(id, ctx); // tenant-scoped existence check (404 otherwise)
  const ack = parseIcsrAcknowledgment(ackXml);
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
