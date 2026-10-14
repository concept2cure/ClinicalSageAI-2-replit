import { PGlite } from '@electric-sql/pglite';
import httpRequest from 'supertest';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

const io = vi.hoisted(() => ({
  resolve: vi.fn(),
  query: vi.fn(),
  lumen: vi.fn(),
  memory: vi.fn(),
  enrich: vi.fn(),
  prefetch: vi.fn(),
  bootstrap: vi.fn(),
  reflect: vi.fn(),
  logToolRun: vi.fn(),
}));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', () => ({ getPool: () => ({ query: io.query }), pool: { query: io.query }, db: {} }));
vi.mock('../shared.js', async importOriginal =>
  (await harnessModule()).mocks.shared(await importOriginal<Record<string, unknown>>()),
);
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async importOriginal =>
  (await harnessModule()).mocks.runControl(await importOriginal<typeof import('../../../services/ana/run-control.js')>()),
);
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async importOriginal => ({
  ...(await harnessModule()).mocks.chatContextBuilder(await importOriginal<Record<string, unknown>>()),
  prefetchRouteIntelligenceContext: io.prefetch,
}));
vi.mock('../../../services/c2c/project-ref.js', () => ({ integerProjectForRef: io.resolve }));
vi.mock('../../../services/c2c/program-project-anchor.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  strictProjectRowForRef: io.resolve,
}));
vi.mock('../../../services/lumen-context-builder.js', async () => ({ ...(await harnessModule()).mocks.lumen(), getIntelligencePrefix: io.lumen }));
vi.mock('../../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: io.memory }));
vi.mock('../../../services/ana-ri/context-enrichment.js', () => ({ enrichContextForChat: io.enrich }));
vi.mock('../../../services/chat-thread-helpers.js', async () => (await harnessModule()).mocks.chatThreads());
vi.mock('../../../services/ana-session-bootstrap.js', () => ({ sessionBootstrapBlockFor: io.bootstrap }));
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', () => ({ logToolRun: io.logToolRun }));
vi.mock('../../../services/ana-ri/relational-profile-service.js', () => ({ reflectAfterTurn: io.reflect }));
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());

import { mountStreamRoute } from '../stream.js';
import { harness as h, resetHarness, streamApp } from './support/stream-route-harness.js';

const app = streamApp(mountStreamRoute);
const PROGRAM = '11111111-2222-4333-8444-555555555555';
const PUBLIC_PROGRAM = '22222222-2222-4333-8444-555555555555';
let database: PGlite;
let uploadReaders: typeof import('../../../services/ana/uploaded-file-access');
const statements: string[] = [];
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
    CREATE TABLE cre_evidence_sources (id integer PRIMARY KEY, organization_id integer, visibility_class text,
      client_program_id uuid, client_workspace_id integer, deleted_at timestamp, provenance jsonb);
    CREATE TABLE file_uploads (id text PRIMARY KEY, organization_id integer, user_id integer);
    ALTER TABLE cre_evidence_sources ADD COLUMN source_type text, ADD COLUMN created_by int;
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}',7,NULL);
    INSERT INTO projects VALUES (42,7,'${PROGRAM}',NULL,5,5,'{}');
    INSERT INTO users VALUES (3,'active'),(5,'active');
    INSERT INTO organizations VALUES (7,'active');
    INSERT INTO organization_users VALUES (3,7,'member'),(5,7,'member');
    INSERT INTO project_visibility_settings VALUES (42,7,'private');
    INSERT INTO regulatory_programs VALUES ('${PUBLIC_PROGRAM}',7,NULL);
    INSERT INTO projects VALUES (84,7,'${PUBLIC_PROGRAM}',NULL,5,5,'{}');
    INSERT INTO project_visibility_settings VALUES (84,7,'org_public');
    INSERT INTO file_uploads VALUES ('private-source-upload',7,3);
    INSERT INTO cre_evidence_sources (id,organization_id,visibility_class,client_program_id,client_workspace_id,deleted_at,provenance) VALUES (321,7,'project_private','${PROGRAM}',42,NULL,
      '{"fileUploadId":"private-source-upload"}');
  `);
  uploadReaders = await import('../../../services/ana/uploaded-file-access');
  vi.spyOn(uploadReaders, 'loadUploadedFileMetadata');
  vi.spyOn(uploadReaders, 'loadUploadedFile');
});
afterAll(async () => { await database.close(); });
beforeEach(async () => {
  resetHarness();
  vi.clearAllMocks();
  await database.exec('DELETE FROM project_members');
  statements.length = 0;
  io.query.mockReset().mockImplementation(async (sql: string, params?: unknown[]) => {
    statements.push(sql);
    return database.query<Record<string, unknown>>(sql, params);
  });
  io.resolve.mockReset().mockResolvedValue(42);
  io.memory.mockReset().mockResolvedValue({ memoryBlock: '', atoms: [], diagnostics: null });
  io.enrich.mockReset().mockResolvedValue({ block: '', sources: [], enrichmentMeta: {} });
  io.prefetch.mockReset().mockResolvedValue({});
  io.bootstrap.mockReset().mockResolvedValue('');
  io.reflect.mockReset().mockResolvedValue(undefined);
  io.logToolRun.mockReset().mockResolvedValue(undefined);
  io.lumen.mockReset().mockResolvedValue('');
});
function noPrivateWork() {
  for (const reader of [io.memory, io.enrich, io.prefetch, io.bootstrap, io.lumen]) expect(reader).not.toHaveBeenCalled();
  expect(h.state.gatewayCalls).toBe(0);
  expect(h.state.toolRuns).toBe(0);
  expect(h.state.beginRunInputs).toHaveLength(0);
}

describe('AnA admits a private project before its context, run or tools', () => {
  it.each([
    { project_id: PROGRAM }, { project_id: 42 }, { context: { projectId: PROGRAM } },
    { project_context: { projectId: PROGRAM } },
  ])('refuses an unrelated member for scope %j before SSE', async scope => {
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Read this project', ...scope });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    noPrivateWork();
  });
  it('refuses before the intelligence-answer direct-handler path', async () => {
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({
      message: '[INTELLIGENCE_ANSWER]{"questionId":"q","answer":"yes"}', project_id: PROGRAM,
    });
    expect(response.status).toBe(403);
    noPrivateWork();
  });
  it('allows an active private member, then refuses a new turn after revocation', async () => {
    await database.exec("INSERT INTO project_members VALUES (42,7,3,'use','active')");
    expect((await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Read this project', project_id: PROGRAM })).status).toBe(200);
    expect(io.prefetch).toHaveBeenCalledWith(expect.objectContaining({ projectIdNumber: 42 }));
    await database.exec("UPDATE project_members SET status='revoked'");
    resetHarness();
    for (const reader of [io.memory, io.enrich, io.prefetch, io.bootstrap, io.lumen]) reader.mockClear();
    expect((await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Read this project', project_id: PROGRAM })).status).toBe(403);
    noPrivateWork();
  });
  it('fails closed when current membership cannot be read', async () => {
    io.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/FROM organization_users/.test(sql)) throw new Error('membership store unavailable');
      return database.query<Record<string, unknown>>(sql, params);
    });
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Read this project', project_id: PROGRAM });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_UNAVAILABLE');
    noPrivateWork();
  });
  it('preserves an organization conversation without a selected project', async () => {
    expect((await httpRequest(app).post('/api/ana-ri/stream').send({ message: 'Explain IND requirements' })).status).toBe(200);
    expect(statements.some(sql => /organization_users|project_members/.test(sql))).toBe(false);
  });
  it('refuses a selected private source even when the open project is public and accessible', async () => {
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({
      message: 'Read the selected source', project_id: PUBLIC_PROGRAM, source_ids: [321], user_role: 'admin',
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    noPrivateWork();
    expect(uploadReaders.loadUploadedFileMetadata).not.toHaveBeenCalled();
    expect(uploadReaders.loadUploadedFile).not.toHaveBeenCalled();
  });
  it('refuses a direct upload whose recorded source belongs to another private project', async () => {
    // The caller originally uploaded these bytes; that cannot override their
    // subsequently recorded private-project parent.
    const response = await httpRequest(app).post('/api/ana-ri/stream').send({
      message: 'Read this attachment', project_id: PUBLIC_PROGRAM, file_ids: ['private-source-upload'],
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('ANA_PROJECT_ACCESS_DENIED');
    noPrivateWork();
    expect(uploadReaders.loadUploadedFileMetadata).not.toHaveBeenCalled();
    expect(uploadReaders.loadUploadedFile).not.toHaveBeenCalled();
  });
});
