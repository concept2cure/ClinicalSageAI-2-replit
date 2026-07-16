/**
 * Change assessment (Capability: Device/Dx lifecycle)
 *
 * Org-scoped store of design/labeling/manufacturing change determinations that
 * back the `change-assessment` surface. Each row runs the FDA "When to Submit a
 * 510(k) for a Change" (2017) and EU MDR significant-change (MDCG 2020-3)
 * decision trees; the per-jurisdiction decision (steps + outcome + rationale)
 * and the generated document are stored as JSONB so the row matches the
 * surface's display contract 1:1 (id/title/device/area/raised/owner/fda/eu/doc).
 *
 * @module shared/schema/change-assessment
 */
import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

// Org-scoped by convention (FK-free, matching the c2c_* lifecycle tables) so the
// migration stays non-destructive and portable across the tenant DBs.
export const changeAssessments = pgTable(
  'change_assessments',
  {
    /** Human change id (e.g. 'CH-118') — unique per org, used as the display id. */
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    title: text('title').notNull(),
    device: text('device'),
    area: text('area'),
    raised: text('raised'),
    owner: text('owner'),
    /** FDA 21 CFR 807 / 2017-guidance determination: { steps, outcome, label, rationale }. */
    fda: jsonb('fda'),
    /** EU MDR / MDCG 2020-3 determination: { steps, outcome, label, rationale }. */
    eu: jsonb('eu'),
    /** Generated artifact: { kind, status }. */
    doc: jsonb('doc'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);

export type ChangeAssessmentRow = typeof changeAssessments.$inferSelect;
