/**
 * Migration: Add organization_id to Tables for Tenant Isolation
 *
 * This migration adds the organization_id column to all tables
 * that need tenant isolation but might not already have it.
 */

// Tables that need tenant isolation
const TENANT_TABLES = [
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
    console.log('Starting organization_id column migration...');

    for (const table of TENANT_TABLES) {
      // Check if organization_id column already exists
      const result = await executeRawQuery(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = 'organization_id';
      `);

      // Add organization_id column if it doesn't exist
      if (result.rowCount === 0) {
        await executeRawQuery(`
          ALTER TABLE ${table} 
          ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1;
        `);
        console.log(`Added organization_id column to ${table}`);

        // Add foreign key constraint
        await executeRawQuery(`
          ALTER TABLE ${table}
          ADD CONSTRAINT fk_${table}_organization_id
          FOREIGN KEY (organization_id) 
          REFERENCES organizations(id)
          ON DELETE CASCADE;
        `);
        console.log(`Added foreign key constraint to ${table}`);

        // Add index for better query performance
        await executeRawQuery(`
          CREATE INDEX idx_${table}_organization_id ON ${table}(organization_id);
        `);
        console.log(`Added index on organization_id for ${table}`);
      } else {
        console.log(`organization_id column already exists on ${table}`);
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

    for (const table of TENANT_TABLES) {
      // Drop foreign key constraint
      await executeRawQuery(`
        ALTER TABLE ${table}
        DROP CONSTRAINT IF EXISTS fk_${table}_organization_id;
      `);
      console.log(`Dropped foreign key constraint from ${table}`);

      // Drop index
      await executeRawQuery(`
        DROP INDEX IF EXISTS idx_${table}_organization_id;
      `);
      console.log(`Dropped index on organization_id for ${table}`);

      // Drop organization_id column
      await executeRawQuery(`
        ALTER TABLE ${table}
        DROP COLUMN IF EXISTS organization_id;
      `);
      console.log(`Dropped organization_id column from ${table}`);
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
