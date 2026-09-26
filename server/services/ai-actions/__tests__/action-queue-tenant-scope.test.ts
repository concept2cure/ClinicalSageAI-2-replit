/**
 * Queued AI actions run in the scope of the organization that enqueued them.
 *
 * The Bull worker ran every job with no tenant scope. Under RLS_ENFORCE=on that
 * refuses the job's queries, and the AI gateway — which binds a tenant's
 * placement policy from the ambient scope — could not tell whose floor applied.
 * Launch row D6.
 */
import { describe, expect, it } from 'vitest';
import { inRequesterScope } from '../action-queue';
import { getTenantScope } from '../../../db/tenantStore';

const requester = (organizationId: number | undefined) => ({
  requestedBy:
    organizationId === undefined
      ? undefined
      : { userId: 1, userName: 'reviewer', organizationId },
});

describe('inRequesterScope', () => {
  it('runs the job in the tenant scope of the requesting organization', async () => {
    const seen = await inRequesterScope(requester(42), 'ai-action-queue:1', async () => getTenantScope());
    expect(seen).toMatchObject({ tenantId: '42', source: 'job', caller: 'ai-action-queue:1' });
    expect(seen?.role ?? null).toBeNull();
  });

  it('a job with no organization is not given one', async () => {
    expect(await inRequesterScope(requester(undefined), 'ai-action-queue:2', async () => getTenantScope())).toBeUndefined();
  });

  it('a non-positive or non-integer organization id is not trusted as a tenant', async () => {
    expect(await inRequesterScope(requester(0), 'q', async () => getTenantScope())).toBeUndefined();
    expect(await inRequesterScope(requester(4.5), 'q', async () => getTenantScope())).toBeUndefined();
  });
});
