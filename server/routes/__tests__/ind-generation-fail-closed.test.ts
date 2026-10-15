/**
 * /api/ind-generation never reports a save it did not make, and never reads a
 * failed artifact lookup as "nothing drafted yet".
 *
 * What was wrong (record step g-ind-generation-route-fails-closed):
 *  - POST /generate-section saved the drafted section by calling this server's
 *    own POST /api/concept2cure/projects/:id/artifacts over localhost with no
 *    Authorization header. That route is behind authenticateToken
 *    (server/bootstrap/register-concept2cure-routes.ts), so the save always
 *    failed. An empty catch swallowed it, and the handler fell through to
 *    `success: true` with no artifactId.
 *  - GET /status and GET /device-status read the project's artifacts the same
 *    way and turned the failed read into an empty list, so every section was
 *    reported `not_started`.
 *  - gw.route received no organizationId or userId, so the gateway's tenant
 *    placement and approved-model checks had no tenant to apply.
 *
 * The router is real. The AI gateway is a double, and global fetch stands in
 * for the server's own artifact route, answering as that route does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import request from 'supertest';

const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: () => ({ route }) }));

import router from '../ind-generation';

const TOKEN = 'Bearer caller-token-7-41';

function app() {
  const a = express();
  a.use(express.json());
  // What authenticateToken attaches for a live session (server/middleware/auth.ts).
  a.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as unknown as { user: Record<string, unknown> }).user = { id: 41, userId: 41, organizationId: 7, role: 'user' };
    next();
  });
  a.use('/api/ind-generation', router);
  return a;
}

const BODY = { projectId: '3', sectionCode: '2.5', productName: 'BX-099', indication: 'NSCLC', sponsor: 'Acme', phase: 'Phase 1' };

const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown): Promise<Response> => {
  throw new Error('fetch not scripted');
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** What authenticateToken answers a request that carries no token. */
const NO_TOKEN_401 = json(401, { error: { code: 'AUTH_001', message: 'No authentication token provided' } });

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type HeadersArg = ConstructorParameters<typeof Headers>[0];

function initOf(call: unknown[]): FetchInit {
  return (call[1] ?? {}) as FetchInit;
}
function headerOf(call: unknown[], name: string): string | undefined {
  const h = new Headers(initOf(call).headers as HeadersArg);
  return h.get(name) ?? undefined;
}

beforeEach(() => {
  route.mockReset();
  route.mockResolvedValue({ content: 'INTRODUCTION\n\nThis section summarizes the program for BX-099.' });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /generate-section: success only with a saved artifact', () => {
  it('answers success:false, with no draft content, when the save fails as the uncredentialed loopback does', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const auth = new Headers((init as FetchInit | undefined)?.headers as HeadersArg).get('authorization');
      return auth ? json(201, { success: true, data: { id: 'artifact_1' } }) : NO_TOKEN_401;
    });
    const r = await request(app()).post('/api/ind-generation/generate-section').send(BODY); // no Authorization
    expect(r.body.success, 'reported success for a save that did not happen').toBe(false);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.data?.artifactId).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain('This section summarizes');
    expect(r.body.error).toMatch(/not saved/i);
  });

  it('answers success:false when the save throws (connection refused)', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5000'));
    const r = await request(app()).post('/api/ind-generation/generate-section').set('Authorization', TOKEN).send(BODY);
    expect(r.body.success).toBe(false);
    expect(r.status).toBe(502);
  });

  it('answers success:false when the save answers 2xx but returns no artifact id', async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: {} }));
    const r = await request(app()).post('/api/ind-generation/generate-section').set('Authorization', TOKEN).send(BODY);
    expect(r.body.success).toBe(false);
    expect(r.status).toBe(502);
  });

  it("passes the artifact route's 404 through: the project is not the caller's", async () => {
    fetchMock.mockResolvedValue(json(404, { success: false, error: 'Project not found' }));
    const r = await request(app()).post('/api/ind-generation/generate-section').set('Authorization', TOKEN).send(BODY);
    expect(r.status).toBe(404);
    expect(r.body.success).toBe(false);
  });

  it("saves with the caller's own credentials and reports the artifact id the store returned", async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { id: 'artifact_9' } }));
    const r = await request(app()).post('/api/ind-generation/generate-section').set('Authorization', TOKEN).send(BODY);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.artifactId).toBe('artifact_9');
    const save = fetchMock.mock.calls.find((c) => initOf(c).method === 'POST');
    expect(save, 'no save was attempted').toBeDefined();
    expect(String(save![0])).toMatch(/\/api\/concept2cure\/projects\/3\/artifacts$/);
    expect(headerOf(save!, 'authorization')).toBe(TOKEN);
  });

  it("gives the gateway the caller's organizationId and userId", async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { id: 'artifact_9' } }));
    await request(app()).post('/api/ind-generation/generate-section').set('Authorization', TOKEN).send(BODY);
    expect(route).toHaveBeenCalledTimes(1);
    expect(route.mock.calls[0][0]).toMatchObject({ organizationId: 7, userId: 41, callerModule: 'ind-generation' });
  });

  it.each([
    ['missing', undefined],
    ['a path segment', '../../admin'],
    ['dot-dot', '..'],
  ])('refuses a %s projectId with 400 before any model call', async (_label, projectId) => {
    const r = await request(app())
      .post('/api/ind-generation/generate-section')
      .set('Authorization', TOKEN)
      .send({ ...BODY, projectId });
    expect(r.status).toBe(400);
    expect(r.body.success).toBe(false);
    expect(route).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /status and /device-status: a failed read is an error, not "not started"', () => {
  it('/status answers an error, with no sections, when the artifact read fails', async () => {
    fetchMock.mockResolvedValue(NO_TOKEN_401);
    const r = await request(app()).get('/api/ind-generation/status/3');
    expect(r.body.success, 'a failed read was reported as a project status').toBe(false);
    expect(r.status).toBe(502);
    expect(r.body.data).toBeUndefined();
  });

  it('/status answers an error when the read throws', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5000'));
    const r = await request(app()).get('/api/ind-generation/status/3').set('Authorization', TOKEN);
    expect(r.body.success).toBe(false);
    expect(r.status).toBe(502);
  });

  it('/status passes the 404 through for a project that is not the caller\'s', async () => {
    fetchMock.mockResolvedValue(json(404, { success: false, error: 'Project not found' }));
    const r = await request(app()).get('/api/ind-generation/status/3').set('Authorization', TOKEN);
    expect(r.status).toBe(404);
    expect(r.body.success).toBe(false);
  });

  it("/status reads with the caller's credentials and maps the saved artifacts", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: [{ id: 'artifact_9', ctdSection: '2.5', status: 'draft' }] }));
    const r = await request(app()).get('/api/ind-generation/status/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    const s25 = r.body.data.sections.find((s: { code: string }) => s.code === '2.5');
    expect(s25).toMatchObject({ status: 'draft', artifactId: 'artifact_9' });
    expect(headerOf(fetchMock.mock.calls[0], 'authorization')).toBe(TOKEN);
  });

  it('/device-status answers an error, with no sections, when the artifact read fails', async () => {
    fetchMock.mockResolvedValue(NO_TOKEN_401);
    const r = await request(app()).get('/api/ind-generation/device-status/510K/3');
    expect(r.body.success).toBe(false);
    expect(r.status).toBe(502);
    expect(r.body.data).toBeUndefined();
  });

  it('refuses a malformed projectId on both reads without a fetch', async () => {
    for (const path of ['/api/ind-generation/status/a%2Fb', '/api/ind-generation/device-status/510K/a.b']) {
      const r = await request(app()).get(path).set('Authorization', TOKEN);
      expect(r.status, path).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
