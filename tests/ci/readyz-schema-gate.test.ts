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

  // ───────────────────────────────────────────────────────────────────────────
  // This assertion is INVERTED from its original form, deliberately.
  //
  // It used to require that 'unknown' return 200 ("must not turn /readyz red —
  // only a positive 'missing' verdict does"). That codified fail-OPEN, and
  // startup/services.ts had five terminal branches — including the catch that
  // runs when schema verification itself throws — which never recorded a
  // verdict at all. The state stayed 'unknown' and the probe served 200. A
  // readiness probe that answers "yes" when it never managed to check is worse
  // than no probe, because it is trusted.
  //
  // 'unknown' is now unreachable in a correctly-booted process: index.ts awaits
  // verifyDatabaseConnection before listening, and every branch there now sets
  // a state. Observing it means a code path forgot to record one, which is a
  // bug that should be loud.
  // ───────────────────────────────────────────────────────────────────────────
  it('FAILS readiness when schema state is unknown (never verified)', async () => {
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.failed).toContain('schema');
    expect(res.body.dependencies.schema).toBe('down');
    expect(res.body.schemaState).toBe('unknown');
    expect(res.body.schemaDetail).toMatch(/never verified/i);
  });

  it('FAILS readiness when schema verification itself threw', async () => {
    setSchemaReadiness('error', 'core table verification threw: connection reset');
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.dependencies.schema).toBe('down');
    expect(res.body.schemaState).toBe('error');
    expect(res.body.schemaDetail).toContain('connection reset');
  });

  it('serves traffic when degraded, but names the missing tables', async () => {
    // Non-essential module tables absent: the platform works, those modules do
    // not. Serving is correct; hiding it is not.
    setSchemaReadiness('degraded', 'important tables missing: cerv2_510k_sections');
    const res = await request(appWithHealth()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.dependencies.schema).toBe('ok');
    expect(res.body.schemaState).toBe('degraded');
    expect(res.body.schemaDetail).toContain('cerv2_510k_sections');
  });
});
