/**
 * IND dispatch-readiness snapshots.
 *
 * A point-in-time record of a sequence's dispatch-gate verdict, so a program's
 * go/no-go history is auditable over time (who checked, when, and what the
 * verdict + blockers were). Append-only by convention.
 *
 * Conventions mirror shared/schema/ind-master-data.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-dispatch-snapshots'` to shared/schema/index.ts.
 *   2. Run migrations/20260610_ind_dispatch_snapshots.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indDispatchSnapshots = pgTable(
  'ind_dispatch_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    sequenceId: integer('sequence_id').notNull(),
    sequenceNumber: text('sequence_number').notNull(),

    // The verdict captured at this point in time.
    canDispatch: boolean('can_dispatch').notNull(),
    blockerCount: integer('blocker_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    /** Blocker codes (e.g. ['MISSING_CHECKSUMS']) for quick filtering. */
    blockerCodes: jsonb('blocker_codes').notNull().default([]),
    /** Full verdict { canDispatch, blockers, warnings, summary }. */
    verdict: jsonb('verdict').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_dispatch_snapshots_org_idx').on(t.organizationId),
    seqIdx: index('ind_dispatch_snapshots_seq_idx').on(t.sequenceId),
  }),
);

export type IndDispatchSnapshot = InferSelectModel<typeof indDispatchSnapshots>;

export const insertIndDispatchSnapshotSchema = createInsertSchema(indDispatchSnapshots, {
  sequenceNumber: z.string().min(1),
});
export type InsertIndDispatchSnapshot = z.infer<typeof insertIndDispatchSnapshotSchema>;

export const IND_DISPATCH_SNAPSHOT_TABLES = ['ind_dispatch_snapshots'] as const;
