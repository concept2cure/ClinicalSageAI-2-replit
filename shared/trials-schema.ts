import { pgTable, serial, text, date, timestamp, integer } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Table schema for clinical trials from multiple sources
export const trials = pgTable('trials', {
  id: serial('id').primaryKey(),
  trial_id: text('trial_id').unique(),
  nct_id: text('nct_id'),
  csr_id: text('csr_id'),
  title: text('title').notNull(),
  sponsor: text('sponsor').notNull(),
  indication: text('indication').notNull(),
  phase: text('phase').notNull(),
  status: text('status').notNull(),
  start_date: date('start_date'),
  source: text('source').notNull(),
  country: text('country'),
  file_path: text('file_path'),
  file_size: integer('file_size'),
  imported_date: timestamp('imported_date').defaultNow(),
  last_updated: timestamp('last_updated'),
});

// Schema for inserting new trials
export const insertTrialSchema = createInsertSchema(trials).omit({
  id: true,
  imported_date: true,
  last_updated: true,
});

// Types
export type Trial = typeof trials.$inferSelect;
export type InsertTrial = z.infer<typeof insertTrialSchema>;
