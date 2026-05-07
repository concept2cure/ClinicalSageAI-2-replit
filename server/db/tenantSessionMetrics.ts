/**
 * Prometheus counters for the RLS rollout observability window (PR A).
 *
 * Two counters:
 *   - `tenant_session_var_present_total` — query issued from inside a tenant
 *     scope (request middleware or `withTenant`).
 *   - `tenant_session_var_missing_total` — query issued from no tenant scope.
 *     Each increment is also logged at WARN with caller info so the offending
 *     code path can be hunted down before PR B flips on policy enforcement.
 *
 * The ratio missing / (missing + present) is the gap. Goal before PR B: zero
 * for 48 hours straight in production.
 *
 * We use the prom-client global registry — same pattern as `server/metrics.js`
 * — and `getOrCreateMetric` so a hot reload does not blow up with
 * "metric already registered".
 */

import client from 'prom-client';

function getOrCreate<T extends client.Metric<string>>(name: string, factory: () => T): T {
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as T;
  return factory();
}

export const tenantSessionVarPresent = getOrCreate(
  'tenant_session_var_present_total',
  () =>
    new client.Counter({
      name: 'tenant_session_var_present_total',
      help: 'DB queries issued with a tenant AsyncLocalStorage scope set.',
      labelNames: ['source', 'op'] as const,
    })
);

export const tenantSessionVarMissing = getOrCreate(
  'tenant_session_var_missing_total',
  () =>
    new client.Counter({
      name: 'tenant_session_var_missing_total',
      help:
        'DB queries issued with NO tenant AsyncLocalStorage scope set. ' +
        'When RLS is enabled (PR B) these queries would silently return zero rows. ' +
        'Drive this to zero before flipping on policy enforcement.',
      labelNames: ['op', 'caller'] as const,
    })
);
