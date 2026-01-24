/**
 * Migration: Add Organization ID Column to All Tables
 *
 * This migration adds the organization_id column to all tables
 * that need tenant isolation.
 */

// Tables that need tenant isolation
const TENANT_TABLES = [
  'users',
  'cer_projects',
  'project_documents',
  'project_activities',
  'project_milestones',
  'client_user_permissions',
  'cer_reports',
  'cer_sections',
  'cer_faers_data',
  'cer_literature',
  'cer_compliance_checks',
  'cer_workflows',
  'cer_exports',
  'vault_documents_v2',
  'vault_document_folders',
  'vault_document_shares',
  'vault_document_audit_logs',
  'quality_management_plans',
  'ctq_factors',
  'qmp_audit_trail',
  'qmp_section_gating',
  'qmp_traceability_matrix',
];

/**
 * Setup function that will be called when this migration is applied
 */
export async function up() {
  try {
    console.log('Starting organization_id column migration...');

    // Get existing tables from database
    const existingTablesResult = await executeRawQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'schema_migrations'
        AND table_name != 'organizations'; -- Skip organizations table
    `);

    const existingTables = existingTablesResult.rows.map(row => row.table_name);

    // For each table that should have tenant isolation
    for (const tableName of TENANT_TABLES.filter(t => existingTables.includes(t))) {
      console.log(`Adding organization_id to ${tableName}...`);

      try {
        // Check if organization_id column already exists
        const columnCheckResult = await executeRawQuery(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
            AND column_name = 'organization_id';
        `);

        if (columnCheckResult.rowCount === 0) {
          // Add organization_id column
          await executeRawQuery(`
            ALTER TABLE ${tableName} 
            ADD COLUMN organization_id INTEGER 
            REFERENCES organizations(id);
          `);

          // Add NOT NULL constraint after populating (will use default organization if needed)
          await executeRawQuery(`
            UPDATE ${tableName} 
            SET organization_id = 1 
            WHERE organization_id IS NULL;
            
            -- After populating, add NOT NULL constraint
            ALTER TABLE ${tableName} 
            ALTER COLUMN organization_id SET NOT NULL;
          `);

          console.log(`Added organization_id to ${tableName}`);
        } else {
          console.log(`organization_id already exists in ${tableName}, skipping`);
        }
      } catch (tableError) {
        console.error(`Error adding organization_id to ${tableName}:`, tableError);
        throw tableError;
      }
    }

    console.log('Organization_id column migration completed successfully');
  } catch (error) {
    console.error('Error in organization_id column migration:', error);
    throw error;
  }
}

/**
 * Teardown function that will be called when this migration is reverted
 */
export async function down() {
  try {
    console.log('Reverting organization_id column migration...');

    // Get existing tables from database
    const existingTablesResult = await executeRawQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name != 'schema_migrations'
        AND table_name != 'organizations'; -- Skip organizations table
    `);

    const existingTables = existingTablesResult.rows.map(row => row.table_name);

    // For each table that should have tenant isolation
    for (const tableName of TENANT_TABLES.filter(t => existingTables.includes(t))) {
      try {
        // Check if organization_id column exists
        const columnCheckResult = await executeRawQuery(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
            AND column_name = 'organization_id';
        `);

        if (columnCheckResult.rowCount > 0) {
          // Drop organization_id column
          await executeRawQuery(`
            ALTER TABLE ${tableName} 
            DROP COLUMN organization_id;
          `);

          console.log(`Dropped organization_id from ${tableName}`);
        }
      } catch (tableError) {
        console.error(`Error dropping organization_id from ${tableName}:`, tableError);
        // Continue with other tables instead of failing the entire migration
      }
    }

    console.log('Organization_id column migration reverted successfully');
  } catch (error) {
    console.error('Error reverting organization_id column migration:', error);
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
