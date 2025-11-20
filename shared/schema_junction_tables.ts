// ============================================================================
// JUNCTION TABLES FOR PROPER REFERENTIAL INTEGRITY
// ============================================================================
//
// These tables replace JSON arrays in the main schema for proper enterprise
// database design and referential integrity

import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  varchar,
  decimal,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Import existing tables (these will be imported from main schema)
// import { organizations, clientWorkspaces, users, supplyChainMaterials, supplyChainSuppliers, supplyChainBatches } from './schema';

// Material-Supplier Approved Vendor List (AVL)
// Replaces the JSON approvedSuppliers array with proper normalized relationships
export const materialApprovedSuppliers = pgTable('material_approved_suppliers', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  clientWorkspaceId: integer('client_workspace_id').notNull(),
  materialId: integer('material_id').notNull(),
  supplierId: integer('supplier_id').notNull(),
  // Approval Information
  approvalStatus: varchar('approval_status', { length: 50 }).default('approved').notNull(),
  // approved, conditional, suspended, revoked
  approvedDate: date('approved_date').notNull(),
  approvedBy: text('approved_by').notNull(),
  expiryDate: date('expiry_date'),
  // Supplier Performance for this Material
  preferenceRank: integer('preference_rank').default(1), // 1 = primary, 2 = secondary, etc.
  lastUsedDate: date('last_used_date'),
  qualityRating: decimal('quality_rating', { precision: 3, scale: 1 }), // 1.0 - 5.0
  deliveryRating: decimal('delivery_rating', { precision: 3, scale: 1 }),
  costRating: decimal('cost_rating', { precision: 3, scale: 1 }),
  // Constraints & Conditions
  minOrderQuantity: decimal('min_order_quantity', { precision: 12, scale: 3 }),
  maxOrderQuantity: decimal('max_order_quantity', { precision: 12, scale: 3 }),
  leadTimeDays: integer('lead_time_days'),
  // Metadata
  notes: text('notes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  materialSupplierUnique: uniqueIndex('material_supplier_unique_idx').on(table.materialId, table.supplierId),
  organizationIdx: index('material_suppliers_org_idx').on(table.organizationId),
  clientWorkspaceIdx: index('material_suppliers_workspace_idx').on(table.clientWorkspaceId),
  approvalStatusIdx: index('material_suppliers_status_idx').on(table.approvalStatus),
  preferenceRankIdx: index('material_suppliers_rank_idx').on(table.materialId, table.preferenceRank),
}));

// Batch Genealogy for Supply Chain (normalized parent-child relationships)
// Replaces the JSON parentBatchIds array with proper normalized relationships
export const supplyChainBatchGenealogy = pgTable('supply_chain_batch_genealogy', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  clientWorkspaceId: integer('client_workspace_id').notNull(),
  childBatchId: integer('child_batch_id').notNull(),
  parentBatchId: integer('parent_batch_id').notNull(),
  // Consumption Details
  relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
  // blend, coating, encapsulation, packaging, rework
  quantityUsed: decimal('quantity_used', { precision: 12, scale: 6 }).notNull(),
  quantityUnit: varchar('quantity_unit', { length: 20 }).notNull(),
  usageDate: timestamp('usage_date').notNull(),
  processStep: text('process_step'), 
  bomLineItem: text('bom_line_item'), // Reference to BOM
  // Traceability
  operatorId: integer('operator_id'),
  equipmentId: text('equipment_id'),
  // Metadata
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  childParentUnique: uniqueIndex('child_parent_batch_unique_idx').on(table.childBatchId, table.parentBatchId),
  organizationIdx: index('batch_genealogy_org_idx').on(table.organizationId),
  clientWorkspaceIdx: index('batch_genealogy_workspace_idx').on(table.clientWorkspaceId),
  relationshipIdx: index('batch_genealogy_relationship_idx').on(table.relationshipType),
  usageDateIdx: index('batch_genealogy_usage_date_idx').on(table.usageDate),
}));

// Insert schemas for the junction tables
export const insertMaterialApprovedSupplierSchema = createInsertSchema(materialApprovedSuppliers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupplyChainBatchGenealogySchema = createInsertSchema(supplyChainBatchGenealogy).omit({
  id: true,
  createdAt: true,
});

// Types
export type MaterialApprovedSupplier = typeof materialApprovedSuppliers.$inferSelect;
export type InsertMaterialApprovedSupplier = z.infer<typeof insertMaterialApprovedSupplierSchema>;

export type SupplyChainBatchGenealogy = typeof supplyChainBatchGenealogy.$inferSelect;
export type InsertSupplyChainBatchGenealogy = z.infer<typeof insertSupplyChainBatchGenealogySchema>;