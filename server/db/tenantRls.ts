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
 * Validate that a string is a safe SQL identifier (table or column name).
 * Only allows lowercase letters, digits, and underscores — the standard
 * Postgres unquoted identifier charset. Rejects anything else to prevent
 * SQL injection when identifiers must be interpolated into DDL (which
 * cannot use parameterized $1 placeholders).
 */
function assertSafeIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(
      `Unsafe SQL identifier rejected: "${name}". ` +
      'Only lowercase letters, digits, and underscores are allowed.'
    );
  }
  return name;
}

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
    const safeName = assertSafeIdentifier(tableName);
    logger.info(`Setting up RLS for table: ${safeName}`);

    // First check if the table has organization_id column
    const columnCheckResult = await executeRawQuery(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${safeName}' AND column_name = 'organization_id';
    `);

    // If organization_id column doesn't exist, skip this table
    if (columnCheckResult.rowCount === 0) {
      logger.warn(`Table ${safeName} doesn't have organization_id column, skipping RLS setup`);
      return false;
    }

    // Enable RLS on the table
    await executeRawQuery(`
      ALTER TABLE ${safeName} ENABLE ROW LEVEL SECURITY;
    `);

    // Create policy for select operations
    await executeRawQuery(`
      DROP POLICY IF EXISTS ${safeName}_tenant_isolation_policy ON ${safeName};

      CREATE POLICY ${safeName}_tenant_isolation_policy ON ${safeName}
      FOR ALL
      USING (
        organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
        OR organization_id = 0
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
    `);

    // Create the insert trigger to set organization_id automatically
    await executeRawQuery(`
      DROP TRIGGER IF EXISTS set_tenant_id_trigger ON ${safeName};

      CREATE TRIGGER set_tenant_id_trigger
      BEFORE INSERT ON ${safeName}
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
