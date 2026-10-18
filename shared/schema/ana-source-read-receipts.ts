/** Metadata only: exact source context admitted by the host budget, never provider delivery.
 * Mirrors migrations/20261014_ana_source_read_receipts.sql. No historical FK cascades. */
import { sql } from 'drizzle-orm';
import { char, index, integer, jsonb, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const anaSourceReadReceipts = pgTable('ana_source_read_receipts', {
  id: uuid('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  receiptVersion: smallint('receipt_version').notNull().$type<2>(),
  checkpoint: text('checkpoint').notNull().$type<'host_budget_admitted'>(),
  actorUserId: integer('actor_user_id').notNull(),
  admittedRole: text('admitted_role').notNull(),
  programId: uuid('program_id').notNull(),
  documentId: uuid('document_id').notNull(),
  originalSha256: char('original_sha256', { length: 64 }).notNull(),
  extractionSha256: char('extraction_sha256', { length: 64 }).notNull(),
  totalChars: integer('total_chars').notNull(),
  ranges: jsonb('ranges').notNull().$type<readonly { start: number; end: number; sha256: string }[]>(),
  payloadSha256: char('payload_sha256', { length: 64 }).notNull(),
  toolUseId: text('tool_use_id'),
  threadId: text('thread_id'),
  receiptSha256: char('receipt_sha256', { length: 64 }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, table => ({
  actorHistory: index('ana_source_read_receipts_actor_history_idx').on(table.organizationId, table.actorUserId,
    table.programId, table.acceptedAt, table.id),
}));

export type AnaSourceReadReceiptRow = typeof anaSourceReadReceipts.$inferSelect;
export type NewAnaSourceReadReceiptRow = typeof anaSourceReadReceipts.$inferInsert;
