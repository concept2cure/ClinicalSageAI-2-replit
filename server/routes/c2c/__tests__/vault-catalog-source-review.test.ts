/** Actual parent admission SQL plus the HTTP catalog handoff. The canonical
 * catalog source/review writer has separate proof. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), review: vi.fn(), query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: mocks.query, connect: vi.fn() } }));
vi.mock('../../../services/vault/document-catalog-governance.service.js', () => ({
  readCatalogRecord: mocks.read, reviewCatalogRecord: mocks.review,
}));
import createProjectVaultRoutes from '../project-vault';
import { pool } from '../../../db.js';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const TEXT_HASH = 'b'.repeat(64);
const endpoint = `/api/c2c/project-vault/${PROGRAM}/documents/${DOCUMENT}/catalog`;
let database: PGlite;
function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { user: { organizationId: 7, id: 3, role: 'member' }, dbClient: { query: mocks.query } });
    next();
  });
  instance.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return instance;
}
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organization_users (organization_id integer, user_id integer, role text);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      owner_id integer, created_by_id integer, settings jsonb, status text, client_workspace_id integer);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_artifacts (id integer, organization_id integer, project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer, reviewer_id integer, organization_id integer, status text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY, program_id uuid, organization_id integer);
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO users VALUES (3,'active');
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL);
    INSERT INTO projects VALUES (42,7,'${PROGRAM}',3,3,'{}','active',NULL);
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
    INSERT INTO vault.documents VALUES ('${DOCUMENT}','${PROGRAM}',7);
  `);
});
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  await database.exec(`TRUNCATE organization_users;
    INSERT INTO organization_users VALUES (7,3,'member');
    UPDATE vault.documents SET organization_id=7;
    UPDATE projects SET owner_id=3,created_by_id=3;`);
  mocks.query.mockReset().mockImplementation((sql: string, params?: unknown[]) => database.query(sql, params));
  mocks.read.mockResolvedValue({ documentId: DOCUMENT, extractedTextSha256: TEXT_HASH });
  mocks.review.mockResolvedValue({ ok: true, state: 'confirmed', changes: [] });
});
describe('catalog HTTP source review binding', () => {
  it('carries the session actor into canonical reads', async () => {
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ programId: PROGRAM, documentId: DOCUMENT, organizationId: 7, userId: 3, executor: pool });
  });
  it('refuses a revoked organization actor before the catalog handoff', async () => {
    await database.exec('DELETE FROM organization_users');
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('refuses an unassigned private-project reader before the catalog handoff', async () => {
    await database.exec('UPDATE projects SET owner_id=5,created_by_id=5');
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('quarantines an unrecorded document tenant before the catalog handoff', async () => {
    await database.exec('UPDATE vault.documents SET organization_id=NULL');
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('VAULT_TENANT_RECONCILIATION_REQUIRED');
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(['confirm', 'correct'])('carries shown-text digest and session actor into %s', async action => {
    const result = await request(app()).post(`${endpoint}/${action}`).send({
      expectedExtractedTextSha256: TEXT_HASH, contentHash: 'a'.repeat(64), revision: 'rev', userId: 999,
    });
    expect(result.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      userId: 3, expectedExtractedTextSha256: TEXT_HASH, expectedContentHash: 'a'.repeat(64), expectedRevision: 'rev',
    }));
  });
  it.each([42, null, {}, false])('refuses malformed shown-text binding (%j) without downgrading to legacy review', async digest => {
    const result = await request(app()).post(`${endpoint}/confirm`).send({ expectedExtractedTextSha256: digest });
    expect(result.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('preserves a canonical source-change refusal', async () => {
    mocks.review.mockResolvedValue({ ok: false, status: 409, code: 'EXTRACTED_TEXT_CHANGED', message: 'Read the source again.' });
    const result = await request(app()).post(`${endpoint}/confirm`).send({ expectedExtractedTextSha256: TEXT_HASH });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('EXTRACTED_TEXT_CHANGED');
    expect(result.body.success).toBe(false);
  });
  it('keeps a read failure visible', async () => {
    mocks.read.mockRejectedValue(new Error('read unavailable'));
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('CATALOG_UNAVAILABLE');
    expect(result.body.success).toBe(false);
  });
});
