/**
 * The embedded schema this suite's recovery cases run against.
 *
 * Split out of data-room-processing-recovery.pglite.integration.test.ts, which
 * sat at exactly the 500-line max-lines ceiling: the one import the audit
 * fixture needed crossed it, and the ESLint warning ratchet refuses a changed
 * file that gains a warning. Scaffolding is the right half to move — the
 * assertions are what the suite is about.
 *
 * audit_logs comes from AUDIT_LOGS_PGLITE_DDL, the canonical set, not a
 * hand-written subset. writeChainedAuditRow writes 17 columns and the audit row
 * commits with the mutation or neither does, so a fixture missing one does not
 * skip the log — it ROLLS THE MUTATION BACK, and a suite built on such a
 * fixture can only stay green by never reaching a governed write
 * (ci:audit-logs-fixture).
 */
import fs from 'node:fs';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';

/** Applied in order; each is read from the repo, not restated here. */
const MIGRATIONS = [
  'db/migrations/20260724_clinical_regulatory_evidence_spine.sql',
  'migrations/20260726_cre_source_program_scope.sql',
  'migrations/20260829_cre_source_versioning.sql',
  'migrations/20260906_vault_documents_fulltext.sql',
  'migrations/20261008c_data_room_source_text.sql',
  'migrations/20261001_cre_evidence_sources_capture_immutability.sql',
  'migrations/20261008d_cre_source_study_ref.sql',
  'migrations/20261006_document_data_dispositions.sql',
];

/** The tables the processing path reads, then the real migrations on top. */
export async function bootstrapRecoverySchema(db: { exec: (sql: string) => Promise<unknown> }): Promise<void> {
  await db.exec(`CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY,organization_id integer,program_id uuid,content_hash text,document_title text,file_name text,extracted_text text,deleted_at timestamptz);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz,product_name text,indication text,phase text,program_type text,application_number text,primary_agency text);
    CREATE TABLE projects(id serial PRIMARY KEY,organization_id integer,regulatory_program_id uuid,client_workspace_id integer,status text DEFAULT 'active');
    CREATE TABLE file_uploads (id text PRIMARY KEY,organization_id integer,user_id integer,original_name text,mime_type text,file_size bigint,storage_path text,checksum_sha256 text,status text);
    ${AUDIT_LOGS_PGLITE_DDL}
  `);
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8'));
  }
}
