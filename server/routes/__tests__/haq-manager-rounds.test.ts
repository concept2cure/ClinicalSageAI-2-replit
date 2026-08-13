/**
 * GET /api/haq-manager/rounds — v2 HaqManager display contract.
 *
 * The v2 surface adopts this read (authority letters as "rounds" + their
 * questions grouped by round) and falls back to its codebase fixture when the
 * store is empty or unreachable. Locks: the { data: { rounds, questions } }
 * envelope with the exact display keys, questions grouped under their letter,
 * null data when the org has no letters, and fail-closed on a store error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const queryMock = vi.fn();
vi.mock('../../utils/feature-persistence', () => ({
  createFeatureStore: () => ({ query: (...a: unknown[]) => queryMock(...a) }),
}));

import haqRouter from '../haq-manager';

function app() {
  const a = express();
  a.use('/api/haq-manager', haqRouter);
  return a;
}

beforeEach(() => queryMock.mockReset());

/** Route the store's query by subcategory so letters/questions are independent. */
function stub(letters: unknown[], questions: unknown[]) {
  queryMock.mockImplementation(async (_org: number, subcategory: string) =>
    subcategory === 'letter' ? letters : questions,
  );
}

describe('GET /api/haq-manager/rounds', () => {
  it('maps store rows to the v2 rounds + grouped-questions shape', async () => {
    stub(
      [{ letterId: 'fda-ir1', agency: 'FDA', flag: 'US', authority: 'FDA / CDER', submission: 'BX-204', type: 'IR', received: '2026-06-09', due: '2026-06-23', clockDays: 6, clockTotal: 14, note: 'x' }],
      [{ qid: 'IR-1', letterId: 'fda-ir1', disc: 'Clinical', tone: 'err', status: 'in-review', owner: 'J. Chen', q: 'Q?', analysis: 'a', draft: 'd', cites: [{ src: 'CSR', ok: true }], commitments: [], precedentNote: 'p' }],
    );
    const res = await request(app()).get('/api/haq-manager/rounds');
    expect(res.status).toBe(200);
    expect(res.body.data.rounds).toHaveLength(1);
    expect(res.body.data.rounds[0].id).toBe('fda-ir1');
    for (const k of ['agency', 'flag', 'authority', 'type', 'clockDays', 'clockTotal']) {
      expect(res.body.data.rounds[0]).toHaveProperty(k);
    }
    const grouped = res.body.data.questions['fda-ir1'];
    expect(grouped).toHaveLength(1);
    expect(grouped[0].id).toBe('IR-1');
    expect(grouped[0].roundId).toBe('fda-ir1');
    for (const k of ['disc', 'tone', 'status', 'q', 'draft', 'cites', 'commitments']) {
      expect(grouped[0]).toHaveProperty(k);
    }
  });

  it('drops questions whose letter is not in the org set', async () => {
    stub(
      [{ letterId: 'fda-ir1' }],
      [{ qid: 'IR-1', letterId: 'fda-ir1' }, { qid: 'X-9', letterId: 'other' }],
    );
    const res = await request(app()).get('/api/haq-manager/rounds');
    expect(res.status).toBe(200);
    expect(res.body.data.questions['fda-ir1']).toHaveLength(1);
    expect(res.body.data.questions.other).toBeUndefined();
  });

  it('returns null data when the org has no letters', async () => {
    stub([], []);
    const res = await request(app()).get('/api/haq-manager/rounds');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.count).toBe(0);
  });

  // Regression: this used to assert 200 + pendingStore for ANY thrown error,
  // which is the same body the route returns for "this org has no open health
  // authority questions". A failed read of an authority's outstanding questions
  // therefore looked like an empty HAQ workbench — the reading under which a
  // response deadline quietly lapses. Only a genuinely unprovisioned store
  // (42P01) may degrade; everything else is a 500.
  it('500s when the store query throws — never a 200 empty', async () => {
    queryMock.mockRejectedValueOnce(new Error('store unreachable'));
    const res = await request(app()).get('/api/haq-manager/rounds');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.data).toBeUndefined();
  });

  it('still degrades to pendingStore when the store is not provisioned (42P01)', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(app()).get('/api/haq-manager/rounds');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
