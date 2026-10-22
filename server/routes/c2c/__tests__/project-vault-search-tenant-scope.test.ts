/**
 * The vault full-text search must carry its tenant boundary IN the statement.
 *
 * Actual parent admission and the count/page SQL execute on a synthetic PGlite
 * database. The recorded document tenant and its parent program tenant must
 * both match. Canonical accessible programs are bound before count and LIMIT.
 */
import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

const io = vi.hoisted(() => ({ query: vi.fn() }));
const queries: Array<{ sql: string; params: unknown[] }> = [];
vi.mock('../../../db.js', () => ({ pool: { query: io.query } }));

import express from 'express';
import request from 'supertest';
import createProjectVaultRoutes from '../project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const ORG = 7;
let database: PGlite;

function app() {
  const a = express();
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: 3, role: 'member', organizationId: ORG }, dbClient: { query: io.query } });
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

const search = (q = 'stability', filters: Record<string, string> = {}) =>
  request(app()).get(`/api/c2c/project-vault/${PROGRAM}/search`).query({ q, ...filters });

/** The two reads this file is about: count and rows over vault.documents. */
const vaultReads = () => queries.filter(c => /FROM vault\.documents d/.test(c.sql));

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, name text, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer,
      document_code text, document_title text, file_name text, document_type text, file_size bigint, folder_id text, ctd_section text,
      placement_status text, version text, extracted_text text, content_hash text, supersedes_id uuid,
      classification text DEFAULT 'INTERNAL', evidence_kind text,
      deleted_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE canonical_documents (canonical_id text PRIMARY KEY, organization_id integer, stage text,
      source_refs jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE document_data_dispositions (id integer, organization_id integer, program_id uuid,
      vault_document_id uuid, source_sha256 text, linked_ids jsonb, choice text,
      disposition_sequence integer, created_at timestamptz);
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO users VALUES (3,'active');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,'Private stability program',NULL);
    INSERT INTO projects VALUES (42,7,'${PROGRAM}',3,3,'{}','active',NULL);
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
    INSERT INTO vault.documents (id,program_id,organization_id,document_title,extracted_text)
      VALUES ('${DOCUMENT}','${PROGRAM}',7,'Stability report','Observed stability data'),
             ('33333333-3333-4333-8333-333333333333','${PROGRAM}',9,'Stability cross-tenant row','Hidden stability data');
  `);
  await database.exec(fs.readFileSync('migrations/20260906_vault_documents_fulltext.sql', 'utf8'));
});
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  queries.length = 0;
  await database.exec("TRUNCATE organization_users; INSERT INTO organization_users VALUES (7,3,'member');");
  io.query.mockReset().mockImplementation(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    return database.query(sql, params);
  });
});

describe('vault search carries the org predicate in-statement', () => {
  it('runs both reads — the count and the rows', async () => {
    const res = await search();
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.results.map((r: { id: string }) => r.id)).toEqual([DOCUMENT]);
    expect(vaultReads()).toHaveLength(2);
  });

  it('every vault read names the caller organization in its own SQL', async () => {
    expect((await search()).status).toBe(200);
    expect(vaultReads()).toHaveLength(2);
    for (const { sql } of vaultReads()) {
      expect(sql).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM regulatory_programs rp/);
      // The one search query (vault-search.ts) binds the organisation first.
      expect(sql).toMatch(/rp\.organization_id = \$1/);
      expect(sql).toMatch(/d\.organization_id = \$1/);
      expect(sql).toMatch(/d\.program_id = ANY\(\$3::uuid\[\]\)/);
    }
  });

  it('binds the caller organization, not a value from the request', async () => {
    expect((await search()).status).toBe(200);
    expect(vaultReads()).toHaveLength(2);
    for (const { params } of vaultReads()) {
      expect(params[0]).toBe(ORG);
      expect(params[2]).toEqual([PROGRAM]);
    }
  });

  it('counts over exactly the set it returns rows from', async () => {
    await search();
    const [counted, rows] = vaultReads();
    // Both are built from the same `searchWhere`, so the predicate text after
    // WHERE must be identical — a total taken over a different set is a wrong
    // number, not a display detail. The statement's own WHERE starts a line; a
    // subquery in the select list (the row's `current` flag) has its WHERE inline.
    const whereOf = (s: string) => s.slice(s.search(/\n\s*WHERE\s/)).replace(/ORDER BY[\s\S]*$/, '').trim();
    expect(whereOf(counted.sql)).toBe(whereOf(rows.sql));
  });

  // VR-18: filters narrow the same predicate; they never move the tenant binds.
  it.each([
    ['a filtered search', 'stability'],
    ['a filtered browse (no text)', ''],
  ])('%s keeps the org first, the programs third, and one WHERE for count and page', async (_label, q) => {
    const res = await search(q, { classification: 'INTERNAL', placementStatus: 'unfiled', lifecycleStage: 'none' });
    expect(res.status).toBe(200);
    expect(res.body.data.results.map((r: { id: string }) => r.id)).toEqual([DOCUMENT]);
    expect(vaultReads()).toHaveLength(2);
    const [counted, rows] = vaultReads();
    for (const { sql, params } of [counted, rows]) {
      expect(sql).toMatch(/rp\.organization_id = \$1/);
      expect(sql).toMatch(/d\.organization_id = \$1/);
      expect(params[0]).toBe(ORG);
      expect(params[2]).toEqual([PROGRAM]);
    }
    const whereOf = (s: string) => s.slice(s.search(/\n\s*WHERE\s/)).replace(/ORDER BY[\s\S]*$/, '').trim();
    expect(whereOf(counted.sql)).toBe(whereOf(rows.sql));
  });

  it('verifies access but does not search the corpus for an empty query', async () => {
    const res = await search('');
    expect(res.body.data.reason).toBe('EMPTY_QUERY');
    expect(vaultReads()).toHaveLength(0);
    expect(queries.some(q => /organization_users/.test(q.sql))).toBe(true);
  });
});
