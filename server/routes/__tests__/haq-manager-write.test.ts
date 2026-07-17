/**
 * POST /api/haq-manager/questions — WRITE-BACK for the v2 HaqManager
 * "Log question" form.
 *
 * Locks: org-scoped persist (org from the request's tenant context, default 1),
 * 400 when roundId or q is missing, a store.insert into subcategory 'question'
 * with a payload whose letterId === roundId, and a 201 response whose data is the
 * question mapped exactly as GET /rounds maps questions (id === qid, roundId ===
 * letterId). This is a plain persisted create — no audited-ledger claim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryMock = vi.fn();
const insertMock = vi.fn();
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({
    query: (...a: unknown[]) => queryMock(...a),
    insert: (...a: unknown[]) => insertMock(...a),
  }),
}));

import haqRouter from '../haq-manager';

/** Build an app; `org` (when set) is stamped onto tenantContext by getOrgId. */
function app(org?: number) {
  const a = express();
  a.use(express.json());
  if (org !== undefined) {
    a.use((req, _res, next) => {
      (req as any).tenantContext = { organizationId: org };
      next();
    });
  }
  a.use('/api/haq-manager', haqRouter);
  return a;
}

beforeEach(() => {
  queryMock.mockReset();
  insertMock.mockReset();
  insertMock.mockResolvedValue({ id: 42 });
});

describe('POST /api/haq-manager/questions', () => {
  it('400s when roundId is missing', async () => {
    const res = await request(app())
      .post('/api/haq-manager/questions')
      .send({ q: 'Why?' });
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('400s when q is missing', async () => {
    const res = await request(app())
      .post('/api/haq-manager/questions')
      .send({ roundId: 'fda-ir1' });
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('persists into subcategory "question" with letterId === roundId and returns the mapped question', async () => {
    const res = await request(app())
      .post('/api/haq-manager/questions')
      .send({
        roundId: 'fda-ir1',
        qid: 'IR-07',
        disc: 'Clinical',
        tone: 'err',
        owner: 'J. Chen',
        q: 'Provide the exposure-response analysis.',
      });

    expect(res.status).toBe(201);
    expect(insertMock).toHaveBeenCalledTimes(1);

    const [orgArg, subcategory, title, payload] = insertMock.mock.calls[0];
    expect(orgArg).toBe(1); // default org when no tenant context
    expect(subcategory).toBe('question');
    expect(title).toBe('IR-07');
    expect(payload.letterId).toBe('fda-ir1');
    expect(payload.qid).toBe('IR-07');
    expect(Array.isArray(payload.cites)).toBe(true);
    expect(Array.isArray(payload.commitments)).toBe(true);

    // Response data mapped exactly as GET /rounds maps questions.
    expect(res.body.meta.created).toBe(true);
    expect(res.body.data.id).toBe('IR-07');
    expect(res.body.data.roundId).toBe('fda-ir1');
    expect(res.body.data.disc).toBe('Clinical');
    expect(res.body.data.tone).toBe('err');
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.owner).toBe('J. Chen');
    expect(res.body.data.q).toBe('Provide the exposure-response analysis.');
    expect(res.body.data.cites).toEqual([]);
    expect(res.body.data.commitments).toEqual([]);
  });

  it('scopes the write to the request org and defaults qid/status when omitted', async () => {
    const res = await request(app(7))
      .post('/api/haq-manager/questions')
      .send({ roundId: 'ema-d120', q: 'Clarify the labeling.' });

    expect(res.status).toBe(201);
    const [orgArg, , , payload] = insertMock.mock.calls[0];
    expect(orgArg).toBe(7); // org from tenantContext
    expect(payload.status).toBe('draft'); // default status
    expect(String(payload.qid)).toMatch(/^IR-/); // generated qid
    expect(res.body.data.id).toBe(payload.qid);
    expect(res.body.data.roundId).toBe('ema-d120');
  });

  it('500s when the store insert throws (client keeps its local copy)', async () => {
    insertMock.mockRejectedValueOnce(
      new Error('relation "project_memory_entries" does not exist'),
    );
    const res = await request(app())
      .post('/api/haq-manager/questions')
      .send({ roundId: 'fda-ir1', q: 'Why?' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
