/**
 * Deep research says, per section and for the document, whether Data Room
 * retrieval succeeded, found nothing, or failed.
 *
 * A failure anywhere used to end retrieval for every remaining section and was
 * only logged; the document answered with `sectionsWithSources: 0`, the same as
 * an empty Data Room. The retrieval helper is real; the embedding search, the
 * model, the license gate and auth are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { searchHybrid, chat, pass } = vi.hoisted(() => ({
  searchHybrid: vi.fn(),
  chat: vi.fn(),
  pass: (_q: unknown, _s: unknown, n: () => void) => n(),
}));

vi.mock('../../middleware/auth.js', () => ({ authenticateToken: pass }));
vi.mock('../../services/license-manager.js', () => ({ loadLicense: () => pass, requireTier: () => pass }));
vi.mock('../../lib/unified-ai-client.js', () => ({ ai: { chat: (...a: unknown[]) => chat(...a) } }));
vi.mock('../../services/enhancedEmbeddingService', () => ({
  getEmbeddingService: () => ({ searchHybrid: (...a: unknown[]) => searchHybrid(...a) }),
}));
vi.mock('../../db.js', () => ({ pool: { query: vi.fn() } }));

import { runWithTenantScope } from '../../db/tenantStore';
import router from '../deep-research';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';
const HIT = { id: 'a1', title: 'Study 101 CSR', content: 'Renal clearance was measured.', score: 0.8, sourceId: null };

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, _res: Response, next: NextFunction) =>
    runWithTenantScope(
      { tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'deep-research.test' },
      () => next(),
    ),
  );
  a.use('/api/deep-research', router);
  return a;
}

const generate = () =>
  request(app())
    .post('/api/deep-research/document/generate')
    .send({ documentType: 'csr', studyInfo: { title: 'Study 101', indication: 'CKD' } });

beforeEach(() => {
  searchHybrid.mockReset();
  chat.mockReset();
  chat.mockResolvedValue({ content: 'Section text that is long enough to count as a drafted section body.' });
});

describe('deep research reports its retrieval outcome', () => {
  it('an outage is failed — for the document and every section — without its error text', async () => {
    searchHybrid.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.12:443'));
    const res = await generate();
    expect(res.status).toBe(200);
    expect(res.body.retrievalStatus).toBe('failed');
    expect(res.body.retrievalMessage).toMatch(/not grounded/i);
    expect(res.body.sections.every((s: any) => s.retrievalStatus === 'failed')).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('one failing section does not end retrieval for the rest, and the document says failed', async () => {
    searchHybrid.mockResolvedValue([HIT]).mockRejectedValueOnce(new Error('timeout'));
    const res = await generate();
    const st = res.body.sections.map((s: any) => s.retrievalStatus);
    expect(st[0]).toBe('failed');
    expect(st.slice(1).every((x: string) => x === 'ok')).toBe(true);
    expect(res.body.retrievalStatus).toBe('failed');
    expect(res.body.metrics.sectionsRetrievalFailed).toBe(1);
  });

  it('nothing above the floor is empty, not failed', async () => {
    searchHybrid.mockResolvedValue([]);
    const res = await generate();
    expect(res.body.retrievalStatus).toBe('empty');
  });

  it('evidence found is ok (positive control)', async () => {
    searchHybrid.mockResolvedValue([HIT]);
    const res = await generate();
    expect(res.body.retrievalStatus).toBe('ok');
    expect(res.body.metrics.sectionsWithSources).toBe(res.body.sections.length);
  });
});
