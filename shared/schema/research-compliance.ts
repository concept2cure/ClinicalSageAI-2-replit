/**
 * Research Compliance — shared foundation (the spine for C2C-05/06/07 + grants)
 *
 * The shared personnel roster and per-person training/clearance records that gate
 * committee approvals ("no index until trained"), plus the data the compliance-
 * checklist reasoning engine reasons over. This is the foundation the IRB/IACUC/
 * IBC committees and sponsored programs all draw on for one shared roster.
 *
 * Grounded in institutional research-compliance practice (CITI training, OLAW/
 * AAALAC animal training, NIH biosafety training, GCP/ICH E6). Conventions match
 * the platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/research-compliance
 */

import { index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type PersonnelRole = 'principal_investigator' | 'co_investigator' | 'coordinator' | 'research_staff' | 'veterinarian' | 'biosafety_officer' | 'other';

/** Training/clearance types that gate committee approvals. */
export type TrainingType =
  | 'citi_human_subjects'
  | 'citi_gcp'
  | 'citi_animal'
  | 'citi_rcr' // responsible conduct of research
  | 'biosafety'
  | 'bloodborne_pathogens'
  | 'iata_shipping'
  | 'hipaa'
  | 'fcoi_disclosure'
  | 'other';

export type TrainingStatus = 'current' | 'expiring' | 'expired';

// ─── Personnel roster ────────────────────────────────────────────────────────

export const researchPersonnel = pgTable(
  'research_personnel',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Optional link to a platform user account. */
    userId: integer('user_id').references(() => users.id),
    fullName: text('full_name').notNull(),
    email: text('email'),
    role: text('role').$type<PersonnelRole>().notNull(),
    institution: text('institution'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('idx_research_personnel_org').on(t.organizationId) })
);

export type ResearchPersonnel = typeof researchPersonnel.$inferSelect;
export type NewResearchPersonnel = typeof researchPersonnel.$inferInsert;

// ─── Training / clearance records ────────────────────────────────────────────

export const personnelTraining = pgTable(
  'personnel_training',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    personnelId: integer('personnel_id').notNull().references(() => researchPersonnel.id),
    trainingType: text('training_type').$type<TrainingType>().notNull(),
    completedDate: date('completed_date'),
    expiresDate: date('expires_date'),
    certificateRef: text('certificate_ref'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_personnel_training_org').on(t.organizationId),
    personnelIdx: index('idx_personnel_training_personnel').on(t.personnelId),
  })
);

export type PersonnelTraining = typeof personnelTraining.$inferSelect;
export type NewPersonnelTraining = typeof personnelTraining.$inferInsert;
