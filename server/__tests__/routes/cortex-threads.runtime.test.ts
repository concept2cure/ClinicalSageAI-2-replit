import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../db.js', () => ({
  pool: {
    query: (...args: unknown[]) => queryMock(...args),
  },
  getPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

vi.mock('../../middleware/auth.js', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('jsonwebtoken', () => {
  const verify = vi.fn();
  return {
    default: { verify },
    verify,
  };
});

describe('cortex threads runtime contract', () => {
  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    process.env.JWT_SECRET = 'stage8-runtime-test-secret';
  });

  it('GET /threads returns 401 when JWT is missing', async () => {
    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use('/api/cortex', router);

    const res = await request(app).get('/api/cortex/threads');
    expect(res.status).toBe(401);
    expect(res.body?.code).toBe('CORTEX_THREADS_AUTH_REQUIRED');
  });

  it('GET /threads/:threadId returns 403 when caller does not own thread', async () => {
    const jwt = (await import('jsonwebtoken')) as unknown as { verify: ReturnType<typeof vi.fn> };
    jwt.verify.mockReturnValue({ userId: 7 });

    queryMock.mockResolvedValue({
      rows: [
        {
          id: 't-1',
          user_id: 42,
          title: 'Other user thread',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use('/api/cortex', router);

    const res = await request(app)
      .get('/api/cortex/threads/t-1')
      .set('Authorization', 'Bearer valid.token.value');

    expect(res.status).toBe(403);
    expect(res.body?.code).toBe('CORTEX_THREAD_ACCESS_DENIED');
  });

  it('GET /threads returns 500 fail-closed when storage throws', async () => {
    const jwt = (await import('jsonwebtoken')) as unknown as { verify: ReturnType<typeof vi.fn> };
    jwt.verify.mockReturnValue({ userId: 99 });

    queryMock.mockRejectedValueOnce(new Error('db unavailable'));

    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use('/api/cortex', router);

    const res = await request(app)
      .get('/api/cortex/threads')
      .set('Authorization', 'Bearer valid.token.value');

    expect(res.status).toBe(500);
    expect(res.body?.code).toBe('CORTEX_THREADS_FETCH_FAILED');
  });

  it('POST /threads returns 401 when JWT is missing', async () => {
    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/cortex', router);

    const res = await request(app).post('/api/cortex/threads').send({ title: 'New thread' });
    expect(res.status).toBe(401);
    expect(res.body?.code).toBe('CORTEX_THREAD_CREATE_AUTH_REQUIRED');
  });

  it('PATCH /threads/:threadId returns 401 when JWT is missing', async () => {
    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/cortex', router);

    const res = await request(app).patch('/api/cortex/threads/t-2').send({ title: 'Renamed' });
    expect(res.status).toBe(401);
    expect(res.body?.code).toBe('CORTEX_THREAD_UPDATE_AUTH_REQUIRED');
  });

  it('DELETE /threads/:threadId returns 401 when JWT is missing', async () => {
    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use('/api/cortex', router);

    const res = await request(app).delete('/api/cortex/threads/t-3');
    expect(res.status).toBe(401);
    expect(res.body?.code).toBe('CORTEX_THREAD_DELETE_AUTH_REQUIRED');
  });

  it('PATCH /threads/:threadId returns 403 when user does not own thread', async () => {
    const jwt = (await import('jsonwebtoken')) as unknown as { verify: ReturnType<typeof vi.fn> };
    jwt.verify.mockReturnValue({ userId: 17 });
    queryMock.mockResolvedValue({ rows: [] });

    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/cortex', router);

    const res = await request(app)
      .patch('/api/cortex/threads/not-owned')
      .set('Authorization', 'Bearer valid.token.value')
      .send({ title: 'Denied title' });

    expect(res.status).toBe(403);
    expect(res.body?.error).toContain('access denied');
  });

  it('DELETE /threads/:threadId returns 403 when user does not own thread', async () => {
    const jwt = (await import('jsonwebtoken')) as unknown as { verify: ReturnType<typeof vi.fn> };
    jwt.verify.mockReturnValue({ userId: 17 });
    queryMock.mockResolvedValue({ rows: [] });

    const router = (await import('../../routes/cortex-unified')).default;
    const app = express();
    app.use('/api/cortex', router);

    const res = await request(app)
      .delete('/api/cortex/threads/not-owned')
      .set('Authorization', 'Bearer valid.token.value');

    expect(res.status).toBe(403);
    expect(res.body?.error).toContain('access denied');
  });
});
