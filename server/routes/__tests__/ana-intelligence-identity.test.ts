/**
 * /api/claude/* takes the caller's organization and user from the
 * authenticated request, and only from there.
 *
 * The router read `req.organizationId`, which the auth chain does not set on
 * this mount (it attaches `tenantContext` and `user`), so every call reached
 * the gateway with no tenant — no placement policy, no metering, provenance
 * filed under no organization — and /batch preferred an organizationId and
 * userId supplied in the request BODY. The requests here carry the shape the
 * real middleware leaves, and a body that names someone else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const svc = vi.hoisted(() => ({
  draftDocument: vi.fn(),
  batchDraft: vi.fn(),
  reviewCompliance: vi.fn(),
  analyzeGaps: vi.fn(),
  analyzeImage: vi.fn(),
  quickComplete: vi.fn(),
}));
const audit = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock('../../services/ana/AnaDocumentDraftingService', () => ({ getAnaDraftingService: () => svc }));
vi.mock('../../services/auditService', async (orig) => {
  const real = await orig<any>();
  return { ...real, default: { ...real.default, logAction: async (row: any) => { audit.rows.push(row); } } };
});

import router from '../ana-intelligence';

const ORG = 7;
const USER = 3;
function app() {
  const a = express();
  a.use(express.json());
  // What authenticateToken leaves on a request: no req.organizationId.
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantContext = { organizationId: ORG };
    (req as any).user = { id: USER, organizationId: ORG };
    next();
  });
  a.use('/api/claude', router);
  return a;
}
const draft = { content: 'x', model: 'm', usage: { inputTokens: 1, outputTokens: 1, estimatedCostUsd: 0 }, latencyMs: 1 };
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  for (const fn of Object.values(svc)) fn.mockReset();
  audit.rows = [];
});

describe('/api/claude takes identity from the server', () => {
  it('/batch overwrites an organizationId and userId named in the body', async () => {
    svc.batchDraft.mockResolvedValue([draft]);
    const res = await request(app())
      .post('/api/claude/batch')
      .send({ requests: [{ framework: 'ich', sectionType: '§1', instructions: 'x', organizationId: 99, userId: 55 }] });
    expect(res.status).toBe(200);
    const sent = svc.batchDraft.mock.calls[0][0].requests[0];
    expect([sent.organizationId, sent.userId]).toEqual([ORG, USER]);
  });

  it('/draft passes the tenant the auth chain attached', async () => {
    svc.draftDocument.mockResolvedValue(draft);
    await request(app()).post('/api/claude/draft').send({ framework: 'ich', sectionType: '§1', instructions: 'x' });
    const sent = svc.draftDocument.mock.calls[0][0];
    expect([sent.organizationId, sent.userId]).toEqual([ORG, USER]);
  });

  it('/quick passes it too, and files its provenance under the tenant', async () => {
    svc.quickComplete.mockResolvedValue({ content: 'y', model: 'm' });
    await request(app()).post('/api/claude/quick').send({ prompt: 'p' });
    const opts = svc.quickComplete.mock.calls[0][1];
    expect([opts.organizationId, opts.userId]).toEqual([ORG, USER]);
    await settle();
    expect(audit.rows.map((r) => [r.action, r.tenantId, r.userId])).toEqual([['ai_generation', ORG, USER]]);
  });
});
