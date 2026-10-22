/**
 * POST /api/ana-ri/generate answers 401 to a request with no signed-in user,
 * and generates nothing.
 *
 * What the code used to do (until 2026-10-15): the route checked only the
 * organization and handed `userId: undefined` to generateArtifact, which
 * refuses a missing user ({ success: false, error: 'A signed-in user is
 * required; nothing was generated.' }). The route mapped that refusal to
 * 502 GENERATION_FAILED — an upstream failure — for what is a request with no
 * actor.
 */
import express, { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  userId: null as number | null,
  generate: vi.fn(),
}));

vi.mock('../../../db.js', () => ({ getPool: () => ({ query: async () => ({ rows: [] }) }) }));
vi.mock('../../../services/ai-gateway/index.js', () => ({ getGateway: () => ({}) }));
vi.mock('../../../services/ana-ri/artifact-generator.js', () => ({ generateArtifact: h.generate }));

import { mountGenerateExecuteRoutes } from '../generate-execute';

const router = Router();
mountGenerateExecuteRoutes(router);
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as any).tenantId = 4;
  if (h.userId !== null) (req as any).userId = h.userId;
  next();
});
app.use('/api/ana-ri', router);

const BODY = {
  action_type: 'risk_memo',
  conversation_context: [{ role: 'user', content: 'Summarise the hepatotoxicity risk' }],
  project_id: 12,
};

beforeEach(() => {
  h.userId = null;
  h.generate.mockReset().mockImplementation(async (req: { userId?: number }) =>
    typeof req.userId === 'number' && req.userId > 0
      ? { success: true, persistenceStatus: 'persisted', content: 'memo', title: 'Risk memo', artifactId: 'a-1', isNew: true }
      : { success: false, content: '', title: '', error: 'A signed-in user is required; nothing was generated.' });
});

describe('POST /api/ana-ri/generate', () => {
  it('answers 401 NO_AUTH with no signed-in user, and generates nothing', async () => {
    const res = await request(app).post('/api/ana-ri/generate').send(BODY);

    expect(res.status, 'the generator refusing a missing user was answered as an upstream failure').toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'A signed-in user is required', code: 'NO_AUTH', details: null },
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('generates as the signed-in user', async () => {
    h.userId = 7;
    const res = await request(app).post('/api/ana-ri/generate').send(BODY);

    expect(res.status).toBe(200);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate.mock.calls[0][0]).toMatchObject({ userId: 7, organizationId: 4, projectId: 12 });
  });
});
