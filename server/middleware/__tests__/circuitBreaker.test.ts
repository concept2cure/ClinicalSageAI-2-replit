import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  CircuitBreaker,
  CircuitState,
  createCircuitBreakerMiddleware,
  getCircuitBreaker,
} from '../circuitBreaker';

const NAME = 'test-breaker';

afterEach(() => {
  getCircuitBreaker(NAME)?.destroy();
  getCircuitBreaker('send-breaker')?.destroy();
  getCircuitBreaker('sendStatus-breaker')?.destroy();
});

function makeApp(name: string, handler: express.RequestHandler) {
  const app = express();
  app.get('/x', createCircuitBreakerMiddleware(name, { failureThreshold: 2, resetTimeout: 60_000 }), handler);
  return app;
}

describe('createCircuitBreakerMiddleware — failure detection via finish event', () => {
  it('records 5xx responses sent through res.json', async () => {
    const app = makeApp(NAME, (_req, res) => {
      res.status(500).json({ error: 'fail' });
    });
    await request(app).get('/x');
    await request(app).get('/x');
    expect(getCircuitBreaker(NAME)?.getState()).toBe(CircuitState.OPEN);
  });

  it('records 5xx responses sent through res.send (regression)', async () => {
    const app = makeApp('send-breaker', (_req, res) => {
      res.status(500).send('boom');
    });
    await request(app).get('/x');
    await request(app).get('/x');
    expect(getCircuitBreaker('send-breaker')?.getState()).toBe(CircuitState.OPEN);
  });

  it('records 5xx responses sent through res.sendStatus (regression)', async () => {
    const app = makeApp('sendStatus-breaker', (_req, res) => {
      res.sendStatus(503);
    });
    await request(app).get('/x');
    await request(app).get('/x');
    expect(getCircuitBreaker('sendStatus-breaker')?.getState()).toBe(CircuitState.OPEN);
  });

  it('does not record 2xx responses as failures', async () => {
    const app = makeApp(NAME, (_req, res) => {
      res.status(200).json({ ok: true });
    });
    await request(app).get('/x');
    await request(app).get('/x');
    await request(app).get('/x');
    expect(getCircuitBreaker(NAME)?.getState()).toBe(CircuitState.CLOSED);
  });

  it('fast-fails with 503 when the breaker is open', async () => {
    const breaker = new CircuitBreaker(NAME, { failureThreshold: 1, resetTimeout: 60_000 });
    breaker.recordFailure(new Error('seed'));
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    const app = express();
    app.get('/x', createCircuitBreakerMiddleware(NAME), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const response = await request(app).get('/x');
    expect(response.status).toBe(503);
    expect(response.body).toEqual(expect.objectContaining({ status: 'circuit_open' }));
  });
});
