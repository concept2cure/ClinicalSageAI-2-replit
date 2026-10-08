/**
 * "Records in this project" counts the current records a project has, and the
 * Vault tree and the Data room agree with it.
 *
 * The client counts each section's rows. Two sections counted rows that are no
 * longer the project's current records: vault documents counted every version
 * of a document (a superseded version is one of the document's versions, not a
 * document of its own, as the Vault tree says), and sources counted a file a
 * re-upload had retired (is_current = false). So the project home read 12 vault
 * documents where the tree showed 10, and 22 sources where the Data room
 * showed 20.
 *
 * Run on real Postgres semantics (PGlite), so the predicates are the ones the
 * database evaluates. The parity case drives the Vault tree and the Data room
 * over the same rows as the records read.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const h = vi.hoisted(() => ({ pg: null as unknown as PGlite }));
const client = {
  query: (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]),
  release: () => {},
};
vi.mock('../../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => h.pg.query(sql, params as unknown[]),
    connect: async () => client,
  },
}));

import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import router from '../projects';
import createProjectVaultRoutes from '../project-vault';

const ORG = 7;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const V2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    req.organizationId = ORG;
    next();
  });
  a.use('/api/c2c/projects', router);
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

beforeAll(async () => {
  h.pg = new PGlite();
  // The actor-name reader the Vault tree and the Data room both use (D3). The
  // migration installs it only where the audit and user tables exist.
  await h.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pg.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
                   CREATE TABLE IF NOT EXISTS organization_users (user_id integer, organization_id integer);`);
  await h.pg.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260929_actor_names.sql'), 'utf8'));
  await h.pg.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE regulatory_programs (
      id UUID PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT, product_type TEXT,
      program_type TEXT, primary_agency TEXT, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, organization_id INTEGER NOT NULL,
      document_code TEXT, document_title TEXT, document_type TEXT, classification TEXT, version TEXT,
      file_name TEXT, file_size BIGINT, mime_type TEXT, content_hash TEXT,
      folder_id TEXT, evidence_kind TEXT, ctd_section TEXT, placement_status TEXT NOT NULL DEFAULT 'unfiled',
      placement_confidence TEXT, placement_rationale TEXT,
      supersedes_id UUID, deleted_at TIMESTAMPTZ, created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE canonical_documents (
      organization_id INTEGER, canonical_id TEXT, stage TEXT, source_refs JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE cre_evidence_sources (
      id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, client_program_id UUID,
      client_workspace_id INTEGER, title TEXT, source_type TEXT, checksum TEXT,
      is_current BOOLEAN, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ,
      extraction_status TEXT, ingestion_status TEXT, previous_version_id INTEGER,
      provenance JSONB NOT NULL DEFAULT '{}', metadata JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE c2c_documents (
      id UUID PRIMARY KEY, project_id UUID, org_id INTEGER, doc_type TEXT, agency TEXT,
      rule_pack_version TEXT, title TEXT, status TEXT, readiness INTEGER,
      updated_at TIMESTAMPTZ, owner_id INTEGER
    );
    CREATE TABLE c2c_rule_packs (doc_type TEXT, agency TEXT, version TEXT, required_sections JSONB);
    CREATE TABLE public.document_data_dispositions (
      id SERIAL PRIMARY KEY, organization_id INTEGER, program_id UUID, choice TEXT,
      captured_source_id INTEGER, vault_document_id UUID, source_sha256 TEXT, linked_ids JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
});
afterAll(async () => { await h.pg.close(); });

beforeEach(async () => {
  await h.pg.exec(`
    DELETE FROM public.document_data_dispositions; DELETE FROM vault.documents;
    DELETE FROM cre_evidence_sources; DELETE FROM canonical_documents; DELETE FROM c2c_documents;
    DELETE FROM regulatory_programs;
    INSERT INTO regulatory_programs (id, organization_id, name, product_type)
      VALUES ('${PROGRAM}', ${ORG}, 'Vorelinib IND', 'drug');`);
});

/** One document with a superseded first version and a current second one. */
async function seedDocument() {
  await h.pg.exec(`
    INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, version, file_name, content_hash, supersedes_id, created_at, updated_at)
      VALUES ('${V1}', '${PROGRAM}', ${ORG}, 'STB-0042', 'Stability protocol', 'PROTOCOL', '1.0', 'stb-0042-v1.pdf', '${'1'.repeat(64)}', NULL, now() - interval '2 days', now() - interval '2 days');
    INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, version, file_name, content_hash, supersedes_id, created_at, updated_at)
      VALUES ('${V2}', '${PROGRAM}', ${ORG}, 'STB-0042', 'Stability protocol', 'PROTOCOL', '2.0', 'stb-0042-v2.pdf', '${'2'.repeat(64)}', '${V1}', now() - interval '1 day', now() - interval '1 day');`);
}

/** One current source and one a re-upload retired. */
async function seedSources() {
  await h.pg.exec(`
    INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, source_type, checksum, is_current, extraction_status, ingestion_status)
      VALUES (${ORG}, '${PROGRAM}', 'batch-analysis.csv', 'client_document', 'c1', TRUE, 'extracted', 'ingested'),
             (${ORG}, '${PROGRAM}', 'batch-analysis-v0.csv', 'client_document', 'c0', FALSE, 'extracted', 'ingested');`);
}

describe('GET /:id/records counts the current records a project has', () => {
  it('a superseded vault version is not a document of the project: one document, its current version', async () => {
    await seedDocument();
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.status).toBe(200);
    const section = res.body.records.vaultDocuments;
    expect(section.available).toBe(true);
    expect(section.rows, 'the superseded version is not counted').toHaveLength(1);
    expect(section.rows[0]).toMatchObject({ id: V2, version: '2.0' });
  });

  it('a source a re-upload retired is not a source of the project: one source, the current one', async () => {
    await seedSources();
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.status).toBe(200);
    const section = res.body.records.sources;
    expect(section.available).toBe(true);
    expect(section.rows, 'the retired source is not counted').toHaveLength(1);
    expect(section.rows[0]).toMatchObject({ title: 'batch-analysis.csv' });
  });

  it('a project with one document, one superseded version, one current and one retired source reports 1 and 1', async () => {
    await seedDocument();
    await seedSources();
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.status).toBe(200);
    expect(res.body.records.vaultDocuments.rows).toHaveLength(1);
    expect(res.body.records.sources.rows).toHaveLength(1);
  });

  it('a version whose only successor was deleted is still the current version', async () => {
    // The successor link counts only while the successor is live (the same
    // rule the Vault tree applies), so a deleted successor leaves its
    // predecessor current.
    await seedDocument();
    await h.pg.exec(`UPDATE vault.documents SET deleted_at = now() WHERE id = '${V2}'`);
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.body.records.vaultDocuments.rows.map((r: { id: string }) => r.id)).toEqual([V1]);
  });

  it('a soft-deleted source is not a source of the project, as the Data room does not list it', async () => {
    await seedSources();
    await h.pg.exec(`
      INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, source_type, checksum, is_current, deleted_at, extraction_status, ingestion_status)
        VALUES (${ORG}, '${PROGRAM}', 'withdrawn.csv', 'client_document', 'cw', TRUE, now(), 'extracted', 'ingested');`);
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.body.records.sources.rows.map((r: { title: string }) => r.title)).toEqual(['batch-analysis.csv']);
  });

  it('a source that is not a client document is not in the project Data room, so not counted', async () => {
    await seedSources();
    await h.pg.exec(`
      INSERT INTO cre_evidence_sources (organization_id, client_program_id, title, source_type, checksum, is_current, extraction_status, ingestion_status)
        VALUES (${ORG}, '${PROGRAM}', 'fda-review-memo.pdf', 'fda_review_memo', 'cm', TRUE, 'extracted', 'ingested');`);
    const res = await request(app()).get(`/api/c2c/projects/${PROGRAM}/records`);
    expect(res.body.records.sources.rows.map((r: { title: string }) => r.title)).toEqual(['batch-analysis.csv']);
  });
});

