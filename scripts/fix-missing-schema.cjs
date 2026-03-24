/**
 * Migration: Fix all missing tables and columns
 * Date: 2026-03-23
 */
try {
  require('dotenv').config();
} catch {}
const { Pool } = require('@neondatabase/serverless');
const connStr = process.env.DATABASE_URL;
if (!connStr) {
  console.error('No DATABASE_URL');
  process.exit(1);
}
const pool = new Pool({ connectionString: connStr });

const statements = [
  // 1. organizations: add display_name, legal_name, industry_mode
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS display_name TEXT`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legal_name TEXT`,
  `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry_mode TEXT DEFAULT 'biotech'`,

  // 2. cer_exports: add export_type
  `ALTER TABLE cer_exports ADD COLUMN IF NOT EXISTS export_type TEXT`,

  // 3. ind_projects: add submission_type
  `ALTER TABLE ind_projects ADD COLUMN IF NOT EXISTS submission_type TEXT`,

  // 4. projects: add submission_type
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS submission_type TEXT`,

  // 5. file_uploads table
  `CREATE TABLE IF NOT EXISTS file_uploads (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER,
    organization_id INTEGER,
    original_name TEXT,
    original_filename TEXT,
    filename TEXT,
    file_name TEXT,
    mime_type TEXT,
    file_size INTEGER,
    storage_path TEXT,
    status TEXT DEFAULT 'uploaded',
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 6. artifacts view over concept2cure_artifacts
  `CREATE OR REPLACE VIEW artifacts AS
    SELECT
      id,
      type,
      title,
      status,
      project_id,
      organization_id AS org_id,
      created_at
    FROM concept2cure_artifacts`,

  // 7. ivdr_classifications (parent table needed for FK)
  `CREATE TABLE IF NOT EXISTS ivdr_classifications (
    id SERIAL PRIMARY KEY,
    device_name TEXT,
    classification_rule TEXT,
    risk_class VARCHAR(10),
    organization_id INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  )`,

  // 8. ivdr_analytical_validations
  `CREATE TABLE IF NOT EXISTS ivdr_analytical_validations (
    id SERIAL PRIMARY KEY,
    classification_id INTEGER REFERENCES ivdr_classifications(id),
    device_name TEXT NOT NULL DEFAULT '',
    analyte_name TEXT NOT NULL DEFAULT '',
    validation_type VARCHAR(50) DEFAULT 'quantitative',
    status VARCHAR(30) DEFAULT 'in_progress',
    validation_status VARCHAR(30) DEFAULT 'pending',
    lod NUMERIC,
    loq NUMERIC,
    precision_cv NUMERIC,
    within_run_cv NUMERIC,
    between_run_cv NUMERIC,
    between_day_cv NUMERIC,
    reproducibility_cv NUMERIC,
    interference_study JSONB,
    stability JSONB,
    sensitivity NUMERIC,
    specificity NUMERIC,
    linearity JSONB,
    accuracy NUMERIC,
    carry_over NUMERIC,
    hook_effect JSONB,
    reference_range JSONB,
    organization_id INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  )`,

  // 9. authoring_export_history
  `CREATE TABLE IF NOT EXISTS authoring_export_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id VARCHAR(255) NOT NULL,
    export_type VARCHAR(50) NOT NULL DEFAULT 'DOCX',
    exported_by VARCHAR(255),
    exported_at TIMESTAMPTZ DEFAULT NOW(),
    file_name VARCHAR(500),
    file_size INTEGER,
    doc_sha256 VARCHAR(64),
    metadata JSONB,
    download_url TEXT,
    cached_until TIMESTAMPTZ,
    tenant_id INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

async function run() {
  let success = 0;
  let failed = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      success++;
      const label = stmt.substring(0, 65).replace(/\s+/g, ' ').trim();
      console.log('OK:', label);
    } catch (e) {
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        console.log('SKIP (exists):', stmt.substring(0, 50));
        success++;
      } else {
        console.log('FAIL:', e.message.substring(0, 80));
        console.log('  SQL:', stmt.substring(0, 60));
        failed++;
      }
    }
  }
  console.log(`\n=== Migration complete: ${success} succeeded, ${failed} failed ===`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run();
