/**
 * Tenant-aware Database Utility
 *
 * This module provides database access functions that automatically apply
 * tenant isolation through Row-Level Security (RLS) policies and query filters.
 *
 * Every database operation performed through these utilities will automatically
 * include the proper tenant context (organization_id, client_workspace_id) to ensure
 * data isolation between tenants.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, SQL, gte, or } from 'drizzle-orm';
import { type PgTable } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { TenantContext } from '../middleware/tenantContext';

// Database connection
const connectionString = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL as string;
const client = postgres(connectionString);
export const db = drizzle(client);

/**
 * TenantDb class provides tenant-aware database operations
 */
export class TenantDb {
  private orgId: string | null;
  private clientId: string | null;

  /**
   * Create a new TenantDb instance with tenant context
   */
  constructor(tenantContext: TenantContext) {
    this.orgId = tenantContext.organizationId;
    this.clientId = tenantContext.clientWorkspaceId;
  }

  /**
   * Query a table with tenant isolation
   *
   * @param table - The table to query
   * @param whereClause - Additional WHERE conditions
   * @returns Query results with tenant isolation applied
   */
  async select<T extends PgTable<any>>(table: T, whereClause?: SQL<unknown>): Promise<any[]> {
    // Tenant isolation: always filter by organization_id
    let query = db.select().from(table);

    // Apply organization filter if the table has organization_id column
    if ('organizationId' in table && this.orgId) {
      if (whereClause) {
        query = query.where(
          and(eq(table.organizationId as any, parseInt(this.orgId)), whereClause)
        );
      } else {
        query = query.where(eq(table.organizationId as any, parseInt(this.orgId)));
      }
    }

    // Apply client workspace filter if requested and table supports it
    if ('clientWorkspaceId' in table && this.clientId) {
      query = query.where(eq(table.clientWorkspaceId as any, parseInt(this.clientId)));
    }

    return query;
  }

  /**
   * Insert data with automatic tenant context
   *
   * @param table - The table to insert into
   * @param data - The data to insert (single row or array of rows)
   * @returns The inserted data
   */
  async insert<T extends PgTable<any>>(
    table: T,
    data: Record<string, any> | Record<string, any>[]
  ): Promise<any> {
    // Ensure data is an array
    const dataArray = Array.isArray(data) ? data : [data];

    // Add tenant context to each row
    const dataWithTenant = dataArray.map(row => {
      const newRow = { ...row };

      // Add organization_id if table supports it
      if ('organizationId' in table && this.orgId) {
        newRow.organizationId = parseInt(this.orgId);
      }

      // Add client_workspace_id if table supports it and it's provided
      if ('clientWorkspaceId' in table && this.clientId) {
        newRow.clientWorkspaceId = parseInt(this.clientId);
      }

      return newRow;
    });

    // Perform the insert
    return db.insert(table).values(dataWithTenant).returning();
  }

  /**
   * Update data with tenant isolation
   *
   * @param table - The table to update
   * @param data - The data to update
   * @param whereClause - Additional WHERE conditions
   * @returns The updated data
   */
  async update<T extends PgTable<any>>(
    table: T,
    data: Record<string, any>,
    whereClause?: SQL<unknown>
  ): Promise<any> {
    // Base update query
    let query = db.update(table).set(data);

    // Tenant isolation: always filter by organization_id
    if ('organizationId' in table && this.orgId) {
      if (whereClause) {
        query = query.where(
          and(eq(table.organizationId as any, parseInt(this.orgId)), whereClause)
        );
      } else {
        query = query.where(eq(table.organizationId as any, parseInt(this.orgId)));
      }
    }

    // Apply client workspace filter if requested and table supports it
    if ('clientWorkspaceId' in table && this.clientId) {
      query = query.where(eq(table.clientWorkspaceId as any, parseInt(this.clientId)));
    }

    return query.returning();
  }

  /**
   * Delete data with tenant isolation
   *
   * @param table - The table to delete from
   * @param whereClause - Additional WHERE conditions
   * @returns The deleted data
   */
  async delete<T extends PgTable<any>>(table: T, whereClause?: SQL<unknown>): Promise<any> {
    // Base delete query
    let query = db.delete(table);

    // Tenant isolation: always filter by organization_id
    if ('organizationId' in table && this.orgId) {
      if (whereClause) {
        query = query.where(
          and(eq(table.organizationId as any, parseInt(this.orgId)), whereClause)
        );
      } else {
        query = query.where(eq(table.organizationId as any, parseInt(this.orgId)));
      }
    }

    // Apply client workspace filter if requested and table supports it
    if ('clientWorkspaceId' in table && this.clientId) {
      query = query.where(eq(table.clientWorkspaceId as any, parseInt(this.clientId)));
    }

    return query.returning();
  }

  /**
   * Execute a raw SQL query with tenant context awareness
   *
   * CAUTION: This should be used sparingly and carefully to avoid SQL injection
   *
   * @param sql - The SQL query with $1, $2, etc. placeholders
   * @param params - The parameters for the query
   * @returns Query results
   */
  async rawQuery(sql: string, params: any[] = []): Promise<any[]> {
    // Add tenant context parameters to the query
    const tenantSql = `
      WITH tenant_context AS (
        SELECT 
          ${this.orgId ? `$${params.length + 1}::integer` : 'NULL'} as organization_id,
          ${this.clientId ? `$${params.length + 2}::integer` : 'NULL'} as client_workspace_id
      )
      ${sql}
    `;

    // Add tenant context values to params
    const tenantParams = [
      ...params,
      this.orgId ? parseInt(this.orgId) : null,
      this.clientId ? parseInt(this.clientId) : null,
    ];

    // Execute the query
    return client.unsafe(tenantSql, tenantParams);
  }

  /**
   * Get the current tenant context
   */
  getTenantContext(): { orgId: string | null; clientId: string | null } {
    return {
      orgId: this.orgId,
      clientId: this.clientId,
    };
  }
}

/**
 * Create a new tenant database helper with the given tenant context
 */
export function createTenantDb(tenantContext: TenantContext): TenantDb {
  return new TenantDb(tenantContext);
}
