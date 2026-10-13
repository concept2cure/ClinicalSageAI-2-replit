import { PGlite } from '@electric-sql/pglite';
import express, { type Request } from 'express';
import httpRequest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ query: vi.fn(), thread: vi.fn(), embedding: vi.fn(), gateway: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: io.query }, getPool: () => ({ query: io.query }), db: {} }));
vi.mock('../../../db/currentTenant.js', () => ({ currentTenantOrgUuid: async () => '77777777-2222-4333-8444-555555555555' }));
vi.mock('../../../services/ana/AnaToolExecutor.js', () => ({ executeAgenticLoop: vi.fn() }));
vi.mock('../../../services/chat-thread-helpers.js', () => ({ getOrCreateThread: io.thread,
  getThreadMessages: async () => [], saveChatMessage: async () => 1, ThreadAccessError: class extends Error {} }));
vi.mock('../../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: io.embedding }));
vi.mock('../shared.js', () => ({ ensureGateway: io.gateway, normalizeBody: (req: Request) => {
  if (req.body.context?.projectId && !req.body.project_id) req.body.project_id = req.body.context.projectId;
} }));

import { sendMessageHandler } from '../send-message';

const PROGRAM = '11111111-2222-4333-8444-555555555555';
let database: PGlite;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { Object.assign(req, { tenantId: 7, user: { id: 3, organizationId: 7, role: 'admin' } }); next(); });
app.post('/api/chat/send-message', sendMessageHandler);
beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamp);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid,
      client_workspace_id integer, owner_id integer, created_by_id integer, settings jsonb);
    CREATE TABLE organization_users (user_id integer, organization_id integer, role text);
    CREATE TABLE users (id integer PRIMARY KEY, status text);
    CREATE TABLE organizations (id integer PRIMARY KEY, status text);
    CREATE TABLE project_visibility_settings (project_id integer, organization_id integer, visibility text);
    CREATE TABLE project_members (project_id integer, organization_id integer, user_id integer, role text, status text);
    CREATE TABLE concept2cure_review_assignments (reviewer_id integer, organization_id integer, artifact_id uuid, status text);
    CREATE TABLE concept2cure_artifacts (id uuid PRIMARY KEY, project_id integer, organization_id integer, metadata jsonb);
    CREATE TABLE file_uploads (id text PRIMARY KEY, organization_id integer, user_id integer);
    CREATE TABLE cre_evidence_sources (organization_id integer, provenance jsonb, client_program_id uuid, client_workspace_id integer);
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL);
    INSERT INTO projects VALUES (42,7,'${PROGRAM}',NULL,5,5,'{}');
    INSERT INTO users VALUES (3,'active'),(5,'active');
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO organization_users VALUES (3,7,'member'),(5,7,'member');
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
    INSERT INTO file_uploads VALUES ('private-upload',7,5);
  `);
});
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  await database.exec('DELETE FROM project_members');
  io.query.mockReset().mockImplementation((sql: string, params?: unknown[]) => database.query<Record<string, unknown>>(sql, params));
  io.thread.mockReset().mockRejectedValue(new Error('test stopped at admitted thread boundary'));
  io.embedding.mockReset();
  io.gateway.mockReset();
});
function noSourceOrModelWork() {
  expect(io.thread).not.toHaveBeenCalled();
  expect(io.embedding).not.toHaveBeenCalled();
  expect(io.gateway).not.toHaveBeenCalled();
}
describe('canonical JSON chat checks current project access before thread and retrieval', () => {
  it.each([{ project_id: PROGRAM }, { project_id: 42 }, { context: { projectId: PROGRAM } },
    { project_context: { projectId: PROGRAM } }])('refuses a private project for scope %j despite stale token admin role', async scope => {
    const response = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Read this project', ...scope });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    noSourceOrModelWork();
  });
  it('refuses unreadable membership before retrieval', async () => {
    io.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (/FROM organization_users/.test(sql)) throw new Error('membership unavailable');
      return database.query<Record<string, unknown>>(sql, params);
    });
    const response = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Read this project', project_id: PROGRAM });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('ANA_PROJECT_ACCESS_UNAVAILABLE');
    noSourceOrModelWork();
  });
  it('allows a shared member to reach the thread boundary and refuses a later revoked turn', async () => {
    await database.exec("INSERT INTO project_members VALUES (42,7,3,'use','active')");
    await httpRequest(app).post('/api/chat/send-message').send({ message: 'Read this project', project_id: PROGRAM });
    expect(io.thread).toHaveBeenCalledOnce();
    await database.exec("UPDATE project_members SET status='revoked'");
    io.thread.mockClear();
    expect((await httpRequest(app).post('/api/chat/send-message').send({ message: 'Read this project', project_id: PROGRAM })).status).toBe(403);
    noSourceOrModelWork();
  });
  it('keeps no-project conversation admission independent of project membership reads', async () => {
    await httpRequest(app).post('/api/chat/send-message').send({ message: 'Explain IND structure' });
    expect(io.thread).toHaveBeenCalledOnce();
    expect(io.query).not.toHaveBeenCalled();
  });
  it('rejects another member’s unbound file_id before thread or model work', async () => {
    const response = await httpRequest(app).post('/api/chat/send-message').send({ message: 'Read this file', file_id: 'private-upload' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ANA_SOURCE_ACCESS_DENIED');
    noSourceOrModelWork();
  });
});
