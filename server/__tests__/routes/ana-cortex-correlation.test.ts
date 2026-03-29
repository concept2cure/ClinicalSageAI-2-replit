import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

describe('AnA Cortex chat correlation metadata', () => {
  it('echoes x-correlation-id and source surface in /chat metadata', async () => {
    const { default: router } = await import('../../routes/ana-cortex');
    const app = express();
    app.use(express.json());
    app.use('/api/ana-cortex', router);

    const res = await request(app)
      .post('/api/ana-cortex/chat')
      .set('x-correlation-id', 'test-corr-123')
      .send({
        message: 'hello',
        source_surface: 'test_surface',
        context: { screen: 'test' },
      });

    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('test-corr-123');
    expect(res.body?._meta?.correlationId).toBe('test-corr-123');
    expect(res.body?._meta?.sourceSurface).toBe('test_surface');
  });
});

