/**
 * FeatureToggleService.workspaceInOrganization: one read of client_workspaces
 * by id and organisation, fail-closed (plan P1-7, IAM-15).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({ rows: [] as Array<{ id: number }>, throws: false, calls: 0 }));
vi.mock('../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            dbState.calls += 1;
            if (dbState.throws) throw new Error('permission denied for table client_workspaces');
            return dbState.rows;
          },
        }),
      }),
    }),
  },
}));
const scope = vi.hoisted(() => ({ current: { tenantId: '7' } as { tenantId: string } | undefined, systemRuns: 0 }));
vi.mock('../../db/tenantStore', () => ({
  getTenantScope: () => scope.current,
  runWithSystemTenantScope: async (_caller: string, fn: () => Promise<unknown>) => {
    scope.systemRuns += 1;
    return fn();
  },
}));
vi.mock('../../utils/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { FeatureToggleService } from '../featureToggleService';

beforeEach(() => {
  dbState.rows = [];
  dbState.throws = false;
  dbState.calls = 0;
  scope.current = { tenantId: '7' };
  scope.systemRuns = 0;
});

describe('workspaceInOrganization', () => {
  it('is true when the workspace row exists for that organisation', async () => {
    dbState.rows = [{ id: 5 }];
    expect(await FeatureToggleService.workspaceInOrganization(5, 7)).toBe(true);
    expect(dbState.calls).toBe(1);
  });

  it('is false when no such row exists for that organisation', async () => {
    expect(await FeatureToggleService.workspaceInOrganization(9, 7)).toBe(false);
  });

  it('fails closed when the read cannot be made', async () => {
    dbState.throws = true;
    expect(await FeatureToggleService.workspaceInOrganization(5, 7)).toBe(false);
  });

  it('refuses non-integer ids without reading', async () => {
    expect(await FeatureToggleService.workspaceInOrganization(Number.NaN, 7)).toBe(false);
    expect(await FeatureToggleService.workspaceInOrganization(5, 7.5)).toBe(false);
    expect(dbState.calls).toBe(0);
  });

  it('keeps the caller\'s scope when it has one and takes the system scope only when it has none', async () => {
    dbState.rows = [{ id: 5 }];
    await FeatureToggleService.workspaceInOrganization(5, 7);
    expect(scope.systemRuns).toBe(0);
    scope.current = undefined;
    await FeatureToggleService.workspaceInOrganization(5, 7);
    expect(scope.systemRuns).toBe(1);
  });
});
