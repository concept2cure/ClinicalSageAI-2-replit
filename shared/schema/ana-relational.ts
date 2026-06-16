/**
 * AnA Relational Profiles — the self-developed personality layer.
 *
 * One row per (organization, user, project?) scope. AnA maintains these
 * herself: after conversations she reflects on what she learned about the
 * person (tone preferences, emotional patterns, what they're proud of)
 * and the project (vocabulary, pressure points), plus any mistakes she
 * made and corrected. The rendered notes are injected back into her
 * system prompt as the RELATIONAL CONTEXT block, which is how her
 * personality adapts per user and per project over time.
 *
 * project_id NULL = the user-level profile (how AnA works with this
 * person anywhere); non-NULL = project-scoped notes layered on top.
 *
 * Schema:  this file. Migration: migrations/20260612_ana_relational_external_intel.sql
 * Service: server/services/ana-ri/relational-profile-service.ts
 */

import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';
import { organizations, users, projects } from '../schema';

export interface AnaToneCalibration {
  warmth?: 'low' | 'medium' | 'high';
  humor?: 'none' | 'rare' | 'welcome';
  formality?: 'relaxed' | 'standard' | 'formal';
  detail?: 'concise' | 'standard' | 'exhaustive';
}

export interface AnaEmotionalSignal {
  at: string; // ISO timestamp
  signal: string; // e.g. "deadline pressure on the 510(k) — steady, triage-first tone"
}

export interface AnaAcknowledgedMistake {
  at: string; // ISO timestamp
  mistake: string; // what AnA got wrong
  correction: string; // the corrected understanding
}

export const anaRelationalProfiles = pgTable(
  'ana_relational_profiles',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /** NULL = user-level profile; set = project-scoped notes on top. */
    projectId: integer('project_id').references(() => projects.id),

    // ── AnA's own notes ─────────────────────────────────────────
    /** Free-prose notes AnA maintains about how to work with this person/project. */
    profileSummary: text('profile_summary'),
    toneCalibration: jsonb('tone_calibration').$type<AnaToneCalibration>().default({}).notNull(),
    /** Rolling window of recent emotional reads (most recent last). */
    emotionalSignals: jsonb('emotional_signals')
      .$type<AnaEmotionalSignal[]>()
      .default([])
      .notNull(),
    /** Mistakes AnA made with this user, owned and corrected. */
    acknowledgedMistakes: jsonb('acknowledged_mistakes')
      .$type<AnaAcknowledgedMistake[]>()
      .default([])
      .notNull(),

    // ── Bookkeeping ─────────────────────────────────────────────
    interactionCount: integer('interaction_count').default(0).notNull(),
    lastInteractionAt: timestamp('last_interaction_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Uniqueness on (org, user, COALESCE(project_id, 0)) is enforced in the
    // SQL migration — Postgres treats NULLs as distinct in plain unique
    // indexes, which would allow duplicate user-level rows.
    orgUserIdx: index('ana_relational_org_user_idx').on(table.organizationId, table.userId),
    projectIdx: index('ana_relational_project_idx').on(table.projectId),
  })
);

export type AnaRelationalProfile = InferSelectModel<typeof anaRelationalProfiles>;
