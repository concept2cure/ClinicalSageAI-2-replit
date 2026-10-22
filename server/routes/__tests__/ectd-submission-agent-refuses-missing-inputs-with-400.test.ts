/**
 * The eCTD submission agent's routes answer 400, naming the field, for a request
 * the service cannot record.
 *
 * Until 2026-10-15 prepareSchema had applicationType and sequenceNumber optional
 * (sequenceNumber any string) and addDocumentSchema had content optional. The
 * service refuses a missing application type or sequence number and a document
 * without content, so those requests passed the schema, threw inside the service,
 * and came back as a generic 500 "Failed to …" that named nothing the caller
 * could correct; a sequence number such as "1" was recorded as given.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  query: vi.fn(async (sql: string, _params?: unknown[]) => {
    if (/INSERT INTO ectd_submissions\b/.test(sql)) return { rows: [{ id: 1, status: 'draft' }] };
    if (/SELECT \* FROM ectd_submissions WHERE id/.test(sql)) return { rows: [{ id: 42, org_id: 100, status: 'draft' }] };
    if (/INSERT INTO ectd_submission_documents/.test(sql)) return { rows: [{ id: 7 }] };
    return { rows: [] };
  }),
}));
vi.mock('../../db', () => ({ getPool: () => ({ query: h.query }) }));

import router from '../ectd-submission-agent.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantContext: { organizationId: 100 } });
    next();
  });
  a.use('/api/ectd-submissions', router);
  return a;
}

const PREPARE = { submissionType: 'initial', applicationType: 'IND', sequenceNumber: '0001', agency: 'FDA' };
const DOCUMENT = {
  module: 'm2',
  sectionCode: '2.5',
  documentPath: 'm2/25-clin-over/clinical-overview.pdf',
  fileName: 'clinical-overview.pdf',
  content: '%PDF-1.4 clinical overview',
};
const writes = () => h.query.mock.calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE)/.test(String(sql)));

beforeEach(() => h.query.mockClear());

describe('POST /api/ectd-submissions/prepare', () => {
  it.each(['applicationType', 'sequenceNumber'] as const)('answers 400 naming %s when it is missing, and writes nothing', async (field) => {
    const body: Record<string, unknown> = { ...PREPARE };
    delete body[field];
    const res = await request(app()).post('/api/ectd-submissions/prepare').send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(Object.keys(res.body.details ?? {})).toContain(field);
    expect(writes()).toEqual([]);
  });

  it.each(['1', '00001', 'abcd', '000a'])('answers 400 for sequence number "%s", which is not four digits', async (sequenceNumber) => {
    const res = await request(app()).post('/api/ectd-submissions/prepare').send({ ...PREPARE, sequenceNumber });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(Object.keys(res.body.details ?? {})).toContain('sequenceNumber');
    expect(writes()).toEqual([]);
  });

  it('records a submission whose application type and sequence number are given', async () => {
    const res = await request(app()).post('/api/ectd-submissions/prepare').send(PREPARE);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const insert = h.query.mock.calls.find(([sql]) => /INSERT INTO ectd_submissions\b/.test(String(sql)));
    expect(insert?.[1]).toEqual(expect.arrayContaining(['IND', '0001']));
  });
});

describe('POST /api/ectd-submissions/:id/documents', () => {
  it.each([
    ['without content', undefined],
    ['with empty content', ''],
  ])('answers 400 naming content for a document sent %s, and writes nothing', async (_label, content) => {
    const res = await request(app()).post('/api/ectd-submissions/42/documents').send({ ...DOCUMENT, content });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(Object.keys(res.body.details ?? {})).toContain('content');
    expect(writes()).toEqual([]);
  });

  it('adds a document sent with its content', async () => {
    const res = await request(app()).post('/api/ectd-submissions/42/documents').send(DOCUMENT);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.query.mock.calls.some(([sql]) => /INSERT INTO ectd_submission_documents/.test(String(sql)))).toBe(true);
  });
});
