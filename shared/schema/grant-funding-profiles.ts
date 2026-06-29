/**
 * Grant funding profile (Capability C2C-14, intelligent finder)
 *
 * The org-scoped profile the intelligent opportunity finder matches against:
 * research keywords, target agencies, preferred mechanisms, institution type,
 * and award-size range. One profile per organization. Mutations are governed +
 * audited; the matcher (server/services/grants/opportunity-matching.ts) scores
 * Grants.gov opportunities against it.
 *
 * @module shared/schema/grant-funding-profiles
 */

import { index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export const grantFundingProfiles = pgTable(
  'grant_funding_profiles',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Research keywords / foci (text[]). */
    keywords: text('keywords').array(),
    /** Target funding agencies (codes: nih, nsf, barda, dod, cdc, arpa_h, foundation, industry, other). */
    agencies: text('agencies').array(),
    /** Preferred mechanisms (sbir, sttr, r01, r21, u01, p01, contract, cooperative_agreement, other). */
    mechanisms: text('mechanisms').array(),
    /** Applicant institution type (e.g. higher_ed, nonprofit, small_business). */
    institutionType: text('institution_type'),
    minAward: numeric('min_award', { precision: 14, scale: 2 }),
    maxAward: numeric('max_award', { precision: 14, scale: 2 }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_grant_funding_profiles_org').on(t.organizationId),
    orgUnique: uniqueIndex('uq_grant_funding_profiles_org').on(t.organizationId),
  }),
);

export type GrantFundingProfile = typeof grantFundingProfiles.$inferSelect;
export type NewGrantFundingProfile = typeof grantFundingProfiles.$inferInsert;
