/**
 * The keyword routes call the keyword engine with what was posted.
 *
 * POST /keywords/extract passed (content, organizationId, options) to
 * extractKeywords(content, documentId, projectId, organizationId, options):
 * the organisation landed as the document id, the options object as the
 * project, and the organisation as undefined. POST /keywords/consistency
 * passed the posted documents array as checkKeywordConsistency's projectId,
 * so the engine ignored them and read the organisation's audit log instead.
 * Only the engine module is replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ extract: vi.fn(), consistency: vi.fn() }));
vi.mock('../../services/keywordExtractionService.js', () => ({
  extractKeywords: h.extract,
  checkKeywordConsistency: h.consistency,
}));

import router from '../audit-services';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 5 };
    next();
  });
  a.use('/api/audit-services', router);
  return a;
}

beforeEach(() => {
  h.extract.mockReset().mockResolvedValue({ keywords: [] });
  h.consistency.mockReset().mockResolvedValue({ terms: [] });
});

describe('POST /api/audit-services/keywords/extract', () => {
  it('passes the document, its project and the session’s organisation in their places', async () => {
    const r = await request(app()).post('/api/audit-services/keywords/extract')
      .send({ content: 'Primary endpoint per ICH E9(R1).', documentId: 'doc-7', projectId: 12, organizationId: 999 });
    expect(r.status).toBe(200);
    expect(h.extract).toHaveBeenCalledWith('Primary endpoint per ICH E9(R1).', 'doc-7', 12, 5, expect.any(Object));
  });

  it('refuses without the project the sources are linked from', async () => {
    const r = await request(app()).post('/api/audit-services/keywords/extract').send({ content: 'x', documentId: 'd' });
    expect(r.status).toBe(400);
    expect(h.extract).not.toHaveBeenCalled();
  });
});

describe('POST /api/audit-services/keywords/consistency', () => {
  it('hands the engine the posted documents', async () => {
    const docs = [{ id: 'a', title: 'A', content: 'SAE reporting' }, { id: 'b', title: 'B', content: 'SAE narrative' }];
    const r = await request(app()).post('/api/audit-services/keywords/consistency').send({ documents: docs });
    expect(r.status).toBe(200);
    expect(h.consistency).toHaveBeenCalledWith(docs);
  });
});
