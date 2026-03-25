import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import controlPlaneRouter from '../control-plane.router';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/control-plane', controlPlaneRouter);
  return app;
}

describe('control-plane router', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPersist = process.env.ANA_KERNEL_PERSIST;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ANA_KERNEL_PERSIST = originalPersist;
  });

  it('returns policy in non-production mode', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp();
    const res = await request(app).get('/api/control-plane/kernel/policy');

    expect(res.status).toBe(200);
    expect(res.body?.policy?.id).toBeTruthy();
  });

  it('rejects access in production without admin/token', async () => {
    process.env.NODE_ENV = 'production';
    const app = makeApp();
    const res = await request(app).get('/api/control-plane/kernel/policy');

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
  });


  it('returns rule catalog', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp();
    const res = await request(app).get('/api/control-plane/kernel/rules');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body?.rules)).toBe(true);
    expect(res.body?.rules?.length).toBeGreaterThan(0);
  });

  it('simulates a decision', async () => {
    process.env.NODE_ENV = 'test';
    const app = makeApp();
    const res = await request(app).post('/api/control-plane/kernel/simulate').send({
      method: 'DELETE',
      path: '/api/audit/events',
      actorId: 'u1',
    });

    expect(res.status).toBe(200);
    expect(res.body?.decision?.enforcedDecision).toBe('deny');
  });


  it('returns audit report envelope', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ANA_KERNEL_PERSIST = 'false';

    const app = makeApp();
    const res = await request(app).get('/api/control-plane/kernel/audit-report?hours=12');

    expect(res.status).toBe(200);
    expect(res.body?.report?.windowHours).toBe(12);
    expect(typeof res.body?.report?.maturityScore).toBe('number');
    expect(typeof res.body?.report?.riskSignals?.scientificIntegrityFlagPct).toBe('number');
    expect(typeof res.body?.report?.controlCoverage?.tracesWithRegulatoryReferencePct).toBe('number');
    expect(Array.isArray(res.body?.report?.recommendations)).toBe(true);
  });

  it('returns persistent summary envelope', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ANA_KERNEL_PERSIST = 'false';

    const app = makeApp();
    const res = await request(app).get('/api/control-plane/kernel/summary/persistent?hours=6');

    expect(res.status).toBe(200);
    expect(res.body?.persistenceEnabled).toBe(false);
    expect(res.body?.windowHours).toBe(6);
    expect(res.body?.summary?.total).toBe(0);
  });
});
