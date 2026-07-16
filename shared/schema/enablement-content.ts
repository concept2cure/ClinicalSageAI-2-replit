/**
 * Enablement / training content stores (learning paths + certifications)
 *
 * Org-scoped stores backing the training surface (GET /api/enablement/paths,
 * /api/enablement/certifications). Columns match the surface's display contract;
 * org-scoped and FK-free per the c2c_* convention.
 *
 * @module shared/schema/enablement-content
 */
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

// Learning paths. Display shape:
// { id, title, lessons, done, mins, level, tone }
export const enablementLearningPaths = pgTable(
  'enablement_learning_paths',
  {
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    title: text('title'),
    lessons: integer('lessons').default(0),
    done: integer('done').default(0),
    mins: integer('mins').default(0),
    level: text('level'),
    tone: text('tone'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);

// Certifications. Display shape: { name, status, when }
// (`when` is a SQL reserved word — stored as when_label, aliased on read.)
export const enablementCertifications = pgTable(
  'enablement_certifications',
  {
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    name: text('name'),
    status: text('status'),
    whenLabel: text('when_label'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);
