import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readEvaluationDocument, verifyEvaluationScope, type GuidanceEntry } from '../qualification-corpus.js';

// Real PostgreSQL SQL over a minimal in-memory schema, not a provider/corpus qualification.
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const PROGRAM_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROGRAM_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc';
const PROGRAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbd';
const PROGRAM_DELETED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe';
const DOCUMENT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hash = 'a'.repeat(64);
const entry: GuidanceEntry = {
  document_code: 'FIXTURE', version: 'revision-1', versionScheme: 'fixture', role: 'answer-source',
  verified: true, versionVerified: true, sourceUrl: 'https://example.test/fixture', date: '2026-10-06', sha256: hash,
};
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, uuid uuid UNIQUE);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_code text, version text, content_hash text, deleted_at timestamptz);
    CREATE TABLE vault.document_chunks (id uuid PRIMARY KEY, document_id uuid, embedding text);
    INSERT INTO organizations VALUES (1, '${ORG_A}'), (2, '${ORG_B}');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM_A}',1,NULL), ('${PROGRAM_OTHER}',1,NULL),
      ('${PROGRAM_B}',2,NULL), ('${PROGRAM_DELETED}',1,now());
    INSERT INTO vault.documents VALUES
      ('${DOCUMENT_A}', '${PROGRAM_A}', 1, 'FIXTURE', 'revision-1', '${hash}', NULL),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccd', '${PROGRAM_OTHER}', 1, 'FIXTURE', 'revision-1', '${hash}', NULL),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccce', '${PROGRAM_B}', 2, 'FIXTURE', 'revision-1', '${hash}', NULL),
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccf', '${PROGRAM_A}', 1, 'DELETED-DOC', 'revision-1', '${hash}', now()),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccd0', '${PROGRAM_DELETED}', 1, 'FIXTURE', 'revision-1', '${hash}', NULL),
      ('cccccccc-cccc-4ccc-8ccc-ccccccccccd1', '${PROGRAM_A}', 1, 'FIXTURE', 'revision-2', '${hash}', NULL);
    INSERT INTO vault.document_chunks VALUES
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '${DOCUMENT_A}', '[1]'),
      ('dddddddd-dddd-4ddd-8ddd-ddddddddddde', 'cccccccc-cccc-4ccc-8ccc-cccccccccccf', '[1]'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddf', 'cccccccc-cccc-4ccc-8ccc-ccccccccccd0', '[1]');
    ALTER TABLE regulatory_programs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE regulatory_programs FORCE ROW LEVEL SECURITY;
    CREATE POLICY fixture_program_tenant ON regulatory_programs USING
      (organization_id = nullif(current_setting('app.current_tenant_id',true),'')::integer);
    ALTER TABLE vault.documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE vault.documents FORCE ROW LEVEL SECURITY;
    CREATE POLICY fixture_document_tenant ON vault.documents USING
      (organization_id = nullif(current_setting('app.current_tenant_id',true),'')::integer AND
       organization_id IN (SELECT id FROM organizations WHERE uuid = nullif(current_setting('app.current_org_id',true),'')::uuid));
    CREATE ROLE fixture_eval_reader;
    GRANT USAGE ON SCHEMA public, vault TO fixture_eval_reader;
    GRANT SELECT ON ALL TABLES IN SCHEMA public, vault TO fixture_eval_reader;
    SET ROLE fixture_eval_reader;
  `);
}, 60000);
afterAll(async () => { await db?.close(); });

function pool() {
  return {
    connect: async () => ({
      query: (sql: string, values?: unknown[]) => db.query(sql, values),
      release: () => undefined,
    }),
  };
}

describe('reviewed source SQL on the actual schema shape', () => {
  it('resolves only the exact organization/programme/version despite neighboring valid sources', async () => {
    const result = await readEvaluationDocument(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_A }, entry);
    expect(result).toEqual({ documentId: DOCUMENT_A, contentHash: hash, embedded: true });
  });
  it('refuses another tenant programme even when its source key and hash match', async () => {
    await expect(readEvaluationDocument(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_B }, entry)).rejects.toThrow(/0 accessible/);
  });
  it('refuses a soft-deleted document with otherwise correct binding and embedded chunks', async () => {
    await expect(readEvaluationDocument(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_A }, { ...entry, document_code: 'DELETED-DOC' })).rejects.toThrow(/0 accessible/);
  });
  it('refuses a live source whose evaluation programme is soft-deleted', async () => {
    await expect(readEvaluationDocument(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_DELETED }, entry)).rejects.toThrow(/0 accessible/);
  });
  it('verifies the real id/UUID/live-programme binding before source-less controls', async () => {
    await expect(verifyEvaluationScope(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_A })).resolves.toBeUndefined();
    await expect(verifyEvaluationScope(pool() as never, { organizationId: 2, organizationUuid: ORG_A, programId: PROGRAM_A })).rejects.toThrow(/could not be verified/);
    await expect(verifyEvaluationScope(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_B })).rejects.toThrow(/could not be verified/);
    await expect(verifyEvaluationScope(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_DELETED })).rejects.toThrow(/could not be verified/);
  });
  it('leaves no integer/UUID session context after its read-only transaction', async () => {
    await readEvaluationDocument(pool() as never, { organizationId: 1, organizationUuid: ORG_A, programId: PROGRAM_A }, entry);
    const result = await db.query<{ visible: number }>('SELECT count(*)::integer AS visible FROM vault.documents');
    expect(result.rows[0].visible).toBe(0);
  });
});
