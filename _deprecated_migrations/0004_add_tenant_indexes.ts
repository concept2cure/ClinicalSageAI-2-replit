/**
 * Migration: Add Indexes for Tenant Queries
 *
 * This migration adds database indexes to improve performance
 * of tenant-filtered queries in the multi-tenant system.
 */

// Tables that need tenant-optimized indexes
const TENANT_TABLES = [
  'quality_management_plans',
  'ctq_factors',
  'qmp_audit_trail',
  'qmp_section_gating',
  'qmp_traceability_matrix',
  'cer_projects',
  'cer_project_documents',
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
];

/**
 * Setup function that will be called when this migration is applied
 */
export async function up() {
  try {
    console.log('Starting tenant indexes migration...');

    for (const table of TENANT_TABLES) {
      // Create an index on organization_id for better tenant filtering performance
      await executeRawQuery(`
        CREATE INDEX IF NOT EXISTS idx_${table}_organization_id
        ON ${table}(organization_id);
      `);
      console.log(`Created organizational index on ${table}`);

      // Create a composite index on organization_id and id for common lookups
      await executeRawQuery(`
        CREATE INDEX IF NOT EXISTS idx_${table}_org_id
        ON ${table}(organization_id, id);
      `);
      console.log(`Created composite index on ${table}`);

      // For tables with status field, create composite indexes for common filtered queries
      const statusResult = await executeRawQuery(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = 'status';
      `);

      if (statusResult.rowCount > 0) {
        await executeRawQuery(`
          CREATE INDEX IF NOT EXISTS idx_${table}_org_status
          ON ${table}(organization_id, status);
        `);
        console.log(`Created status index on ${table}`);
      }

      // For tables with created_at field, create composite indexes for time-based filtering
      const createdAtResult = await executeRawQuery(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = 'created_at';
      `);

      if (createdAtResult.rowCount > 0) {
        await executeRawQuery(`
          CREATE INDEX IF NOT EXISTS idx_${table}_org_created
          ON ${table}(organization_id, created_at DESC);
        `);
        console.log(`Created time-based index on ${table}`);
      }
    }

    // Add special indexes for cross-organization document sharing
    await executeRawQuery(`
      CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with_org
      ON vault_document_shares(shared_with_organization_id);
    `);
    console.log('Created index for cross-organization document sharing');

    console.log('Tenant indexes migration completed successfully');
  } catch (error) {
    console.error('Error in tenant indexes migration:', error);
    throw error;
  }
}

/**
 * Teardown function that will be called when this migration is reverted
 */
export async function down() {
  try {
    console.log('Reverting tenant indexes migration...');

    // Drop special index for cross-organization document sharing
    await executeRawQuery(`
      DROP INDEX IF EXISTS idx_document_shares_shared_with_org;
    `);
    console.log('Dropped index for cross-organization document sharing');

    for (const table of TENANT_TABLES) {
      // Drop time-based index
      await executeRawQuery(`
        DROP INDEX IF EXISTS idx_${table}_org_created;
      `);

      // Drop status-based index
      await executeRawQuery(`
        DROP INDEX IF EXISTS idx_${table}_org_status;
      `);

      // Drop composite index
      await executeRawQuery(`
        DROP INDEX IF EXISTS idx_${table}_org_id;
      `);

      // Drop organization index
      await executeRawQuery(`
        DROP INDEX IF EXISTS idx_${table}_organization_id;
      `);

      console.log(`Dropped all tenant indexes from ${table}`);
    }

    console.log('Tenant indexes migration reverted successfully');
  } catch (error) {
    console.error('Error reverting tenant indexes migration:', error);
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
