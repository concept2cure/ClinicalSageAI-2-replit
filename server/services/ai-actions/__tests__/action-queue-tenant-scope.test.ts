/**
 * Queued AI actions run in the scope of the organization that enqueued them.
 *
 * The Bull worker ran every job with no tenant scope. Under RLS_ENFORCE=on that
 * refuses the job's queries, and the AI gateway — which binds a tenant's
 * placement policy from the ambient scope — could not tell whose floor applied.
 * Launch row D6.
 */
import { describe, expect, it, vi } from 'vitest';

// The worker itself, not only the helper: Bull is faked so the processor the
// queue registers can be run, and dispatchAction records the scope it ran in.
const Q = vi.hoisted(() => ({ processor: undefined as undefined | ((job: unknown) => Promise<unknown>), seen: [] as unknown[] }));
vi.mock('bull', () => ({
  default: class {
    process(_concurrency: number, fn: (job: unknown) => Promise<unknown>) {
      Q.processor = fn;
    }
    on() {}
  },
}));
vi.mock('../redis-manager', () => ({ isRedisAvailable: () => true }));
vi.mock('../action-registry', async () => {
  const { getTenantScope } = await import('../../../db/tenantStore');
  return {
    dispatchAction: async () => {
      Q.seen.push(getTenantScope());
      return { success: true };
    },
  };
});

import { inRequesterScope, initializeActionQueue } from '../action-queue';
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

describe('the Bull worker runs each job in its requester’s tenant scope (D6 review)', () => {
  // The cases above pin the helper; a revert of the worker call site to a bare
  // dispatchAction(...) left them green. This runs the registered processor.
  it('a queued job for organization 42 dispatches in tenant scope 42', async () => {
    process.env.REDIS_URL = 'redis://test';
    expect(await initializeActionQueue()).toBe(true);
    expect(Q.processor).toBeDefined();
    await Q.processor!({
      id: 7,
      data: { request: { actionType: 'summarize', requestedBy: { userId: 1, userName: 'r', organizationId: 42 } }, options: {} },
      progress: async () => undefined,
      opts: { attempts: 3 },
      attemptsMade: 0,
    });
    expect(Q.seen).toHaveLength(1);
    expect(Q.seen[0]).toMatchObject({ tenantId: '42', source: 'job', caller: 'ai-action-queue:7' });
  });
});
