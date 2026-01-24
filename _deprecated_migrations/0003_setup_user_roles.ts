/**
 * Migration: Setup User Roles for Multi-Tenant Access
 *
 * This migration creates database roles and permissions
 * for different user types in the multi-tenant system.
 */

/**
 * Setup function that will be called when this migration is applied
 */
export async function up() {
  try {
    console.log('Starting user roles migration...');

    // Create the application roles
    await executeRawQuery(`
      -- Create super admin role (can access all data)
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_super_admin') THEN
          CREATE ROLE app_super_admin;
        END IF;
      END $$;
      
      -- Create organization admin role (can access only their organization's data)
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_org_admin') THEN
          CREATE ROLE app_org_admin;
        END IF;
      END $$;
      
      -- Create regular user role (most restricted access)
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_regular_user') THEN
          CREATE ROLE app_regular_user;
        END IF;
      END $$;
    `);
    console.log('Created application roles');

    // Set up function to set the current tenant and user role
    await executeRawQuery(`
      CREATE OR REPLACE FUNCTION set_tenant_and_role(p_tenant_id INTEGER, p_role TEXT)
      RETURNS VOID AS $$
      BEGIN
        -- Set the current tenant ID for Row-Level Security policies
        PERFORM set_config('app.current_tenant_id', p_tenant_id::TEXT, TRUE);
        
        -- Set the current user role for permission checks
        PERFORM set_config('app.current_user_role', p_role, TRUE);
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('Created set_tenant_and_role function');

    // Create helper function to check if user has a specific role
    await executeRawQuery(`
      CREATE OR REPLACE FUNCTION has_role(p_role TEXT)
      RETURNS BOOLEAN AS $$
      BEGIN
        RETURN current_setting('app.current_user_role', TRUE) = p_role;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('Created has_role function');

    // Create a more sophisticated RLS policy for vault document access
    // This allows sharing documents across organizations in a controlled way
    await executeRawQuery(`
      -- Function to check if a user has access to a document
      CREATE OR REPLACE FUNCTION user_has_document_access(p_document_id UUID, p_organization_id INTEGER)
      RETURNS BOOLEAN AS $$
      BEGIN
        -- Super admins can access all documents
        IF has_role('app_super_admin') THEN
          RETURN TRUE;
        END IF;

        -- Check if document belongs to user's organization
        IF EXISTS (
          SELECT 1 FROM vault_documents_v2
          WHERE id = p_document_id AND organization_id = p_organization_id
        ) THEN
          RETURN TRUE;
        END IF;

        -- Check if document is shared with user's organization
        IF EXISTS (
          SELECT 1 FROM vault_document_shares
          WHERE document_id = p_document_id AND shared_with_organization_id = p_organization_id
        ) THEN
          RETURN TRUE;
        END IF;

        RETURN FALSE;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('Created user_has_document_access function');

    console.log('User roles migration completed successfully');
  } catch (error) {
    console.error('Error in user roles migration:', error);
    throw error;
  }
}

/**
 * Teardown function that will be called when this migration is reverted
 */
export async function down() {
  try {
    console.log('Reverting user roles migration...');

    // Drop the helper functions
    await executeRawQuery(`
      DROP FUNCTION IF EXISTS user_has_document_access(UUID, INTEGER);
      DROP FUNCTION IF EXISTS has_role(TEXT);
      DROP FUNCTION IF EXISTS set_tenant_and_role(INTEGER, TEXT);
    `);
    console.log('Dropped helper functions');

    // Drop the application roles
    await executeRawQuery(`
      DROP ROLE IF EXISTS app_regular_user;
      DROP ROLE IF EXISTS app_org_admin;
      DROP ROLE IF EXISTS app_super_admin;
    `);
    console.log('Dropped application roles');

    console.log('User roles migration reverted successfully');
  } catch (error) {
    console.error('Error reverting user roles migration:', error);
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
