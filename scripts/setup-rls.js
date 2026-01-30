/**
 * Row-Level Security Setup Script
 *
 * This script enables Row-Level Security (RLS) on tenant-scoped tables in the database.
 * It creates policies that ensure data isolation between different organizations
 * by automatically filtering rows based on the current tenant context.
 */

const { Client } = require('pg');
const config = require('../server/config/environment').config;

// Tables that should have RLS enabled
const TENANT_TABLES = [
  'organizations',
  'client_workspaces',
  'users',
  'organization_users',
  'cer_projects',
  'cer_documents',
  'cer_approvals',
  'vault_documents',
  'ctq_factors',
  'quality_management_plans',
  'qmp_section_gating',
  'qmp_traceability',
  // Add other tenant-scoped tables here
];

async function setupRowLevelSecurity() {
  const client = new Client({
    connectionString: config.database.url,
  });

  try {
    await client.connect();
    logger.info('Connected to database');

    // Begin transaction
    await client.query('BEGIN');

    // Create function to set current organization context
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION set_tenant_context(org_id UUID)
      RETURNS void AS $$
      BEGIN
        PERFORM set_config('app.current_org', org_id::text, false);
      END;
      $$ LANGUAGE plpgsql;
    `;
    await client.query(createFunctionSQL);
    logger.info('Created set_tenant_context function');

    // Set up RLS on each tenant table
    for (const table of TENANT_TABLES) {
      logger.info(`Setting up RLS for table: ${table}`);

      // Enable RLS on the table
      await client.query(`ALTER TABLE IF EXISTS ${table} ENABLE ROW LEVEL SECURITY;`);

      // Create a policy for tenant isolation
      const createPolicySQL = `
        DROP POLICY IF EXISTS tenant_isolation_policy ON ${table};
        CREATE POLICY tenant_isolation_policy ON ${table}
          USING (
            organization_id::text = current_setting('app.current_org', true)::text
          );
      `;

      try {
        await client.query(createPolicySQL);
        logger.info(`✓ Created RLS policy for ${table}`);
      } catch (error) {
        logger.error(`Error setting up RLS policy for ${table}:`, error.message);

        // If the error is due to missing organization_id column, log a warning
        if (error.message.includes('organization_id')) {
          logger.warn(`⚠️ Table ${table} might not have an organization_id column. Skipping.`);
        } else {
          throw error; // Re-throw other errors
        }
      }
    }

    // Commit transaction
    await client.query('COMMIT');
    logger.info('Row-Level Security setup completed successfully');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logger.error('Error setting up Row-Level Security:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the setup if executed directly
if (require.main === module) {
  setupRowLevelSecurity().catch(console.error);
}

module.exports = { setupRowLevelSecurity };
