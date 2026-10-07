/**
 * Actual SQL + transaction tests. PGlite proves snapshot arithmetic, scope,
 * token freshness and rollback; it does not model two concurrent connections.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  createDocumentDispositionService,
  type DispositionAuditEntry,
  type DispositionApplyInput,
  type DispositionQueryable,
} from '../service';

let orgCounter = 1000;
const HASH = 'a'.repeat(64);
const NEXT_HASH = 'd'.repeat(64);
export const DISPOSITION_TEST_CLOCK = new Date('2026-10-06T17:00:00.000Z');
const SECRET = 'document-disposition-test-secret-at-least-32-characters';
const migration = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../migrations/20261006_document_data_dispositions.sql'), 'utf8',
);

const DDL = `
  CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL, lead_user_id integer, deleted_at timestamptz);
  CREATE TABLE cre_evidence_sources (
    id serial PRIMARY KEY, organization_id integer NOT NULL, client_program_id uuid,
    source_type text, title text, checksum text, extraction_status text, ingestion_status text,
    previous_version_id integer, provenance jsonb, metadata jsonb, is_current boolean,
    deleted_at timestamptz, updated_at timestamptz DEFAULT now()
  );
  CREATE SCHEMA vault;
  CREATE TABLE vault.documents (
    id uuid PRIMARY KEY, organization_id integer, program_id uuid, document_title text,
    content_hash text, processing_status text, extracted_text text, supersedes_id uuid,
    retention_until date, deleted_at timestamptz, updated_at timestamptz DEFAULT now()
  );
  CREATE TABLE file_uploads (id text PRIMARY KEY, organization_id integer NOT NULL, checksum_sha256 text, storage_path text, status text);
  CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, regulatory_program_id uuid);
  CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer,
    artifact_id text, content_hash text, content text, status text, metadata json);
  CREATE TABLE lumen_data_atoms (id serial PRIMARY KEY, organization_id integer NOT NULL,
    source_type text, source_id text, structured_data json, status text, content text);
  CREATE TABLE vault.document_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid, chunk_text text);
  CREATE TABLE rag_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL, document_id text);
  CREATE TABLE rag_chunks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid, content text);
  CREATE TABLE vault.document_catalog (document_id uuid PRIMARY KEY, key_data jsonb, content_hash CHAR(64) NOT NULL);
  CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id integer, status text, approved_at timestamptz, frozen_at timestamptz, locked_at timestamptz,
    client_program_id uuid, provenance jsonb);
  CREATE TABLE authoring_sections (id uuid PRIMARY KEY, doc_id uuid, tenant_id integer);
  CREATE TABLE authoring_citations (id uuid PRIMARY KEY, section_id uuid, tenant_id integer, source text, reference_id text);
  CREATE TABLE c2c_documents (id text PRIMARY KEY, org_id integer, project_id uuid, status text);
  CREATE TABLE c2c_document_sections (id bigserial PRIMARY KEY, document_id text, status text);
  CREATE TABLE cmc_source_evidence (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, program_id uuid, vault_document_id uuid, unlinked_at timestamptz);
  CREATE TABLE governed_dependencies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, project_id integer, source_type text, source_id text);
  CREATE TABLE vault.evidence_citations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_document_id uuid, evidence_document_id uuid);
  CREATE TABLE document_span_lineage (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, document_table text, document_id text, source text, reference_id text);
  CREATE TABLE vault.legal_holds (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer, program_id uuid, document_id uuid, lifted_at timestamptz);
  CREATE TABLE canonical_documents (canonical_id text PRIMARY KEY, organization_id integer, source_refs jsonb, stage text);
  CREATE TABLE test_disposition_audit (id uuid PRIMARY KEY, organization_id integer NOT NULL, entry jsonb NOT NULL);
`;

function poolFor(pg: PGlite) {
  const db = {
    query: async (sql: string, params?: unknown[]) => ({ rows: (await pg.query(sql, params)).rows }),
    connect: async () => ({ query: db.query, release: () => undefined }),
  };
  return db;
}


export async function createDispositionHarness() {
  const pg = new PGlite();
  const db = poolFor(pg);
  await pg.exec(DDL);
  await pg.exec(migration);
  await pg.exec(migration);
  async function seed(options: { enabled?: boolean; auditFails?: boolean; invalidAudit?: boolean; auditInput?: (entry: DispositionAuditEntry) => void } = {}) {
    const org = ++orgCounter;
    const program = randomUUID();
    const vault = randomUUID();
    const upload = randomUUID();
    const artifactNativeId = randomUUID();
    let currentTime = new Date(DISPOSITION_TEST_CLOCK);
    await pg.query('INSERT INTO regulatory_programs VALUES ($1,$2,42,NULL)', [program, org]);
    await pg.query('INSERT INTO file_uploads VALUES ($1,$2,$3,$4,\'processed\')', [upload, org, HASH, `uploads/org-${org}/${upload}.pdf`]);
    const capture = (await pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
      (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,provenance,metadata,is_current)
      VALUES ($1,$2,'client_document','Captured study.pdf',$3,'extracted','ingested',$4,'{}',true) RETURNING id`,
    [org, program, HASH, JSON.stringify({ fileUploadId: upload })])).rows[0].id;
    await pg.query(`INSERT INTO vault.documents (id,organization_id,program_id,document_title,content_hash,processing_status,extracted_text,retention_until)
      VALUES ($1,$2,$3,'Study PDF',$4,'INDEXED','Extracted study values','2030-12-31')`, [vault, org, program, HASH]);
    const project = (await pg.query<{ id: number }>('INSERT INTO projects (organization_id,regulatory_program_id) VALUES ($1,$2) RETURNING id', [org, program])).rows[0].id;
    const artifact = (await pg.query<{ id: number }>(`INSERT INTO concept2cure_artifacts
      (organization_id,project_id,artifact_id,content_hash,content,status,metadata)
      VALUES ($1,$2,$3,$4,'Extracted authored rendition','draft',$5) RETURNING id`,
    [org, project, artifactNativeId, 'e'.repeat(64), JSON.stringify({ fileId: upload })])).rows[0].id;
    await pg.query(`INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,structured_data,status,content)
      VALUES ($1,'chat_upload',$2,'{}','active','Study endpoint'),($1,'vault_document',$3,'{}','active','Study duration'),
        ($1,'artifact',$4,'{}','active','Study population')`, [org, `cre_source:${capture}`, vault, String(artifact)]);
    // tenant-isolation-safe: isolated PGlite fixture; the parent Vault document was just seeded for this fixture organization/program and exact ID.
    await pg.query('INSERT INTO vault.document_chunks (document_id,chunk_text) VALUES ($1,\'Page one\')', [vault]);
    const ragDocument = (await pg.query<{ id: string }>('INSERT INTO rag_documents (organization_id,document_id) VALUES ($1,$2) RETURNING id', [org, String(artifact)])).rows[0].id;
    // tenant-isolation-safe: isolated PGlite fixture; ragDocument is the ID returned by the immediately preceding INSERT with this fixture organization.
    await pg.query('INSERT INTO rag_chunks (document_id,content) VALUES ($1,\'Authored extract\')', [ragDocument]);
    await pg.query('INSERT INTO vault.document_catalog (document_id,key_data,content_hash) VALUES ($1,$2,$3)', [vault, JSON.stringify({ population: '40', endpoint: 'change' }), HASH]);
    await pg.query('INSERT INTO authoring_citations (id,tenant_id,source,reference_id) VALUES ($1,$2,\'cre_evidence_source\',$3)', [randomUUID(), org, String(capture)]);
    await pg.query('INSERT INTO vault.evidence_citations (source_document_id,evidence_document_id) VALUES ($1,$1)', [vault]);
    await pg.query('INSERT INTO document_span_lineage (organization_id,source,reference_id) VALUES ($1,\'cre_evidence_source\',$2)', [org, String(capture)]);
    const audit = async (q: DispositionQueryable, entry: DispositionAuditEntry) => {
      const id = randomUUID();
      options.auditInput?.(entry);
      await q.query('INSERT INTO test_disposition_audit VALUES ($1,$2,$3)', [id, org, JSON.stringify(entry)]);
      if (options.auditFails) throw new Error('Audit chain storage failed');
      return { id: options.invalidAudit ? 'invalid' : id, sha256Chain: 'f'.repeat(64) };
    };
    const service = createDocumentDispositionService({ db, audit, enabled: () => options.enabled !== false, tokenSecret: SECRET, clock: () => currentTime });
    const scope = { organizationId: org, programId: program, actorId: 42, orgRole: 'manager', targetType: 'captured_source' as const, targetId: String(capture) };
    return {
      pg, db, org, program, vault, upload, artifact, artifactNativeId, capture, service, scope,
      advance: (ms: number) => { currentTime = new Date(currentTime.getTime() + ms); },
      apply: async (choice: DispositionApplyInput['choice'] = 'keep_data', extra: Partial<DispositionApplyInput> = {}) => {
        const preview = await service.preview({ ...scope, ...extra });
        return service.apply({ ...scope, choice, reason: 'PDF removed after verified extraction', previewToken: preview.previewToken, ...extra });
      },
      records: async () => (await pg.query('SELECT * FROM document_data_dispositions WHERE organization_id=$1', [org])).rows,
      audits: async () => (await pg.query('SELECT * FROM test_disposition_audit WHERE organization_id=$1', [org])).rows,
    };
  }

  return { pg, db, seed, close: () => pg.close() };
}

export type DispositionHarness = Awaited<ReturnType<typeof createDispositionHarness>>;
export type DispositionFixture = Awaited<ReturnType<DispositionHarness['seed']>>;

export async function insertCapturedSuccessor(f: DispositionFixture, previous = f.capture) {
  const id = (await f.pg.query<{ id: number }>(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,extraction_status,ingestion_status,previous_version_id,provenance,metadata,is_current)
    VALUES ($1,$2,'client_document','Replacement study.pdf',$3,'verified','ingested',$4,'{}','{}',true) RETURNING id`, [f.org, f.program, NEXT_HASH, previous])).rows[0].id;
  await f.pg.query(`INSERT INTO lumen_data_atoms (organization_id,source_type,source_id,structured_data,status,content)
    VALUES ($1,'chat_upload',$2,'{}','active','Verified replacement endpoint')`, [f.org, `cre_source:${id}`]);
  return String(id);
}

export async function insertVaultSuccessor(f: DispositionFixture, previous = f.vault) {
  const id = randomUUID();
  await f.pg.query(`INSERT INTO vault.documents
    (id,organization_id,program_id,document_title,content_hash,processing_status,extracted_text,supersedes_id)
    VALUES ($1,$2,$3,'Replacement study.pdf',$4,'INDEXED','Verified replacement endpoint',$5)`,
  [id, f.org, f.program, NEXT_HASH, previous]);
  return id;
}
