/**
 * Migration: Tenant Isolation
 *
 * This migration creates and sets up Row-Level Security for tenant isolation.
 */
import { SQL } from 'drizzle-orm';
import { setupRlsForAllTables, createTenantTriggerFunction } from '../server/db/tenantRls';

/**
 * Setup function that will be called when this migration is applied
 */
export async function up() {
  try {
    console.log('Starting tenant isolation migration...');

    // Setup tenant isolation functions
    console.log('Creating tenant trigger function...');
    await createTenantTriggerFunction();

    // Add organization_id column to all relevant tables
    console.log('Setting up RLS for all tables...');
    await setupRlsForAllTables();

    console.log('Tenant isolation migration completed successfully');
  } catch (error) {
    console.error('Error in tenant isolation migration:', error);
    throw error;
  }
}

/**
 * Teardown function that will be called when this migration is reverted
 */
export async function down() {
  try {
    console.log('Reverting tenant isolation migration...');

    // Drop the tenant trigger function
    await executeRawQuery(`
      DROP FUNCTION IF EXISTS set_tenant_id();
    `);
    console.log('Dropped tenant trigger function');

    // Disable RLS on all tables
    const tablesResult = await executeRawQuery(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name != 'schema_migrations';
    `);

    for (const row of tablesResult.rows) {
      await executeRawQuery(`
        ALTER TABLE ${row.table_name} DISABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS ${row.table_name}_tenant_isolation_policy ON ${row.table_name};
        DROP TRIGGER IF EXISTS set_tenant_id_trigger ON ${row.table_name};
      `);
      console.log(`Disabled RLS on table ${row.table_name}`);
    }

    console.log('Tenant isolation migration reverted successfully');
  } catch (error) {
    console.error('Error reverting tenant isolation migration:', error);
    throw error;
  }
}

/**
 * Helper function to execute raw SQL
 */
async function executeRawQuery(sql: string) {
  const { query } = await import('../server/db');
  return query(sql);
}
