/** Execute the board's native source SQL: an org/task label cannot substitute for native ownership. */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const A = '46e5c864-08bf-4860-aa6f-36e015485015', B = '46e5c864-08bf-4860-aa6f-36e015485016';
const DOC = '10b7e1a5-3c55-4a0e-9a8e-111111111111', FOREIGN_DOC = '10b7e1a5-3c55-4a0e-9a8e-222222222222';
const CAPA = 'aabbccdd-0000-4000-8000-000000000001', FOREIGN_CAPA = 'aabbccdd-0000-4000-8000-000000000002';
const ACTION = 'aabbccdd-0000-4000-8000-000000000003', DELETED_CAPA = 'aabbccdd-0000-4000-8000-000000000004';
const h = vi.hoisted(() => ({ tasks: [] as Record<string, unknown>[], query: null as null | ((text: string, values: unknown[]) => Promise<{ rows: unknown[] }>) }));
vi.mock('../../db/requestDb', () => {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'from']) chain[key] = () => chain;
  chain.where = () => ({ orderBy: async () => h.tasks, then: (done: (value: unknown[]) => void) => done([]) });
  return { requestDb: () => chain, requestPgClient: () => ({ query: (text: string, values: unknown[]) => h.query!(text, values) }) };
});
vi.mock('../../utils/tenantContext', () => ({ getSecureOrgId: () => 7 }));
vi.mock('../../services/unified-work/unified-work-view', async original => ({
  ...await original<typeof import('../../services/unified-work/unified-work-view')>(),
  loadUnifiedWork: async () => ({ items: [], sources: { unified_tasks: { ran: true } } }),
}));
// Native SQL is real; current canonical permission decisions are separately pinned in taskBoard-quality-source.
vi.mock('../../services/authoring/authoring-program-access', () => ({ authorizeAuthoringProgram: async () => ({}) }));
vi.mock('../../services/qms/controlled-document-content', () => ({ authorizeQmsContentRead: async () => undefined }));
vi.mock('../../services/qms/training-assignment', () => ({ isQmsTrainingAssignee: async () => false, authorizeQmsTrainingRead: async () => undefined }));

import createTaskBoardRoutes from '../taskBoard.routes';
let database: PGlite;
beforeAll(async () => {
  database = new PGlite();
  h.query = (text, values) => database.query(text, values);
  await database.exec(`
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz);
    CREATE TABLE capa_records(id uuid PRIMARY KEY,program_id text);
    CREATE TABLE capa_actions(id uuid PRIMARY KEY,capa_id uuid);
    CREATE TABLE qms_documents(id integer PRIMARY KEY,organization_id integer,authoring_document_id uuid,metadata jsonb,deleted_at timestamptz);
    CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id integer,client_program_id uuid);
    CREATE TABLE qms_suppliers(id integer PRIMARY KEY,organization_id integer,deleted_at timestamptz);
    CREATE TABLE qms_internal_audits(id integer PRIMARY KEY,organization_id integer);
    CREATE TABLE qc_deviations(id integer PRIMARY KEY,organization_id integer);
    INSERT INTO regulatory_programs VALUES('${A}',7,NULL),('${B}',8,NULL),('46e5c864-08bf-4860-aa6f-36e015485017',7,NOW());
    INSERT INTO capa_records VALUES('${CAPA}','${A}'),('${FOREIGN_CAPA}','${B}'),('${DELETED_CAPA}','46e5c864-08bf-4860-aa6f-36e015485017');
    INSERT INTO capa_actions VALUES('${ACTION}','${CAPA}');
    INSERT INTO authoring_documents VALUES('${DOC}',7,'${A}'),('${FOREIGN_DOC}',8,'${B}');
    INSERT INTO qms_documents VALUES(12,7,'${DOC}','{"programId":"${B}"}',NULL),(13,7,NULL,'{}',NULL),
      (14,7,'${DOC}','{}',NOW()),(15,8,'${FOREIGN_DOC}','{}',NULL),(16,7,'${FOREIGN_DOC}','{}',NULL);
    INSERT INTO qms_suppliers VALUES(8,7,NULL),(9,8,NULL),(10,7,NOW());
    INSERT INTO qms_internal_audits VALUES(8,7),(9,8);
    INSERT INTO qc_deviations VALUES(8,7),(9,8);
  `);
}, 60_000);
afterAll(async () => { await database.close(); });

async function target(type: string, key: string): Promise<unknown> {
  h.tasks = [{ taskId: 'TASK-quality', title: 'Quality work', projectId: 999, moduleType: 'Quality', taskType: 'action', status: 'pending',
    sourceEntityType: type, sourceEntityId: key, dueDate: null, approvalHistory: [], comments: [], attachments: [] }];
  const app = express(); app.use((req, _res, next) => { req.userId = '2'; next(); });
  app.use('/api/task-management', createTaskBoardRoutes());
  const response = await request(app).get('/api/task-management/board');
  expect(response.status).toBe(200);
  return response.body.data[0].qualitySource;
}

describe('native Quality task SQL admits only its recorded organisation and binding', () => {
  it('reads the actual controlled-document tenant binding, not its contrary metadata', async () => {
    expect(await target('qms_periodic_review', 'qms-document:12')).toEqual({ kind: 'quality', qmsTab: 'sop', qmsDocumentId: '12', programId: A });
    expect(await target('qms_periodic_review', 'qms-document:13')).toEqual({ kind: 'quality', qmsTab: 'sop', qmsDocumentId: '13', programId: null });
  });
  it.each([14, 15, 16, 99])('refuses deleted, foreign, mismatched or missing controlled record %s', async id => {
    expect(await target('qms_periodic_review', `qms-document:${id}`)).toEqual({ kind: 'unresolved' });
  });
  it('joins a CAPA action through its actual parent project', async () => {
    expect(await target('capa_action', `capa-action:${ACTION}`)).toEqual({ kind: 'quality', qmsTab: 'capa', programId: A });
  });
  it.each([FOREIGN_CAPA, DELETED_CAPA])('does not expose CAPA project %s from another org or deleted program', async id => {
    expect(await target('capa_record', `capa:${id}`)).toEqual({ kind: 'unresolved' });
  });
  it.each([
    ['qms_supplier_audit', 'qms-supplier-audit:', 'suppliers'], ['qms_internal_audit', 'qms-internal-audit:', 'audits'],
    ['qms_deviation', 'qms-deviation:', 'deviations'],
  ])('keeps %s organization scope without following a foreign record', async (type, prefix, tab) => {
    expect(await target(type, `${prefix}8`)).toEqual({ kind: 'quality', qmsTab: tab, programId: null });
    expect(await target(type, `${prefix}9`)).toEqual({ kind: 'unresolved' });
  });
  it('does not open a deleted supplier', async () => {
    expect(await target('qms_supplier_audit', 'qms-supplier-audit:10')).toEqual({ kind: 'unresolved' });
  });
});
