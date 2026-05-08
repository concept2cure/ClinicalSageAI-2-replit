/**
 * Regression test: the RLS observability counters live on prom-client's
 * default global registry (via `getSingleMetric`), but `/metrics` is
 * served from a *custom* registry in server/metrics.js. Without merging
 * the two, the counters would be incremented but never scraped — and the
 * whole observability story for the RLS rollout (PR A → flip → PR B)
 * would be silent.
 *
 * This test pins the merge behavior so a future refactor cannot break
 * scrape coverage without an alarm here.
 *
 * We test the merge directly (not via the Express request stack) because
 * the merge IS the load-bearing piece — the Express layer is just glue.
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import client from 'prom-client';

import { tenantSessionVarMissing, tenantSessionVarPresent } from '../db/tenantSessionMetrics';
// metrics.js is a JS module; rely on dynamic require typing.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setupMetricsEndpoint } = require('../metrics.js');

describe('/metrics scrape merges global + custom registries', () => {
  it('exposes tenant_session_var_missing_total in the scrape body', async () => {
    tenantSessionVarMissing.inc({ op: 'pool.query', caller: 'test:metrics-scrape' });

    const app = setupMetricsEndpoint();
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('tenant_session_var_missing_total');
    expect(res.text).toMatch(/caller="test:metrics-scrape"/);
  });

  it('exposes tenant_session_var_present_total in the scrape body', async () => {
    tenantSessionVarPresent.inc({ source: 'request', op: 'pool.query' });

    const app = setupMetricsEndpoint();
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('tenant_session_var_present_total');
  });

  it('still exposes the legacy custom-registry metrics (no regression)', async () => {
    const app = setupMetricsEndpoint();
    const res = await request(app).get('/metrics');

    expect(res.text).toContain('trialsage_cer_jobs_total');
  });

  it('uses prom-client text exposition format (HELP/TYPE lines present)', async () => {
    const app = setupMetricsEndpoint();
    const res = await request(app).get('/metrics');
    expect(res.text).toMatch(/# HELP tenant_session_var_missing_total/);
    expect(res.text).toMatch(/# TYPE tenant_session_var_missing_total counter/);
  });

  it('Registry.merge is what makes this work — guard against regression', () => {
    // Sanity: prom-client really does expose Registry.merge, and our
    // global counter is on client.register.
    expect(typeof client.Registry.merge).toBe('function');
    expect(client.register.getSingleMetric('tenant_session_var_missing_total')).toBeDefined();
  });
});
