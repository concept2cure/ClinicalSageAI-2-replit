import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  CircuitBreaker,
  CircuitState,
  createCircuitBreakerMiddleware,
  markExpectedUnavailable,
  getCircuitBreaker,
} from '../circuitBreaker';

const NAME = 'test-breaker';

afterEach(() => {
  getCircuitBreaker(NAME)?.destroy();
  getCircuitBreaker('send-breaker')?.destroy();
  getCircuitBreaker('sendStatus-breaker')?.destroy();
  getCircuitBreaker('ai-like')?.destroy();
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

/*
 * GA-DEMO-04 (2026-11-12, F1). The ai-service breaker on /api/ana-ri counted
 * failures for the life of the process and never counted a success. Ten 5xx
 * ever, however far apart, opened it; with no model key every turn is a 503
 * (GATEWAY_UNAVAILABLE), so ten questions blocked every /api/ana-ri request,
 * reads included, and the person saw "temporarily unavailable" in place of
 * the honest "No AI providers available". Reproduced on the running app:
 * docs/evidence/GA-READINESS/2026-11-12-GA-DEMO-04/.
 */
describe('the breaker counts consecutive failures, not lifetime ones', () => {
  function app(handler: express.RequestHandler, options = {}) {
    const a = express();
    a.use(createCircuitBreakerMiddleware('ai-like', { failureThreshold: 2, resetTimeout: 60_000, ...options }), handler);
    return a;
  }
  let fail = true;
  const flaky: express.RequestHandler = (_req, res) => { res.status(fail ? 500 : 200).json({}); };

  it('a success between two failures resets the count', async () => {
    const a = app(flaky);
    fail = true; await request(a).post('/x');
    fail = false; await request(a).post('/x');
    fail = true; await request(a).post('/x');
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.CLOSED);
    await request(a).post('/x');
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.OPEN);
  });

  it('a success while half-open closes the circuit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const a = app(flaky);
      fail = true; await request(a).post('/x'); await request(a).post('/x');
      expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.OPEN);
      vi.advanceTimersByTime(60_000);
      expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.HALF_OPEN);
      fail = false; expect((await request(a).post('/x')).status).toBe(200);
      expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.CLOSED);
    } finally { vi.useRealTimers(); }
  });

  it('a response marked as an expected unavailable state is not a failure', async () => {
    const a = app((_req, res) => { markExpectedUnavailable(res); res.status(503).json({ code: 'GATEWAY_UNAVAILABLE' }); });
    for (let i = 0; i < 5; i++) expect((await request(a).post('/x')).body.code).toBe('GATEWAY_UNAVAILABLE');
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.CLOSED);
  });

  it('with passReads, an open circuit still serves reads, and reads are not counted', async () => {
    const a = app(flaky, { passReads: true });
    fail = true; await request(a).get('/x'); await request(a).get('/x'); await request(a).get('/x');
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.CLOSED);
    await request(a).post('/x'); await request(a).post('/x');
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.OPEN);
    fail = false;
    expect((await request(a).get('/x')).status).toBe(200);
    expect((await request(a).post('/x')).status).toBe(503);
    // A read's success says nothing about the provider: the circuit stays open.
    expect(getCircuitBreaker('ai-like')?.getState()).toBe(CircuitState.OPEN);
  });

  it('the AnA breaker passes reads', async () => {
    const { createAiCircuitBreaker } = await import('../../startup/routes');
    const a = express();
    a.use(createAiCircuitBreaker(), (_req, res) => { res.status(500).json({}); });
    for (let i = 0; i < 12; i++) await request(a).post('/x');
    expect(getCircuitBreaker('ai-service')?.getState()).toBe(CircuitState.OPEN);
    expect((await request(a).get('/x')).status).toBe(500); // served by the handler, not refused by the breaker
    getCircuitBreaker('ai-service')?.destroy();
  }, 120_000);
});
