/**
 * @fileoverview Pure ESM Schema Definitions (No Server Imports)
 * @module @shared/schema
 */

import { pgTable, serial, varchar, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';

// Pure schema definitions - no database connection
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  organizationId: integer('organization_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const regulatoryAtoms = pgTable('regulatory_atoms', {
  atomId: serial('atom_id').primaryKey(),
  submissionId: varchar('submission_id', { length: 100 }).notNull(),
  atomType: varchar('atom_type', { length: 50 }).notNull(),
  atomData: jsonb('atom_data').notNull(),
  applicableJurisdictions: varchar('applicable_jurisdictions', { length: 10 }).array().notNull().default(['FDA']),
  complianceScore: integer('compliance_score'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }).unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  recordId: varchar('record_id', { length: 100 }).notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  userId: integer('user_id'),
  timestamp: timestamp('timestamp').defaultNow(),
  ipAddress: varchar('ip_address', { length: 45 }),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
});

// Workbench + CERV2 core tables (minimal definitions)
export const clientWorkspaces = pgTable('client_workspaces', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }),
  status: varchar('status', { length: 50 }).default('active'),
  industry: varchar('industry', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cerv2Submissions = pgTable('cerv2_submissions', {
  id: serial('id').primaryKey(),
  submissionId: varchar('submission_id', { length: 100 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 255 }).notNull(),
  manufacturerName: varchar('manufacturer_name', { length: 255 }),
  status: varchar('status', { length: 50 }).default('draft'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cerv2Sections = pgTable('cerv2_sections', {
  id: serial('id').primaryKey(),
  submissionId: varchar('submission_id', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: jsonb('content'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const vaultDMSEntries = pgTable('vault_dms_entries', {
  id: serial('id').primaryKey(),
  clientWorkspaceId: integer('client_workspace_id').notNull(),
  documentId: varchar('document_id', { length: 100 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const workbenchSessions = pgTable('workbench_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const harvestJobs = pgTable('harvest_jobs', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 50 }).default('queued'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const jurisdictions = pgTable('jurisdictions', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 20 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const evidenceStrengths = pgTable('evidence_strengths', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  isSystem: boolean('is_system').default(false),
});

// Indexes
export const userEmailIdx = 'idx_users_email';
export const atomSubmissionIdx = 'idx_atoms_submission';
export const auditTimestampIdx = 'idx_audit_timestamp';
