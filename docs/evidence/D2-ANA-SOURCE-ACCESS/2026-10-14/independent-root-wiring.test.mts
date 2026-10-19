/** Held-out root wiring checks. Actual registered recall handler/bootstrap
 * helpers and executed route AST expressions; not a mounted endpoint,
 * provider-served acknowledgement or deployed RLS/concurrency proof. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://source_fixture:source_fixture@127.0.0.1:55119/source_fixture';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  const unavailable = () => { throw new Error('UNOWNED_DATABASE_ACCESS'); };
  return { build: vi.fn(), realBuild: null as any, enabled: vi.fn(), vault: vi.fn(), uploads: vi.fn(),
    pool: { query: unavailable, connect: unavailable }, lessons: vi.fn(), verify: vi.fn(), write: vi.fn(), gateway: vi.fn() };
});
vi.mock('../../../../server/db.js', () => ({
  pool: h.pool, getPool: () => h.pool,
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: h.lessons }) }) }) }) },
}));
vi.mock('../../../../server/services/client-intelligence-memory.js', () => ({
  getClientProfile: async () => null, getMemoryEntries: async () => ({ entries: [] }),
  getProjectIntelligence: async () => null, getProjectMemoryEntries: async () => ({ entries: [] }),
}));
vi.mock('../../../../server/services/working-memory.js', () => ({ getLatestWorkingMemoryByThread: async () => null }));
vi.mock('../../../../server/services/vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: h.enabled, getCatalogBootstrapDigestForActor: h.vault, listChatUploadsForActor: h.uploads,
}));
vi.mock('../../../../server/services/ana-session-bootstrap.js', async importOriginal => {
  const actual = await importOriginal<any>();
  h.realBuild = actual.buildSessionBootstrapContext;
  return { ...actual, buildSessionBootstrapContext: h.build };
});
vi.mock('../../../../server/services/ai-gateway/gateway', () => ({ getGateway: () => ({ route: h.gateway }) }));
vi.mock('../../../../server/services/ana/source-read-receipt.js', async importOriginal => ({
  ...(await importOriginal<any>()), verifyDeferredReadReceipt: h.verify, writeGuardedLegacyReadReceipt: h.write,
}));

import { executeAgenticLoop, getToolHandler, registerToolHandler } from '../../../../server/services/ana/AnaToolExecutor.js';
import { deferReadReceipt } from '../../../../server/services/ana/read-receipts.js';
import { SourceReadSnapshotError } from '../../../../server/services/ana/source-read-receipt.js';
import { admitAnaSelectedSources, assertAnaUploadAccess } from '../../../../server/services/ana/source-context-admission.js';

const PROGRAM = '72727272-1111-4111-8111-000000000001';
const FORGED_PROGRAM = '72727272-1111-4111-8111-000000000009';
const SOURCE_ACTOR = { organizationId: 172, userId: 1721, projectId: 17201, projectRef: PROGRAM };
let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE file_uploads(id text PRIMARY KEY,organization_id int,user_id int);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,regulatory_program_id uuid,client_workspace_id int,owner_id int,created_by_id int,settings jsonb);
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY,project_id int,organization_id int,metadata jsonb);
    CREATE TABLE concept2cure_review_assignments(artifact_id int,organization_id int,reviewer_id int,status text);
    CREATE TABLE cre_evidence_sources(id int PRIMARY KEY,organization_id int,visibility_class text,
      client_program_id uuid,client_workspace_id int,source_type text,created_by int,provenance jsonb,deleted_at timestamptz);`);
});
afterAll(async () => { await pg?.close(); });
beforeEach(async () => {
  vi.clearAllMocks();
  h.build.mockResolvedValue('A synthetic accessible source recall.');
  h.enabled.mockResolvedValue(true);
  h.lessons.mockResolvedValue([]);
  h.vault.mockResolvedValue({ files: [], total: 0, withheld: 0, notYetStudied: 0, extractionFailed: 0, unfiled: 0, actorFiltered: true });
  h.uploads.mockResolvedValue({ uploads: [], hasMore: false, actorFiltered: true, total: 0, withheld: 0 });
  h.verify.mockResolvedValue(undefined);
  h.write.mockResolvedValue(undefined);
  await pg.exec(`TRUNCATE users,organizations,organization_users,file_uploads,regulatory_programs,projects,
    project_visibility_settings,project_members,concept2cure_artifacts,concept2cure_review_assignments,cre_evidence_sources;
    INSERT INTO users VALUES(1721,'active'),(1722,'active');
    INSERT INTO organizations VALUES(172,'active');
    INSERT INTO organization_users VALUES(172,1721,'viewer'),(172,1722,'member');
    INSERT INTO file_uploads VALUES('file_172_abcd',172,1721);
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',172,NULL);
    INSERT INTO projects VALUES(17201,172,'${PROGRAM}',1720,1722,1722,'{}');
    INSERT INTO project_visibility_settings VALUES(17201,172,'private');
    INSERT INTO cre_evidence_sources VALUES(17277,172,'project_private',NULL,NULL,'client_document',1721,
      '{"origin":"chat_upload","fileUploadId":"file_172_abcd"}',NULL);`);
});

function sourceFile(rel: string): ts.SourceFile {
  const file = path.resolve(process.cwd(), rel);
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function bootstrapArguments(rel: string, context: Record<string, unknown>): Record<string, unknown> {
  const file = sourceFile(rel);
  const calls: ts.CallExpression[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'sessionBootstrapBlockFor') calls.push(node);
    ts.forEachChild(node, walk);
  };
  walk(file);
  expect(calls).toHaveLength(1);
  expect(ts.isObjectLiteralExpression(calls[0].arguments[0])).toBe(true);
  return vm.runInNewContext(`(${calls[0].arguments[0].getText(file)})`, context);
}
function actualFollowUpModel(rel: string, context: Record<string, unknown>) {
  const file = sourceFile(rel);
  const functions: ts.ArrowFunction[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'callModel' && node.initializer && ts.isArrowFunction(node.initializer)) functions.push(node.initializer);
    ts.forEachChild(node, walk);
  };
  walk(file);
  expect(functions).toHaveLength(1);
  const js = ts.transpileModule(`globalThis.followUp = ${functions[0].getText(file)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const sandbox = vm.createContext(context);
  vm.runInContext(js, sandbox);
  return sandbox.followUp as (...args: unknown[]) => Promise<unknown>;
}

describe('independent lead source identity, recall and handoff controls', () => {
  it('L01 actual recall handler uses pinned actor/project and ignores forged body identities', async () => {
    const fn = getToolHandler('recall_session_context');
    expect(fn).toBeTypeOf('function');
    const result = JSON.parse(await fn!({ user_id: 9999, organization_id: 9999, project_id: 9999,
      project_ref: FORGED_PROGRAM, atom_limit: 4 }, SOURCE_ACTOR));
    expect(result.ok).toBe(true);
    expect(h.build).toHaveBeenCalledWith({ organizationId: 172, userId: 1721, projectId: 17201,
      projectRef: PROGRAM, threadId: undefined, atomLimit: 4 });
  });

  it('L02 body-only identity cannot supply recall tenant context', async () => {
    const fn = getToolHandler('recall_session_context');
    const result = JSON.parse(await fn!({ organization_id: 172, user_id: 1721, project_ref: PROGRAM }, undefined));
    expect(result.error).toMatch(/requires tenant context/);
    expect(h.build).not.toHaveBeenCalled();
  });

  it('L03 executes JSON-chat bootstrap argument AST with authenticated actor and admitted program', () => {
    const args = bootstrapArguments('server/routes/chat/send-message.ts', {
      previousMessages: [], numericOrgId: 172, numericUserId: 1721, turnProjectId: 17201,
      admittedProject: { projectRef: PROGRAM }, threadId: 'server-thread',
      req: { body: { organization_id: 9999, user_id: 9999, project_id: FORGED_PROGRAM } },
    });
    expect(args).toMatchObject({ organizationId: 172, userId: 1721, projectId: 17201, projectRef: PROGRAM });
  });

  it('L04 executes streaming bootstrap argument AST with authenticated actor and admitted program', () => {
    const args = bootstrapArguments('server/routes/ana-ri/stream.ts', {
      streamPriorTurns: 0, orgId: '172', guardUserId: 1721, streamProjectIdNumber: 17201,
      admittedProject: { projectRef: PROGRAM }, threadId: 'server-thread',
      req: { body: { organization_id: 9999, user_id: 9999, project_id: FORGED_PROGRAM } },
    });
    expect(args).toMatchObject({ organizationId: 172, userId: 1721, projectId: 17201, projectRef: PROGRAM });
  });

  it('L05 actual bootstrap refuses body-style actor substitution and names source recall gaps', async () => {
    const text = await h.realBuild({ organizationId: 172, userId: undefined, user_id: 1721,
      projectId: 17201, projectRef: PROGRAM });
    expect(h.vault).not.toHaveBeenCalled();
    expect(h.uploads).not.toHaveBeenCalled();
    expect(text).toContain('Session recall incomplete');
    expect(text).toContain('vault file recall');
    expect(text).toContain('chat upload recall');
    expect(text).not.toMatch(/0 file|no files/);
  });

  it('L06 actual bootstrap passes a private actor snapshot and suppresses denied source details', async () => {
    const input = { ...SOURCE_ACTOR };
    h.vault.mockRejectedValue(new Error('PRIVATE_VAULT_SENTINEL'));
    h.uploads.mockRejectedValue(new Error('PRIVATE_UPLOAD_SENTINEL'));
    const pending = h.realBuild(input);
    input.userId = 9999;
    input.projectRef = FORGED_PROGRAM;
    const text = await pending;
    expect(h.vault).toHaveBeenCalledWith(SOURCE_ACTOR, 12);
    expect(h.uploads).toHaveBeenCalledWith(SOURCE_ACTOR, { limit: 8 });
    expect(Object.isFrozen(h.vault.mock.calls[0][0])).toBe(true);
    expect(text).toContain('Session recall incomplete');
    expect(text).not.toContain('PRIVATE_');
    expect(text).not.toMatch(/0 file|no files/);
  });

  it('L07 actual SQL preserves creator-only unbound viewer access and every private retained parent', async () => {
    const q = { query: (sql: string, args: unknown[] = []) => pg.query<Record<string, unknown>>(sql, args) };
    const input = { organizationId: 172, userId: 1721, fileIds: ['file_172_abcd'] };
    await expect(assertAnaUploadAccess(q, input)).resolves.toBeUndefined();
    await expect(admitAnaSelectedSources(q, { organizationId: 172, userId: 1721, sourceIds: [17277] })).resolves.toBeUndefined();
    await expect(assertAnaUploadAccess(q, { ...input, userId: 1722 })).rejects.toMatchObject({ status: 403 });
    await pg.exec(`INSERT INTO cre_evidence_sources VALUES(17278,172,'project_private','${PROGRAM}',17201,
      'client_document',1721,'{"origin":"chat_upload","fileUploadId":"file_172_abcd"}',now())`);
    await expect(assertAnaUploadAccess(q, input)).rejects.toMatchObject({ status: 403 });
    await expect(admitAnaSelectedSources(q, { organizationId: 172, userId: 1721, sourceIds: [17277] })).rejects.toMatchObject({ status: 403 });
  });

  it('L08 actual follow-up functions stop cancelled model requests, including stream cancellation during settleMoves', async () => {
    const before = new AbortController();
    before.abort();
    const gateway = vi.fn(async () => { throw new Error('UNEXPECTED_PROVIDER_CALL'); });
    const staged = vi.fn(() => { throw new Error('UNEXPECTED_SOURCE_CONTEXT_STAGING'); });
    const executor = actualFollowUpModel('server/services/ana/AnaToolExecutor.ts', { signal: before.signal, gateway: { route: gateway } });
    expect(await executor([], '', 2, true)).toMatchObject({ text: '', toolCalls: [] });
    const mid = new AbortController();
    const stream = actualFollowUpModel('server/routes/ana-ri/stream.ts', { runSignal: mid.signal,
      settleMoves: async () => { mid.abort(); }, stageRound: staged, gw: { route: gateway } });
    expect(await stream([], '', 2, true)).toMatchObject({ text: '', toolCalls: [] });
    expect(staged).not.toHaveBeenCalled();
    expect(gateway).not.toHaveBeenCalled();
  });

  it('L09 actual executor withdraws source text when guarded insertion observes a source refusal after the first handoff check', async () => {
    const documentId = '72727272-2222-4222-8222-000000000001';
    const contentHash = 'a'.repeat(64);
    const text = 'PRIVATE_AFTER_GUARD_SENTINEL';
    const extractedTextSha256 = createHash('sha256').update(text).digest('hex');
    const result = JSON.stringify({ ok: true, documentId, contentHash, extractedTextSha256,
      totalChars: text.length, window: { start: 0, end: text.length, text } });
    registerToolHandler('read_project_document', async (_input, ctx) => {
      expect(deferReadReceipt(ctx, { documentId, contentHash, readBy: 1721, span: { start: 0, end: text.length },
        sourceSnapshot: { organizationId: 172, userId: 1721, programId: PROGRAM, documentId, contentHash,
          extractedTextSha256, totalChars: text.length, span: { start: 0, end: text.length } }, result })).toBe(true);
      return result;
    });
    h.verify.mockImplementation(async () => {
      if (h.write.mock.calls.length) throw new SourceReadSnapshotError();
    });
    h.write.mockRejectedValue(new SourceReadSnapshotError());
    h.gateway.mockImplementation(async () => h.gateway.mock.calls.length === 1
      ? { content: '', toolUses: [{ id: 'read_after_guard', name: 'read_project_document', input: { document_id: documentId } }],
        usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-first' }
      : { content: 'Synthetic answer.', toolUses: [], usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-second' });
    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'Read the source.' }],
      maxTokens: 512, organizationId: 172 } as any, { toolContext: SOURCE_ACTOR, maxRounds: 2 });
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.gateway).toHaveBeenCalledTimes(2);
    const nextRequest = JSON.stringify(h.gateway.mock.calls[1][0].messages);
    expect(nextRequest).not.toContain(text);
    expect(nextRequest).toMatch(/not_admitted|ANA_SOURCE_READ_NOT_ADMITTED/);
  });

  it('L10 actual executor preserves an authorized viewer read when only legacy receipt INSERT permission fails', async () => {
    const documentId = '72727272-2222-4222-8222-000000000002';
    const contentHash = 'b'.repeat(64);
    const text = 'AUTHORIZED_VIEWER_READ_SENTINEL';
    const extractedTextSha256 = createHash('sha256').update(text).digest('hex');
    const result = JSON.stringify({ ok: true, documentId, contentHash, extractedTextSha256,
      totalChars: text.length, window: { start: 0, end: text.length, text } });
    registerToolHandler('read_project_document', async (_input, ctx) => {
      expect(deferReadReceipt(ctx, { documentId, contentHash, readBy: 1721, span: { start: 0, end: text.length },
        sourceSnapshot: { organizationId: 172, userId: 1721, programId: PROGRAM, documentId, contentHash,
          extractedTextSha256, totalChars: text.length, span: { start: 0, end: text.length } }, result })).toBe(true);
      return result;
    });
    h.write.mockRejectedValue(Object.assign(new Error('Synthetic receipt INSERT permission denied'), { code: '42501' }));
    h.gateway.mockImplementation(async () => h.gateway.mock.calls.length === 1
      ? { content: '', toolUses: [{ id: 'viewer_receipt', name: 'read_project_document', input: { document_id: documentId } }],
        usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-first' }
      : { content: 'Synthetic answer.', toolUses: [], usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-second' });
    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'Read the source.' }],
      maxTokens: 512, organizationId: 172 } as any, { toolContext: SOURCE_ACTOR, maxRounds: 2 });
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.gateway).toHaveBeenCalledTimes(2);
    const nextRequest = JSON.stringify(h.gateway.mock.calls[1][0].messages);
    expect(nextRequest).toContain(text);
    expect(nextRequest).not.toContain('ANA_SOURCE_READ_NOT_ADMITTED');
  });

  it('L11 actual executor withdraws every current-round source after a later typed refusal and stops subsequent receipt attempts', async () => {
    const sources = ['A', 'B', 'C'].map((suffix, index) => {
      const documentId = `72727272-2222-4222-8222-00000000000${index + 3}`;
      const contentHash = String(index + 1).repeat(64);
      const text = `MULTI_CURRENT_ROUND_SENTINEL_${suffix}`;
      const extractedTextSha256 = createHash('sha256').update(text).digest('hex');
      const result = JSON.stringify({ ok: true, documentId, contentHash, extractedTextSha256,
        totalChars: text.length, window: { start: 0, end: text.length, text } });
      return { documentId, contentHash, text, extractedTextSha256, result };
    });
    registerToolHandler('read_project_document', async (input, ctx) => {
      const source = sources.find(s => s.documentId === input.document_id)!;
      expect(source).toBeTruthy();
      expect(deferReadReceipt(ctx, { documentId: source.documentId, contentHash: source.contentHash,
        readBy: 1721, span: { start: 0, end: source.text.length }, sourceSnapshot: {
          organizationId: 172, userId: 1721, programId: PROGRAM, documentId: source.documentId,
          contentHash: source.contentHash, extractedTextSha256: source.extractedTextSha256,
          totalChars: source.text.length, span: { start: 0, end: source.text.length },
        }, result: source.result })).toBe(true);
      return source.result;
    });
    h.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new SourceReadSnapshotError()).mockResolvedValueOnce(undefined);
    h.gateway.mockImplementation(async () => h.gateway.mock.calls.length === 1
      ? { content: '', toolUses: sources.map((s, i) => ({ id: `multi_read_${i}`, name: 'read_project_document', input: { document_id: s.documentId } })),
        usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-first' }
      : { content: 'Synthetic answer.', toolUses: [], usage: {}, provider: 'synthetic', model: 'synthetic', requestId: 'synthetic-second' });
    await executeAgenticLoop({ taskType: 'chat', messages: [{ role: 'user', content: 'Read the three sources.' }],
      maxTokens: 512, organizationId: 172 } as any, { toolContext: SOURCE_ACTOR, maxRounds: 2 });
    expect(h.write).toHaveBeenCalledTimes(2);
    expect(h.write.mock.results[0].type).toBe('return');
    expect(h.write.mock.calls.map(([r]) => r.documentId)).toEqual(sources.slice(0, 2).map(s => s.documentId));
    expect(h.gateway).toHaveBeenCalledTimes(2);
    const nextRequest = JSON.stringify(h.gateway.mock.calls[1][0].messages);
    for (const source of sources) expect(nextRequest).not.toContain(source.text);
    expect(nextRequest).toContain('unconfirmed');
    expect(nextRequest).not.toContain('receiptRecorded');
  });
});
