/** Shared isolated PGlite fixture for saved-document writing and template oversight.
 * SQL executes in WASM Postgres. Audit rows are mutable solely for corruption
 * probes; canonical migration tests separately verify production immutability. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import type { WithTenantConnectionOptions } from '../../../db/withTenantConnection';
import type { ToolContext } from '../AnaToolExecutor';
import { critiqueSavedDocument } from '../saved-document-critique';

export const PROGRAM = '11111111-2222-4333-8444-000000000011';
export const OTHER_PROGRAM = '11111111-2222-4333-8444-000000000012';
export const FOREIGN_PROGRAM = '11111111-2222-4333-8444-000000000021';
export const DOCUMENT = '11111111-2222-4333-8444-000000000041';
export const OTHER_DOCUMENT = '11111111-2222-4333-8444-000000000042';
export const FOREIGN_DOCUMENT = '11111111-2222-4333-8444-000000000051';
export const sectionId = (n: number) => `22222222-2222-4333-8444-${String(n).padStart(12, '0')}`;
export const METHODS = 'Enrolled: 186 subjects were treated according to the protocol.';
export const RESULTS = 'Efficacy was assessed in all subjects (enrolled = 184) per the SAP.';
export const COHERENT = 'The protocol specified the study procedures.';
export const context: ToolContext = { organizationId: 7, userId: 7, projectRef: PROGRAM };
export interface ReviewItem {
  kind: string;
  sectionId?: string;
  title?: string;
  finding?: { category: string; message: string; evidence: string[] };
}
export interface ReviewPage {
  error?: string;
  complete?: boolean;
  documentId?: string;
  snapshotSha256?: string;
  documentScore?: number;
  precisionVerdict?: string;
  verdict?: string;
  coverage?: { sectionCount: number; textChars: number; pendingInsertions: number; pendingDeletions: number; citationGaps: number };
  pagination?: { offset: number; shown: number; total: number; nextOffset: number | null };
  items?: ReviewItem[];
  template?: { id: string | null; sourceState: 'recorded' | 'not-recorded'; kind?: string; aiDraftable?: boolean };
}

export let pg: PGlite;
export const statements: string[] = [];
export const connections: WithTenantConnectionOptions[] = [];
export const connection = async (opts: WithTenantConnectionOptions, fn: (q: RequestSqlClient) => Promise<string>) => {
  connections.push(opts);
  return fn({ query: async (sql, params) => {
    statements.push(sql);
    return pg.query<Record<string, unknown>>(sql, params);
  } });
};

export async function review(input: Record<string, unknown> = {}, ctx: ToolContext | undefined = context) {
  const raw = await critiqueSavedDocument({ document_id: DOCUMENT, ...input }, ctx, connection);
  expect(raw.length).toBeLessThanOrEqual(5000);
  const parsed: unknown = JSON.parse(raw);
  expect(parsed).toBeTypeOf('object');
  return parsed as ReviewPage;
}

export async function denied(input: Record<string, unknown> = {}, ctx: ToolContext | undefined = context) {
  const result = await review(input, ctx);
  expect(result.error).toBeTypeOf('string');
  expect(result.complete).toBe(false);
  expect(result.documentScore).toBeUndefined();
  expect(result.precisionVerdict).toBeUndefined();
  expect(result.verdict).toBeUndefined();
  expect(result.items).toBeUndefined();
  return result;
}

export async function replaceSections(count: number, text = COHERENT) {
  await pg.query('DELETE FROM authoring_sections WHERE doc_id=$1', [DOCUMENT]);
  await pg.query(`INSERT INTO authoring_sections(id,doc_id,tenant_id,code,title,order_index,created_at,updated_at,content)
    SELECT ('22222222-2222-4333-8444-' || lpad(n::text,12,'0'))::uuid,$1,7,n::text,
      'Saved section ' || n::text,n,'2026-10-01','2026-10-02',$2 FROM generate_series(1,$3::int) n`, [DOCUMENT, text, count]);
}

export async function walkPages() {
  const first = await review();
  expect(first.error).toBeUndefined();
  expect(first.complete).toBe(true);
  expect(first.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
  const pages = [first];
  const items = [...(first.items ?? [])];
  let next = first.pagination?.nextOffset;
  while (next !== null && next !== undefined && pages.length < 600) {
    const page = await review({ offset: next, expected_snapshot: first.snapshotSha256 });
    expect(page.error).toBeUndefined();
    expect(page.snapshotSha256).toBe(first.snapshotSha256);
    expect(page.documentScore).toBe(first.documentScore);
    expect(page.coverage).toEqual(first.coverage);
    expect(page.pagination?.offset).toBe(next);
    expect(page.pagination?.shown).toBe(page.items?.length);
    expect(page.pagination?.total).toBe(first.pagination?.total);
    items.push(...(page.items ?? []));
    pages.push(page);
    next = page.pagination?.nextOffset;
  }
  expect(next).toBeNull();
  expect(items).toHaveLength(first.pagination?.total ?? -1);
  return { first, pages, items };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,client_workspace_id int,
      regulatory_program_id uuid,owner_id int,created_by_id int,settings jsonb,status text DEFAULT 'active');
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE users(id int PRIMARY KEY,status text,email text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(reviewer_id int,organization_id int,artifact_id uuid,status text);
    CREATE TABLE concept2cure_artifacts(id uuid PRIMARY KEY,project_id int,organization_id int,
      artifact_id text,metadata jsonb DEFAULT '{}');
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id int,client_program_id uuid,
      title text,module text,product_code text,status text,created_by text,updated_at timestamptz,template_id uuid,provenance jsonb);
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,tenant_id int,code text,title text,
      order_index int,created_at timestamptz,updated_at timestamptz,content text);
    CREATE TABLE doc_permissions(id uuid DEFAULT gen_random_uuid(),doc_id uuid,section_id uuid,tenant_id int,
      principal_id text,email text,role text,valid_from timestamptz DEFAULT now(),valid_until timestamptz,revoked_at timestamptz);
    CREATE TABLE cre_evidence_sources(id int PRIMARY KEY,organization_id int,client_program_id uuid,title text,
      sponsor text,source_type text,document_date date,source_record_identifier text,trial_registry_identifier text,
      application_number text,checksum text,provenance jsonb,is_current boolean,deleted_at timestamptz,
      visibility_class text NOT NULL DEFAULT 'tenant_private',client_workspace_id integer,metadata jsonb DEFAULT '{}');
    CREATE TABLE authoring_citations(id uuid DEFAULT gen_random_uuid(),section_id uuid,tenant_id int,source text,reference_id text);
    CREATE TABLE document_data_dispositions(organization_id int,program_id uuid,captured_source_id int,
      source_sha256 text,linked_ids jsonb,choice text);
    CREATE TABLE file_uploads(id text PRIMARY KEY,organization_id int,checksum_sha256 text,storage_path text,user_id integer);
    CREATE TABLE authoring_audit_trail(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),doc_id uuid,section_id uuid,
      tenant_id int,operation_type text,actor_email text,metadata jsonb,created_at timestamptz DEFAULT now());
    CREATE TABLE template_guidance(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,tenant_id int,
      section_name text NOT NULL,section_code text,guidance_text text,examples jsonb,regulatory_references jsonb,
      ai_prompts jsonb,compliance_checklist jsonb,created_at timestamp DEFAULT now(),updated_at timestamp DEFAULT now());
    CREATE SCHEMA intelligence;
    CREATE TABLE intelligence.document_templates(id uuid PRIMARY KEY,status text);
    CREATE TABLE intelligence.template_sections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,
      section_code text,section_title text,ordering int,content_guidance text,required_elements jsonb,source_reference text);
  `);
  // Keep the audit fixture writable by the canonical chained-audit writer,
  // even though saved-document review itself is a read-only operation.
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
}, 90_000);

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE regulatory_programs,projects,organization_users,users,organizations,project_visibility_settings,
      project_members,concept2cure_review_assignments,concept2cure_artifacts,authoring_documents,authoring_sections,doc_permissions,
      cre_evidence_sources,authoring_citations,document_data_dispositions,file_uploads,audit_logs,
      authoring_audit_trail,template_guidance,intelligence.document_templates,intelligence.template_sections;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(6,'active','owner@example.test'),(7,'active','reviewer@example.test'),(8,'active','outsider@example.test');
    INSERT INTO organization_users VALUES(7,6,'member'),(7,7,'readonly'),(7,8,'member');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL),('${OTHER_PROGRAM}',7,NULL),('${FOREIGN_PROGRAM}',8,NULL);
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',6,6,'{}'),(12,7,71,'${OTHER_PROGRAM}',6,6,'{}'),
      (21,8,81,'${FOREIGN_PROGRAM}',6,6,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(21,8,'private');
    INSERT INTO project_members VALUES(11,7,7,'use','active'),(12,7,7,'use','active');
    INSERT INTO authoring_documents(id,tenant_id,client_program_id,title,module,product_code,status,created_by,updated_at)
      VALUES('${DOCUMENT}',7,'${PROGRAM}','Saved study report','5','DRUG','DRAFT','6','2026-10-02'),
      ('${OTHER_DOCUMENT}',7,'${OTHER_PROGRAM}','Other private report','5','DRUG','DRAFT','6','2026-10-02'),
      ('${FOREIGN_DOCUMENT}',8,'${FOREIGN_PROGRAM}','Foreign private report','5','DRUG','DRAFT','6','2026-10-02');
    INSERT INTO doc_permissions(doc_id,tenant_id,principal_id,role) VALUES('${DOCUMENT}',7,'7','VIEWER');
  `);
  await replaceSections(2);
  await pg.query('UPDATE authoring_sections SET title=$1,content=$2 WHERE id=$3', ['Methods', METHODS, sectionId(1)]);
  await pg.query('UPDATE authoring_sections SET title=$1,content=$2 WHERE id=$3', ['Results', RESULTS, sectionId(2)]);
  statements.length = 0;
  connections.length = 0;
});
afterAll(async () => { await pg?.close(); });
