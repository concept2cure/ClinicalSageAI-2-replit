/**
 * Database Schema for Smart References & Asset Library
 * Add these tables to your schema.ts
 */

import { pgTable, text, integer, timestamp, boolean, uuid, index } from 'drizzle-orm/pg-core';

// Document Assets (Tables, Figures, Listings)
export const documentAssets = pgTable('document_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  sourceDocumentId: text('source_document_id').notNull(),
  sourceDocumentTitle: text('source_document_title'),
  
  assetType: text('asset_type').notNull(), // 'table', 'figure', 'listing'
  title: text('title').notNull(),
  content: text('content'), // Extracted content or placeholder
  assetNumber: text('asset_number'), // e.g., "14.1.1"
  pageNumber: integer('page_number'),
  
  metadata: text('metadata'), // JSON for additional info
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  orgIdx: index('assets_org_idx').on(table.organizationId),
  typeIdx: index('assets_type_idx').on(table.assetType),
  sourceIdx: index('assets_source_idx').on(table.sourceDocumentId),
}));

// Document References (Cross-reference tracking)
export const documentReferences = pgTable('document_references', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: text('organization_id').notNull(),
  
  fromDocumentId: text('from_document_id').notNull(),
  toDocumentId: text('to_document_id').notNull(),
  
  referenceType: text('reference_type'), // 'cross-reference', 'citation', 'see-also'
  contextSnippet: text('context_snippet'), // Where the reference was inserted
  
  usedAt: timestamp('used_at').defaultNow(), // Last time reference was used
  usageCount: integer('usage_count').default(1),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  fromIdx: index('refs_from_idx').on(table.fromDocumentId),
  toIdx: index('refs_to_idx').on(table.toDocumentId),
  orgIdx: index('refs_org_idx').on(table.organizationId),
}));

// Recent Assets (User-specific recent usage)
export const recentAssets = pgTable('recent_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').notNull(),
  
  assetId: uuid('asset_id').notNull(),
  documentId: text('document_id'), // Where it was used
  
  usedAt: timestamp('used_at').defaultNow(),
}, (table) => ({
  userIdx: index('recent_user_idx').on(table.userId),
  assetIdx: index('recent_asset_idx').on(table.assetId),
}));

// Asset Favorites
export const favoriteAssets = pgTable('favorite_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').notNull(),
  
  assetId: uuid('asset_id').notNull(),
  notes: text('notes'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userAssetIdx: index('fav_user_asset_idx').on(table.userId, table.assetId),
}));
