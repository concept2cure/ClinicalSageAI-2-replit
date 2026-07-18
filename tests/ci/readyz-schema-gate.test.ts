/**
 * /readyz schema-readiness gate.
 *
 * Regression guard for "green readiness against an unmigrated database": a
 * reachable Postgres with missing critical tables used to pass /readyz because
 * the probe only ran `select 1`. The boot-time schema verification now records
 * a verdict (startup/readiness-state) that /readyz reflects, so a
 * positively-verified missing schema fails readiness with 503.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mountFastPathHealthEndpoints } from '../../server/startup/inline-endpoints';
import { setSchemaReadiness } from '../../server/startup/readiness-state';

// A pool stub whose `query` always resolves — isolates the schema gate from
// actual connectivity so the test asserts only the schema dimension.
const okPool = { query: async () => ({ rows: [{ '?column?': 1 }] }) } as any;

function appWithHealth() {
  const app = express();
  mountFastPathHealthEndpoints(app, okPool);
  return app;
}

describe('/readyz schema-readiness gate', () => {
  beforeEach(() => setSchemaReadiness('unknown'));

  it('returns 503 and names schema when the boot check found missing tables', async () => {
    setSchemaReadiness('missing', 'missing tables: organizations, users');
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.failed).toContain('schema');
    expect(res.body.dependencies.schema).toBe('down');
    expect(res.body.schemaDetail).toContain('organizations');
  });

  it('returns 200 when the schema is verified ready', async () => {
    setSchemaReadiness('ready');
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.dependencies.schema).toBe('ok');
  });

  it('does not fail readiness on its own when schema state is unknown', async () => {
    // unknown (never verified / dev DB-less path) must not turn /readyz red —
    // only a positive 'missing' verdict does.
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.dependencies.schema).toBe('skipped');
  });
});
