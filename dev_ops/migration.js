import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateData() {
  console.log('🚀 Starting data migration...');
  const client = await pool.connect();

  try {
    // 1. Get all documents from the old table
    const oldDocsResult = await client.query('SELECT * FROM vault_documents ORDER BY id;');
    const oldDocs = oldDocsResult.rows;
    console.log(`Found ${oldDocs.length} documents to migrate.`);

    // 2. Ensure necessary lookup values exist
    await client.query(`
        INSERT INTO doc_class_lookup (class_name) 
        VALUES ('Protocol'), ('IND'), ('Safety Report'), ('General') 
        ON CONFLICT (class_name) DO NOTHING;
    `);

    // 3. Loop through each old document and migrate it within a transaction
    for (const doc of oldDocs) {
      console.log(`\nMigrating document ID: ${doc.id} - "${doc.title}"`);
      await client.query('BEGIN');

      try {
        // A. Create a default study, country, and site for the tenant if they don't exist
        const studyRes = await client.query(
          `INSERT INTO studies (tenant_id, study_code, title, name, phase) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (study_code) DO UPDATE SET title = EXCLUDED.title RETURNING id;`,
          [
            doc.organization_id,
            `MIG-${doc.organization_id}`,
            `Migrated Study for ${doc.organization_id}`,
            `Migrated Study`,
            'Phase I',
          ]
        );
        const studyId = studyRes.rows[0].id;
        console.log(`   -> Ensured Study ID: ${studyId}`);

        const countryRes = await client.query(
          `INSERT INTO study_countries (study_id, country_iso_code) VALUES ($1, 'US') ON CONFLICT (study_id, country_iso_code) DO NOTHING RETURNING id;`,
          [studyId]
        );
        // If the country already existed, we need to select its ID
        const countryId =
          countryRes.rows.length > 0
            ? countryRes.rows[0].id
            : (
                await client.query(
                  'SELECT id FROM study_countries WHERE study_id = $1 AND country_iso_code = $2',
                  [studyId, 'US']
                )
              ).rows[0].id;
        console.log(`   -> Ensured Country ID: ${countryId}`);

        const siteRes = await client.query(
          `INSERT INTO study_sites (country_id, site_code) VALUES ($1, 'MIG-SITE-001') ON CONFLICT (country_id, site_code) DO NOTHING RETURNING id;`,
          [countryId]
        );
        const siteId =
          siteRes.rows.length > 0
            ? siteRes.rows[0].id
            : (
                await client.query(
                  'SELECT id FROM study_sites WHERE country_id = $1 AND site_code = $2',
                  [countryId, 'MIG-SITE-001']
                )
              ).rows[0].id;
        console.log(`   -> Ensured Site ID: ${siteId}`);

        // B. Create the TMF artifact record
        const artifactRes = await client.query(
          `INSERT INTO tmf_artifacts (site_id, tmf_zone, tmf_section, artifact_type) VALUES ($1, 1, 101, $2) RETURNING id;`,
          [siteId, doc.type]
        );
        const artifactId = artifactRes.rows[0].id;
        console.log(`   -> Created Artifact ID: ${artifactId}`);

        // C. Create the central document shadow record
        const docClassRes = await client.query(
          `SELECT id FROM doc_class_lookup WHERE class_name = $1`,
          [doc.type]
        );
        const docClassId =
          docClassRes.rows.length > 0
            ? docClassRes.rows[0].id
            : (await client.query(`SELECT id FROM doc_class_lookup WHERE class_name = 'General'`))
                .rows[0].id;

        await client.query(
          `INSERT INTO documents (tenant_id, object_id, object_type, doc_class_id, status, effective_date) VALUES ($1, $2, 'tmf_artifacts', $3, $4, $5);`,
          [doc.organization_id, artifactId, docClassId, doc.status, doc.date]
        );
        console.log(`   -> Created central document record.`);

        await client.query('COMMIT');
        console.log(`✅ Migration successful for document ID: ${doc.id}`);
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(
          `❌ Migration failed for document ID: ${doc.id}. Rolling back transaction.`,
          e.message
        );
      }
    }

    console.log('\n🎉 Data migration script finished.');
  } catch (err) {
    console.error('A critical error occurred during the migration process:', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrateData();
