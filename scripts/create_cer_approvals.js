// Script to create the cer_approvals table
import { pool } from '../server/db.js';

console.log('Starting migration to create cer_approvals table...');

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Checking if table exists...');

    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cer_approvals'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('Table cer_approvals already exists, skipping creation');
      return;
    }

    console.log('Table does not exist, creating...');

    // Start transaction
    await client.query('BEGIN');

    // Create the table
    await client.query(`
      CREATE TABLE cer_approvals (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        project_id INTEGER NOT NULL REFERENCES cer_projects(id),
        document_id INTEGER REFERENCES cer_documents(id),
        section_key TEXT,
        approval_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by_id INTEGER REFERENCES users(id),
        requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
        approved_by_id INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        rejected_by_id INTEGER REFERENCES users(id),
        rejected_at TIMESTAMP,
        comments TEXT,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create indexes
    await client.query(`CREATE INDEX idx_cer_approvals_org_id ON cer_approvals(organization_id);`);
    await client.query(`CREATE INDEX idx_cer_approvals_project_id ON cer_approvals(project_id);`);
    await client.query(`CREATE INDEX idx_cer_approvals_document_id ON cer_approvals(document_id);`);
    await client.query(`CREATE INDEX idx_cer_approvals_status ON cer_approvals(status);`);
    await client.query(
      `CREATE INDEX idx_cer_approvals_org_proj_status ON cer_approvals(organization_id, project_id, status);`
    );
    await client.query(
      `CREATE INDEX idx_cer_approvals_org_section_status ON cer_approvals(organization_id, section_key, status);`
    );

    // Commit transaction
    await client.query('COMMIT');

    console.log('Successfully created cer_approvals table and indexes');
  } catch (error) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
