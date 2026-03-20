/**
 * API Keys Schema
 *
 * Supports multiple API keys per organization for external programmatic
 * access to ClinicalSageAI's proprietary intelligence services.
 *
 * SECURITY:
 * - Raw keys are NEVER stored; only SHA-256 hashes are persisted.
 * - A short prefix (first 8 chars) is stored for human identification.
 * - Keys can be scoped to specific service endpoints.
 * - Keys support expiration, revocation, and rate limiting.
 *
 * MULTI-TENANT: All keys are scoped to an organization.
 *
 * @module shared/schema/api-keys
 */

import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  json,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// ============================================================================
// API KEYS TABLE
// ============================================================================

export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid').defaultRandom().notNull().unique(),
  organizationId: integer('organization_id').notNull(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  scopes: json('scopes').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('active'), // active, revoked, expired
  expiresAt: timestamp('expires_at'),
  lastUsedAt: timestamp('last_used_at'),
  requestCount: integer('request_count').notNull().default(0),
  rateLimit: integer('rate_limit').notNull().default(60), // requests per minute
  metadata: json('metadata').$type<Record<string, unknown>>(),
  createdBy: integer('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});

// ============================================================================
// TYPES
// ============================================================================

export type ApiKey = InferSelectModel<typeof apiKeys>;
export type InsertApiKey = InferInsertModel<typeof apiKeys>;

// Valid scopes for API key access
export const API_KEY_SCOPES = [
  'csr:read',
  'regulatory:read',
  'endpoints:read',
  'precedent:read',
  'trial-design:read',
  'documents:read',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
