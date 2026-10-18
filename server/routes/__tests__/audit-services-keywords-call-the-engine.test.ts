/**
 * The keyword routes call the keyword engine with what was posted.
 *
 * POST /keywords/extract passed (content, organizationId, options) to
 * extractKeywords(content, documentId, projectId, organizationId, options):
 * the organisation landed as the document id, the options object as the
 * project, and the organisation as undefined. POST /keywords/consistency
 * passed the posted documents array as checkKeywordConsistency's projectId,
 * so the engine ignored them and read the organisation's audit log instead.
 * Engine persistence is stubbed; project admission and the request-bound executor are explicit test seams.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ extract: vi.fn(), consistency: vi.fn(), admit:vi.fn(), executor:{ connect:vi.fn() },
  Refusal:class ProjectAdmissionRefusal extends Error {
    constructor(readonly status:number, readonly code:string, message:string) { super(message); }
  },
}));
vi.mock('../c2c/project-access', () => ({ requireProjectAdmission:h.admit, ProjectAdmissionRefusal:h.Refusal }));
vi.mock('../../db/requestDb', () => ({ requestConnectable:() => h.executor }));
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
  h.admit.mockReset().mockResolvedValue({ id:12, organizationId:5 });
  h.extract.mockReset().mockResolvedValue({ keywords: [] });
  h.consistency.mockReset().mockResolvedValue({ terms: [] });
});

describe('POST /api/audit-services/keywords/extract', () => {
  it('does not extract or link sources from an inaccessible project', async () => {
    h.admit.mockRejectedValue(new h.Refusal(404, 'PROJECT_NOT_FOUND', 'Project not found'));
    const r = await request(app()).post('/api/audit-services/keywords/extract')
      .send({ content:'SAE reporting', documentId:'doc-7', projectId:12 });
    expect(r.status).toBe(404);
    expect(h.extract).not.toHaveBeenCalled();
  });

  it('passes the document, its project and the session’s organisation in their places', async () => {
    const r = await request(app()).post('/api/audit-services/keywords/extract')
      .send({ content: 'Primary endpoint per ICH E9(R1).', documentId: 'doc-7', projectId: 12, organizationId: 999 });
    expect(r.status).toBe(200);
    expect(h.extract).toHaveBeenCalledWith('Primary endpoint per ICH E9(R1).', 'doc-7', 12, 5, expect.objectContaining({ userId:17 }));
    expect(h.admit).toHaveBeenCalledWith(expect.anything(), '12', false);
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
    expect(h.admit).not.toHaveBeenCalled();
  });
});
