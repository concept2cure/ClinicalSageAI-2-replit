/**
 * Prometheus counters for tenant lifecycle and quota enforcement.
 *
 * Deliberately labelled by DECISION and STATE, never by organization id.
 * Per-tenant labels look attractive for cost attribution but make cardinality a
 * function of customer count, which is how a metrics backend falls over on the
 * day the sales team has a good quarter. Per-tenant attribution belongs in the
 * audit trail and the billing tables, both of which already carry
 * organization_id and are queryable.
 *
 * Same registry and `getOrCreate` pattern as `server/db/tenantSessionMetrics.ts`
 * so a hot reload does not throw "metric already registered".
 */

import client from 'prom-client';

function getOrCreate<T extends client.Metric<string>>(name: string, factory: () => T): T {
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as T;
  return factory();
}

/**
 * Every decision the lifecycle guard makes.
 *
 * `decision` — allow | read_only_pass | read_only_block | deny | unverified
 * `state`    — the resolved TenantLifecycleState
 *
 * A rising `unverified` rate means the posture lookup is failing and tenants are
 * being refused for infrastructure reasons; alert on it separately from `deny`.
 */
export const tenantLifecycleDecisions = getOrCreate(
  'tenant_lifecycle_decisions_total',
  () =>
    new client.Counter({
      name: 'tenant_lifecycle_decisions_total',
      help:
        'Tenant lifecycle guard decisions. decision=unverified means the posture ' +
        'could not be read and the request was refused fail-closed.',
      labelNames: ['decision', 'state'] as const,
    })
);

/**
 * Quota enforcement outcomes.
 *
 * `resource` — seats | projects | storage
 * `outcome`  — allowed | denied | unverified
 */
export const tenantQuotaDecisions = getOrCreate(
  'tenant_quota_decisions_total',
  () =>
    new client.Counter({
      name: 'tenant_quota_decisions_total',
      help: 'Tenant plan-quota checks by resource and outcome.',
      labelNames: ['resource', 'outcome'] as const,
    })
);
