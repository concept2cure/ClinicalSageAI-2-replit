/**
 * Biopharma specialty data layer (Pediatric / Orphan / Lifecycle)
 *
 * Org-scoped stores backing the pediatric, orphan, and lifecycle-mgmt surfaces
 * (GET /api/biopharma/{pediatric,orphan,supplements}). Columns match each
 * surface's display contract; org-scoped and FK-free per the c2c_* convention.
 *
 * @module shared/schema/biopharma-specialty
 */
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

// Pediatric investigation plans (PIP / iPSP). Display shape:
// { id, product, kind, ageRange, deferrals, waivers, milestones, due, status }
export const biopharmaPediatricPlans = pgTable(
  'biopharma_pediatric_plans',
  {
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    product: text('product'),
    kind: text('kind'),
    ageRange: text('age_range'),
    deferrals: integer('deferrals').default(0),
    waivers: integer('waivers').default(0),
    milestones: integer('milestones').default(0),
    due: text('due'),
    status: text('status'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);

// Orphan designations. Display shape:
// { id, product, agency, indication, date, prevalence, benefit, status }
export const biopharmaOrphanDesignations = pgTable(
  'biopharma_orphan_designations',
  {
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    product: text('product'),
    agency: text('agency'),
    indication: text('indication'),
    date: text('date'),
    prevalence: text('prevalence'),
    benefit: text('benefit'),
    status: text('status'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);

// Supplements & variations (lifecycle). Display shape:
// { id, agency, product, subject, filed, due, status }
export const biopharmaSupplements = pgTable(
  'biopharma_supplements',
  {
    id: text('id').notNull(),
    organizationId: integer('organization_id').notNull(),
    agency: text('agency'),
    product: text('product'),
    subject: text('subject'),
    filed: text('filed'),
    due: text('due'),
    status: text('status'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }) }),
);
