/**
 * executeCommands — end-to-end fail-CLOSED authorization + governance
 * (C2C-AI-001 / C2C-AI-002).
 *
 * These are NEGATIVE tests: each one passes only because the central gate in
 * executeCommands exists. Remove the gate (or restore the old fail-soft
 * loaders) and the dispatcher reaches the handler and issues the write —
 * which is exactly what every assertion here forbids.
 *
 * The tenant-governance loaders are exercised for real through the dispatch:
 * ctx does NOT pre-stamp anaToolPolicy / part11Enforce, so both org-settings
 * reads run against the injected pool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rbac = vi.hoisted(() => ({
  hasRole: vi.fn(async () => true),
  getUserRoles: vi.fn(async () => [] as string[]),
}));

const dbState = vi.hoisted(() => ({
  // Replaced per-test. Default: every read succeeds, settings absent.
  query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] as any[], rowCount: 0 })),
}));

vi.mock('../../roleBasedAccess', () => ({
  default: {
    hasRole: (...args: unknown[]) => (rbac.hasRole as any)(...args),
    getUserRoles: (...args: unknown[]) => (rbac.getUserRoles as any)(...args),
  },
}));

// command-executor resolves its pool lazily through getPool(); returning a
// stable object keeps the call spy meaningful.
const poolStub = vi.hoisted(() => ({
  query: (...args: any[]) => (dbState.query as any)(...args),
  connect: async () => {
    throw new Error('pool.connect() not expected in these tests');
  },
}));
vi.mock('../../../db', () => ({
  db: {},
  pool: poolStub,
  getPool: () => poolStub,
  getDb: () => ({}),
}));

import {
  executeCommands,
  COMMAND_HANDLERS,
  type CommandContext,
} from '../command-executor.js';
import { loadAnaToolPolicyStrict, loadAnaToolPolicy } from '../mdx-tool-policy';
import { loadPart11EnforceStrict, loadPart11Enforce } from '../part11-governance';

const SETTINGS_SQL = /SELECT settings FROM organizations/i;

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  // No anaToolPolicy / part11Enforce pre-stamp: the real loaders run.
  return { userId: 42, organizationId: 9, ...over } as CommandContext;
}

/** Did any handler actually write? (settings reads are not handler traffic) */
function handlerWrites(): string[] {
  return dbState.query.mock.calls
    .map((c) => String(c[0]))
    .filter((sql) => !SETTINGS_SQL.test(sql));
}

beforeEach(() => {
  rbac.hasRole.mockReset();
  rbac.getUserRoles.mockReset();
  rbac.hasRole.mockResolvedValue(true);
  rbac.getUserRoles.mockResolvedValue([]);
  dbState.query.mockReset();
  dbState.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('executeCommands — central RBAC gate', () => {
  it('DENIES a mutation for a user without the required role, before the handler runs', async () => {
    rbac.hasRole.mockResolvedValue(false); // read-only reviewer

    const res = await executeCommands(
      [{ command: 'create_project', params: { name: 'Backdoor Program' } }] as any,
      ctx(),
    );

    expect(res).toHaveLength(1);
    expect(res[0].success).toBe(false);
    expect(res[0].error).toBe('RBAC_DENIED');
    // The decisive assertion: no INSERT ever reached the database.
    expect(handlerWrites()).toEqual([]);
  });

  it('ALLOWS the same mutation for a properly authorized user', async () => {
    rbac.hasRole.mockResolvedValue(true);
    dbState.query.mockImplementation(async (sql: string) => {
      if (SETTINGS_SQL.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [{ id: 77, name: 'Legit Program', status: 'active' }], rowCount: 1 };
    });

    const res = await executeCommands(
      [{ command: 'create_project', params: { name: 'Legit Program' } }] as any,
      ctx(),
    );

    expect(res[0].error).toBeUndefined();
    expect(res[0].success).toBe(true);
    expect((res[0].data as any)?.projectId).toBe(77);
    expect(handlerWrites().join(' ')).toMatch(/INSERT INTO projects/i);
    expect(rbac.hasRole).toHaveBeenCalledWith(42, 'member', 9);
  });

  it('demands the manager tier for a Part 11 record-altering command', async () => {
    rbac.hasRole.mockResolvedValue(false);

    const res = await executeCommands(
      [{ command: 'submit_document', params: { docId: 5 } }] as any,
      ctx(),
    );

    expect(res[0].error).toBe('RBAC_DENIED');
    expect(rbac.hasRole).toHaveBeenCalledWith(42, 'manager', 9);
    expect(handlerWrites()).toEqual([]);
  });

  it('leaves read-only commands working for every authenticated tenant user', async () => {
    rbac.hasRole.mockResolvedValue(false); // viewer

    const res = await executeCommands([{ command: 'list_projects', params: {} }] as any, ctx());

    expect(res[0].error).toBeUndefined();
    expect(res[0].success).toBe(true);
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });

  it('DENIES a mutation dispatched without a provable user/organization identity', async () => {
    const res = await executeCommands(
      [{ command: 'create_project', params: { name: 'No Identity' } }] as any,
      { organizationId: 9 } as CommandContext,
    );

    expect(res[0].error).toBe('COMMAND_CONTEXT_INVALID');
    expect(dbState.query).not.toHaveBeenCalled();
    expect(handlerWrites()).toEqual([]);
  });

  it.each([
    ['zero user', { userId: 0 }],
    ['fractional user', { userId: 1.5 }],
    ['negative organization', { organizationId: -1 }],
    ['invalid project', { activeProjectId: Number.NaN }],
  ])('rejects %s before governance policy loading', async (_label, over) => {
    const res = await executeCommands(
      [{ command: 'list_projects', params: {} }] as any,
      ctx(over as Partial<CommandContext>),
    );

    expect(res[0].error).toBe('COMMAND_CONTEXT_INVALID');
    expect(dbState.query).not.toHaveBeenCalled();
    expect(rbac.hasRole).not.toHaveBeenCalled();
  });
});

describe('executeCommands — a new handler cannot ship ungated', () => {
  it('DENIES a dispatchable command that has no authorization metadata', async () => {
    const handler = vi.fn(async () => ({
      success: true,
      action: 'unclassified_new_mutation',
      message: 'wrote a regulated record',
    }));
    // Simulate a developer wiring a handler into the dispatcher and forgetting
    // to classify it in command-rbac.ts.
    COMMAND_HANDLERS['unclassified_new_mutation'] = handler;
    try {
      const res = await executeCommands(
        [{ command: 'unclassified_new_mutation', params: {} }] as any,
        ctx(),
      );
      expect(res[0].success).toBe(false);
      expect(res[0].error).toBe('COMMAND_NOT_AUTHORIZED');
      expect(handler).not.toHaveBeenCalled();
    } finally {
      delete COMMAND_HANDLERS['unclassified_new_mutation'];
    }
  });
});

describe('executeCommands — fail-CLOSED governance configuration', () => {
  it('BLOCKS a mutation when the tenant tool-policy read fails (was: allow-all)', async () => {
    rbac.hasRole.mockResolvedValue(true);
    dbState.query.mockImplementation(async (sql: string) => {
      if (SETTINGS_SQL.test(sql)) throw new Error('connection terminated unexpectedly');
      return { rows: [{ id: 1 }], rowCount: 1 };
    });

    const res = await executeCommands(
      [{ command: 'create_project', params: { name: 'Outage Program' } }] as any,
      ctx(),
    );

    expect(res[0].success).toBe(false);
    expect(res[0].error).toBe('GOVERNANCE_UNAVAILABLE');
    expect(handlerWrites()).toEqual([]);
  });

  it('BLOCKS a Part 11 governed mutation when the Part 11 flag read fails', async () => {
    rbac.hasRole.mockResolvedValue(true);
    // First settings read (tool policy) succeeds; second (Part 11 flag) fails.
    let settingsReads = 0;
    dbState.query.mockImplementation(async (sql: string) => {
      if (SETTINGS_SQL.test(sql)) {
        settingsReads += 1;
        if (settingsReads >= 2) throw new Error('statement timeout');
        return { rows: [{ settings: {} }], rowCount: 1 };
      }
      return { rows: [{ id: 1, title: 'Doc', status: 'DRAFT' }], rowCount: 1 };
    });

    const res = await executeCommands(
      [{ command: 'submit_document', params: { docId: 1 } }] as any,
      ctx(),
    );

    expect(res[0].success).toBe(false);
    expect(res[0].error).toBe('GOVERNANCE_UNAVAILABLE');
    // Without the fix the swallowed error became part11Enforce=false and the
    // document would have been flipped to SUBMITTED with no sign-off at all.
    expect(handlerWrites()).toEqual([]);
  });

  it('keeps READ-ONLY commands answering during a governance-config outage', async () => {
    dbState.query.mockImplementation(async (sql: string) => {
      if (SETTINGS_SQL.test(sql)) throw new Error('connection terminated unexpectedly');
      return { rows: [], rowCount: 0 };
    });

    const res = await executeCommands([{ command: 'list_projects', params: {} }] as any, ctx());

    expect(res[0].error).not.toBe('GOVERNANCE_UNAVAILABLE');
  });

  it('does NOT block when the read succeeds and simply finds no restriction configured', async () => {
    rbac.hasRole.mockResolvedValue(true);
    dbState.query.mockImplementation(async (sql: string) => {
      if (SETTINGS_SQL.test(sql)) return { rows: [{ settings: null }], rowCount: 1 };
      return { rows: [{ id: 5, name: 'Default Tenant Program', status: 'active' }], rowCount: 1 };
    });

    const res = await executeCommands(
      [{ command: 'create_project', params: { name: 'Default Tenant Program' } }] as any,
      ctx(),
    );

    expect(res[0].error).toBeUndefined();
    expect(res[0].success).toBe(true);
  });
});

describe('governance config loaders — strict vs fail-soft', () => {
  const throwingPool = { query: vi.fn(async () => { throw new Error('connection lost'); }) };

  it('loadAnaToolPolicyStrict propagates a read failure', async () => {
    await expect(loadAnaToolPolicyStrict(throwingPool as any, 1)).rejects.toThrow('connection lost');
  });

  it('loadPart11EnforceStrict propagates a read failure', async () => {
    await expect(loadPart11EnforceStrict(throwingPool as any, 1)).rejects.toThrow('connection lost');
  });

  it('the fail-soft wrappers stay fail-soft for read/display callers', async () => {
    await expect(loadAnaToolPolicy(throwingPool as any, 1)).resolves.toEqual({});
    await expect(loadPart11Enforce(throwingPool as any, 1)).resolves.toBe(false);
  });

  it('strict loaders still return the determinate permissive default', async () => {
    const emptyPool = { query: vi.fn(async () => ({ rows: [{ settings: {} }] })) };
    await expect(loadAnaToolPolicyStrict(emptyPool as any, 1)).resolves.toEqual({});
    await expect(loadPart11EnforceStrict(emptyPool as any, 1)).resolves.toBe(false);
  });
});
