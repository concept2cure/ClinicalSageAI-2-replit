/**
 * Tenant Row-Level Security (RLS) Utilities
 *
 * This module provides utilities for setting up and managing
 * Row-Level Security policies for multi-tenant isolation.
 */
import { createScopedLogger } from '../utils/logger';
import { executeRawQuery } from './execute';

const logger = createScopedLogger('tenant-rls');

/**
 * Create the tenant trigger function that automatically sets organization_id
 * on new records based on the current app.current_tenant_id setting.
 *
 * @returns Promise that resolves when the function is created
 */
export async function createTenantTriggerFunction() {
  try {
    logger.info('Creating tenant trigger function');

    await executeRawQuery(`
      -- Function to set organization_id on insert
      CREATE OR REPLACE FUNCTION set_tenant_id()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Skip if organization_id is already set
        IF NEW.organization_id IS NOT NULL THEN
          RETURN NEW;
        END IF;
        
        -- Get current tenant ID from session variable
        NEW.organization_id := NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER;
        
        -- If no tenant ID is set, raise an error
        IF NEW.organization_id IS NULL THEN
          RAISE EXCEPTION 'No tenant ID set for insert operation';
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    logger.info('Tenant trigger function created successfully');
    return true;
  } catch (error) {
    logger.error('Failed to create tenant trigger function', error);
    throw error;
  }
}

/**
 * Setup Row-Level Security policies for a table to enforce tenant isolation
 *
 * @param tableName - The name of the table to set up RLS for
 * @returns Promise that resolves when the RLS policy is set up
 */
export async function setupTableRls(tableName: string) {
  try {
    logger.info(`Setting up RLS for table: ${tableName}`);

    // First check if the table has organization_id column
    const columnCheckResult = await executeRawQuery(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = '${tableName}' AND column_name = 'organization_id';
    `);

    // If organization_id column doesn't exist, skip this table
    if (columnCheckResult.rowCount === 0) {
      logger.warn(`Table ${tableName} doesn't have organization_id column, skipping RLS setup`);
      return false;
    }

    // Enable RLS on the table
    await executeRawQuery(`
      -- Enable row-level security on the table
      ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
    `);

    // Create policy for select operations
    await executeRawQuery(`
      -- Policy for read operations
      DROP POLICY IF EXISTS ${tableName}_tenant_isolation_policy ON ${tableName};
      
      CREATE POLICY ${tableName}_tenant_isolation_policy ON ${tableName}
      FOR ALL
      USING (
        -- Either the record belongs to the current tenant
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        -- Or it's a special zero tenant (shared resources)
        OR organization_id = 0
        -- Or super admin role is allowed to see all data
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
    `);

    // Create the insert trigger to set organization_id automatically
    await executeRawQuery(`
      -- Create trigger to set organization_id on insert
      DROP TRIGGER IF EXISTS set_tenant_id_trigger ON ${tableName};
      
      CREATE TRIGGER set_tenant_id_trigger
      BEFORE INSERT ON ${tableName}
      FOR EACH ROW
      EXECUTE FUNCTION set_tenant_id();
    `);

    logger.info(`RLS setup completed for table: ${tableName}`);
    return true;
  } catch (error) {
    logger.error(`Failed to set up RLS for table: ${tableName}`, error);
    throw error;
  }
}

/**
 * Setup Row-Level Security for all tables in the database
 *
 * @returns Promise that resolves when all tables have RLS policies
 */
export async function setupRlsForAllTables() {
  try {
    logger.info('Setting up RLS for all tables');

    // Create tenant trigger function
    await createTenantTriggerFunction();

    // Get all tables in the public schema
    const tablesResult = await executeRawQuery(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('schema_migrations', 'drizzle_migrations');
    `);

    // Set up RLS for each table
    for (const row of tablesResult.rows) {
      await setupTableRls(String(row.table_name));
    }

    logger.info('RLS setup completed for all tables');
    return true;
  } catch (error) {
    logger.error('Failed to set up RLS for all tables', error);
    throw error;
  }
}
