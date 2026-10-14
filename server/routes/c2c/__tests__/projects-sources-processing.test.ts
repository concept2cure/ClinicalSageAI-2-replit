import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const mocks = vi.hoisted(() => ({ query: vi.fn(), search: vi.fn(), unscoped: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: (...args: unknown[]) => mocks.query(...args) } }));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service.js', () => ({ listClientDocuments: mocks.unscoped }));
vi.mock('../../../services/clinical-regulatory-evidence/data-room-search.js', async original => ({
  ...(await original<typeof import('../../../services/clinical-regulatory-evidence/data-room-search.js')>()), searchDataRoom: mocks.search,
}));
vi.mock('../../../services/clinical-regulatory-evidence/source-usage.service.js', () => ({ summarizeSourceUsage: async () => new Map() }));
import router from '../projects';
import { pool } from '../../../db';
const P = '11111111-1111-4111-8111-111111111111';
let database: PGlite;
const stage = (state = 'failed') => ({ version: 1, stage: 'derived_capture', processorRevision: 'data-room-processing:v1', state,
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', attempts: 1, claimedAt: '2026-10-14T04:00:00.000Z', leaseExpiresAt: null,
  nextRetryAt: '2026-10-14T04:01:00.000Z', completedAt: null, retryable: true, reasonCode: 'PERSISTENCE_FAILED', identity: {
    organizationId: 7, sourceId: 9, sha256: 'a'.repeat(64), uploadSha256: 'a'.repeat(64), fileUploadId: 'recorded-upload',
    storageRef: '/private/capture.bin', uploadStoragePath: '/private/capture.bin', programId: P, workspaceId: null,
    sizeBytes: 24, fileName: 'Assay report', uploadFileName: 'Assay report', sourceTitle: 'Assay report',
    mimeType: 'text/plain', sourceMimeType: 'text/plain', lineage: {},
  } });
const source = (over: Record<string, unknown> = {}) => ({ id: 9, title: 'Assay report', checksum: 'a'.repeat(64), isCurrent: true,
  dataEligible: true, originalFileAvailable: true, ingestionStatus: 'ingested', extractionStatus: 'extracted', textAvailable: false,
  createdAt: '2026-10-14T04:00:00.000Z', metadata: { dataRoomProcessing: stage() }, provenance: { extractionError: '/private/stale-error.bin' }, ...over });
function app() {
  const a = express(); a.use(express.json());
  a.use((req: express.Request, _res, next) => {
    Object.assign(req, { organizationId: 7, user: { id: 3, role: 'member', organizationId: 7 }, dbClient: { query: mocks.query } });
    next();
  });
  a.use('/api/c2c/projects', router); return a;
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
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO users VALUES (3,'active');
    INSERT INTO organization_users VALUES (7,3,'member');
    INSERT INTO regulatory_programs VALUES ('${P}',7,NULL);
    INSERT INTO projects VALUES (42,7,'${P}',3,3,'{}','active',NULL);
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
  `);
});
afterAll(async () => { await database.close(); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset().mockImplementation((sql: string, params?: unknown[]) => database.query(sql, params));
  mocks.unscoped.mockResolvedValue([]);
});
describe('source processing projection on the existing project read', () => {
  it('reports persisted availability and a safe processing summary without private identity/error fields', async () => {
    mocks.search.mockResolvedValue({ total: 1, currentTotal: 1, sources: [source()] });
    const r = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(r.status).toBe(200);
    expect(r.body.sources[0]).toMatchObject({ id: 9, textAvailable: false, processing: { state: 'failed', retryable: true, reasonCode: 'PERSISTENCE_FAILED' } });
    expect(JSON.stringify(r.body)).not.toMatch(/private|storageRef|identity|extractionError/);
  });

  it('reports recovered text under the same identity and drops obsolete failure presentation', async () => {
    mocks.search.mockResolvedValue({ total: 1, currentTotal: 1, sources: [source({ textAvailable: true,
      metadata: { dataRoomProcessing: { ...stage('completed'), retryable: false, reasonCode: null, nextRetryAt: null, completedAt: '2026-10-14T04:01:00.000Z' } } })] });
    const r = await request(app()).get(`/api/c2c/projects/${P}/sources`);
    expect(r.body.sources[0]).toMatchObject({ id: 9, checksum: 'a'.repeat(64), textAvailable: true, processing: { state: 'completed', reasonCode: null } });
    expect(JSON.stringify(r.body)).not.toMatch(/PERSISTENCE_FAILED|private/);
  });

  it('passes the server executor and session actor for the optional unscoped library', async () => {
    mocks.search.mockResolvedValue({ total: 0, currentTotal: 0, sources: [] });
    const r = await request(app()).get(`/api/c2c/projects/${P}/sources?includeUnscoped=true`);
    expect(r.status).toBe(200);
    expect(mocks.unscoped).toHaveBeenCalledWith(pool, 7, { userId: 3, includeUnscoped: true, limit: 50 });
  });
});
