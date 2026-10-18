/**
 * Shared PGlite setup for the AnA authoring-tool integration suites
 * (draft-authoring-document-tool, save-document-to-vault-tool). The vi.mock
 * hoisting stays in each suite; what is shared is the schema they build and
 * the counts they compare.
 */
import { ORG } from '../../../../routes/__tests__/_authoring-canvas-fixture';

/** TEST-ONLY impact-store prerequisites, matching disposition-fixture.ts.
 * Authoring and catalog tables still use their canonical migrations below.
 * These empty stores let the REAL withdrawal preview/apply read and lock its
 * complete impact, without bypassing scope, authorization, audit or locking.
 */
export const DISPOSITION_IMPACT_PREREQ = `
  ALTER TABLE regulatory_programs ADD COLUMN lead_user_id INTEGER;
  ALTER TABLE c2c_documents ADD COLUMN status TEXT;
  CREATE TABLE cre_evidence_sources (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, client_program_id UUID,
    source_type TEXT, title TEXT, checksum TEXT, extraction_status TEXT, ingestion_status TEXT,
    previous_version_id INTEGER, provenance JSONB, metadata JSONB, is_current BOOLEAN,
    deleted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE file_uploads (id TEXT PRIMARY KEY, organization_id INTEGER NOT NULL,
    checksum_sha256 TEXT, storage_path TEXT, status TEXT);
  CREATE TABLE concept2cure_artifacts (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    project_id INTEGER, artifact_id TEXT, content_hash TEXT, content TEXT, status TEXT, metadata JSON);
  CREATE TABLE lumen_data_atoms (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL,
    source_type TEXT, source_id TEXT, structured_data JSON, status TEXT, content TEXT);
  CREATE TABLE vault.document_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID, chunk_text TEXT);
  CREATE TABLE rag_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id INTEGER NOT NULL, document_id TEXT);
  CREATE TABLE rag_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID, content TEXT);
  CREATE TABLE c2c_document_sections (id BIGSERIAL PRIMARY KEY, document_id TEXT, status TEXT);
  CREATE TABLE cmc_source_evidence (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id INTEGER,
    program_id UUID, vault_document_id UUID, unlinked_at TIMESTAMPTZ);
  CREATE TABLE governed_dependencies (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id INTEGER,
    project_id INTEGER, source_type TEXT, source_id TEXT);
  CREATE TABLE vault.evidence_citations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_document_id UUID, evidence_document_id UUID);
  CREATE TABLE vault.legal_holds (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id INTEGER,
    program_id UUID, document_id UUID, lifted_at TIMESTAMPTZ);
  CREATE TABLE canonical_documents (canonical_id TEXT PRIMARY KEY, organization_id INTEGER, source_refs JSONB, stage TEXT);
  CREATE TABLE test_disposition_audit (id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, entry JSONB NOT NULL);
`;

/** The canonical migrations the authoring tools write through, in apply order. */
export const AUTHORING_TOOL_MIGRATIONS: readonly string[] = [
  'db/migrations/20260725_authoring_document_loop_tables.sql',
  'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
  'db/migrations/20260725_authoring_audit_trail.sql',
  'db/migrations/20260813_audit_tamper_proof_log.sql',
  'db/migrations/20260725_authoring_signatures_and_workflow.sql',
  'db/migrations/20260725_authoring_signature_freeze_binding.sql',
  'db/migrations/20260730_authoring_runtime_ddl.sql',
  'db/migrations/20260730_authoring_comments_router_columns.sql',
  'db/migrations/20260727_authoring_object_permissions.sql',
  'db/migrations/20260803_document_span_lineage.sql',
  'migrations/20260907_span_lineage_accepted_machine_draft.sql',
  'migrations/20260908_span_lineage_machine_draft.sql',
  'migrations/20260728_authoring_comments_threading.sql',
  'migrations/20260727_authoring_document_program_scope.sql',
  'migrations/20260728_authoring_document_governed_binding.sql',
  'migrations/20260814d_document_alias_map.sql',
  'migrations/20260921_audit_logs_chain_seq.sql',
  'migrations/20260921_authoring_document_provenance.sql',
  'migrations/20260905_document_catalog.sql',
  'migrations/20261008e_document_catalog_attribution.sql',
  'migrations/20261006_document_data_dispositions.sql',
];

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> };

/** Rows of the authoring store for ORG: documents, sections, revisions, CREATE audit rows. */
export async function authoringCountsOn(pool: Queryable) {
  const result = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM authoring_documents WHERE tenant_id=$1) AS documents,
    (SELECT COUNT(*)::int FROM authoring_sections WHERE tenant_id=$1) AS sections,
    (SELECT COUNT(*)::int FROM doc_revisions WHERE tenant_id=$1) AS revisions,
    (SELECT COUNT(*)::int FROM authoring_audit_trail WHERE tenant_id=$1 AND operation_type='CREATE') AS creates`, [ORG]);
  return result.rows[0] as { documents: number; sections: number; revisions: number; creates: number };
}
