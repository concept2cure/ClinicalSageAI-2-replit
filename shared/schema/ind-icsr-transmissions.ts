/**
 * IND ICSR transmissions — durable, per-submission safety-message records.
 *
 * Persists each E2B(R3) ICSR transmission to a safety gateway (FDA FAERS / EMA
 * EudraVigilance) and tracks it through its lifecycle: prepared → transmitting
 * → transmitted (or transmission_unconfirmed) → acknowledged/rejected. The composed message, transmit-readiness, and the
 * parsed acknowledgment (AA/AE/AR) are stored so an RA/PV team has an auditable
 * record of what was sent, when, and how the agency responded.
 *
 * Conventions mirror shared/schema/ind-safety-reports.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * A row moves to 'transmitted' ONLY on a real gateway receipt; the receipt id is
 * stored beside the timestamp so "transmitted" is never a bare status flag.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-icsr-transmissions'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_ind_icsr_transmissions.sql.
 *   3. Run migrations/20260902_ind_icsr_transmissions_transport_receipt.sql
 *      (transport_receipt_id; registered in scripts/db/migration-set.mjs).
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indIcsrTransmissions = pgTable(
  'ind_icsr_transmissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    /** The intake adverse-event id the ICSR concerns. */
    adverseEventId: text('adverse_event_id').notNull(),

    /** FDA_FAERS | EMA_EUDRAVIGILANCE. */
    gateway: text('gateway').notNull(),
    messageNumber: text('message_number').notNull(),
    senderId: text('sender_id').notNull(),
    receiverId: text('receiver_id').notNull(),

    /**
     * prepared | transmitting | transmitted | transmission_unconfirmed |
     * acknowledged | rejected.
     *
     * 'transmitting' (2026-09-23, W5/D7, MDN final pass, repair): claimed by
     * one transmit, with a conditional UPDATE from 'prepared', before a byte is
     * sent; a second transmit is refused. It returns to 'prepared' only when
     * the attempt cannot have reached the agency. A row left 'transmitting' (a
     * process that died mid-send, or a receipt that could not be recorded) is
     * locked; no release path exists yet.
     *
     * 'transmission_unconfirmed' (2026-09-23, W5/D7, MDN final pass): the
     * message was sent and the agency may hold it, but its receipt is not
     * proven (a 2xx not tied to this message, a 5xx, or a failure after the
     * whole message reached an authenticated gateway). The service refuses to
     * transmit it again and accepts the agency ACK from it. TEXT with no CHECK
     * constraint (migrations/20260615_ind_icsr_transmissions.sql), so neither
     * new value needs a migration.
     */
    status: text('status').notNull().default('prepared'),
    /** Whether the composed ICSR had no mandatory-element gaps at prepare time. */
    transmitReady: boolean('transmit_ready').notNull().default(false),

    transmittedAt: timestamp('transmitted_at', { withTimezone: true }),
    /**
     * Transport-layer receipt id the gateway returned. Written only from a real
     * (non-simulated) receipt, in the same update that sets status
     * 'transmitted'; null until then. Migration 20260902.
     * On a 'transmission_unconfirmed' row it holds the AS2 / transport message
     * id this platform SENT (there is no receipt) — what the agency files the
     * message under, for confirming it there (2026-09-23, MDN final pass).
     */
    transportReceiptId: text('transport_receipt_id'),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    /** ICH ICSR ack code AA/AE/AR (null until acknowledged). */
    ackCode: text('ack_code'),
    acknowledgedMessageNumber: text('acknowledged_message_number'),
    /** ACK error/comment text. */
    errors: jsonb('errors').notNull().default([]),

    /** Mandatory-element gaps at prepare time. */
    gaps: jsonb('gaps').notNull().default([]),
    /** The full transmittable ICH ICSR message XML. */
    message: text('message').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_icsr_transmissions_org_idx').on(t.organizationId),
    submissionIdx: index('ind_icsr_transmissions_submission_idx').on(t.submissionId),
  }),
);

export type IndIcsrTransmissionRow = InferSelectModel<typeof indIcsrTransmissions>;

export const insertIndIcsrTransmissionSchema = createInsertSchema(indIcsrTransmissions, {
  gateway: z.enum(['FDA_FAERS', 'EMA_EUDRAVIGILANCE']),
  messageNumber: z.string().min(1),
});
export type InsertIndIcsrTransmission = z.infer<typeof insertIndIcsrTransmissionSchema>;

export const IND_ICSR_TRANSMISSION_TABLES = ['ind_icsr_transmissions'] as const;
