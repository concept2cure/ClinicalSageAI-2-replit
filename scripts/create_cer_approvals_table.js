/**
 * Script to create the cer_approvals table
 *
 * This script uses the Drizzle ORM to create the cer_approvals table based on the schema
 * defined in shared/schema.ts, ensuring consistency with the data model.
 */
import { db } from '../server/db/index.js';
import { sql } from 'drizzle-orm';
import { createScopedLogger } from '../server/utils/logger.js';

const logger = createScopedLogger('db-migration');

async function createCerApprovalsTable() {
  logger.info('Creating cer_approvals table...');

  try {
    // Check if table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'cer_approvals'
      );
    `);

    if (tableExists.rows[0].exists) {
      logger.info('Table cer_approvals already exists, skipping creation');
      return;
    }

    // Create the table
    await db.execute(sql`
      CREATE TABLE cer_approvals (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id),
        project_id INTEGER NOT NULL REFERENCES cer_projects(id),
        document_id INTEGER REFERENCES project_documents(id),
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
    await db.execute(sql`CREATE INDEX idx_cer_approvals_org_id ON cer_approvals(organization_id);`);
    await db.execute(sql`CREATE INDEX idx_cer_approvals_project_id ON cer_approvals(project_id);`);
    await db.execute(
      sql`CREATE INDEX idx_cer_approvals_document_id ON cer_approvals(document_id);`
    );
    await db.execute(sql`CREATE INDEX idx_cer_approvals_status ON cer_approvals(status);`);
    await db.execute(
      sql`CREATE INDEX idx_cer_approvals_org_proj_status ON cer_approvals(organization_id, project_id, status);`
    );
    await db.execute(
      sql`CREATE INDEX idx_cer_approvals_org_section_status ON cer_approvals(organization_id, section_key, status);`
    );

    logger.info('Successfully created cer_approvals table and indexes');
  } catch (error) {
    logger.error('Failed to create cer_approvals table', error);
    throw error;
  }
}

// Run the migration
createCerApprovalsTable()
  .then(() => {
    logger.info('Migration completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Migration failed', error);
    process.exit(1);
  });
