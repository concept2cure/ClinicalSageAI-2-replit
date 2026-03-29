import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

describe('AI actions correlation header', () => {
  it('returns x-correlation-id on auth error responses', async () => {
    const { default: router } = await import('../../routes/ai-actions');
    const app = express();
    app.use(express.json());
    app.use('/api/ai-actions', router);

    const res = await request(app)
      .post('/api/ai-actions/execute')
      .set('x-correlation-id', 'test-ai-actions-corr')
      .send({ actionType: 'promote_artifact' });

    expect(res.status).toBe(401);
    expect(res.headers['x-correlation-id']).toBe('test-ai-actions-corr');
  });
});

