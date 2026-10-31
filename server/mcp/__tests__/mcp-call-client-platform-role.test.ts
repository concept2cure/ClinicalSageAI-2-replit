/**
 * The MCP tool call's connection refuses the platform role (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * createMcpCallSqlClient (mcp/tools/runtime.ts) applies the principal's role to
 * the call's connection as app.current_user_role, and the platform arm of about
 * 977 tenant policies compares that setting with 'app_super_admin'. The
 * principal's role is the membership row's, or the token's claim when the row
 * has none (auth/platform-token.ts). Slice 1a's runWithTenantScope, which wraps
 * the call, refuses the string; the writer itself took it as given. Here the
 * wrapper is a pass-through, so the writer is tested on its own, as slice 1a
 * tested tenantSessionVars: it refuses before any connection is taken.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sent: [] as Array<{ sql: string; params?: unknown[] }>,
  connects: 0,
}));
vi.mock('../../db/tenantStore', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // What the writer is held to on its own: no caller's check in front of it.
  runWithTenantScope: (_scope: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../db', () => ({
  pool: {
    connect: async () => {
      h.connects += 1;
      return {
        query: async (sql: string, params?: unknown[]) => { h.sent.push({ sql, params }); return { rows: [] }; },
        release: () => undefined,
      };
    },
  },
}));
vi.mock('../../services/auditService', () => ({ logAuditEvent: async () => ({ ok: true }), writeAuditEntry: async () => ({ ok: true }) }));
import { registerTool } from '../tools/runtime';

type Handler = (input: Record<string, unknown>, extra: { authInfo?: unknown }) => Promise<unknown>;
function registered(): Handler {
  let handler: Handler | undefined;
  const server = { registerTool: (_n: string, _m: unknown, fn: Handler) => { handler = fn; } };
  registerTool(server as never, {
    name: 'c2c_probe', title: 'Probe', description: 'probe', inputSchema: {}, scope: 'c2c:read', governed: false,
    implementation: 'test', annotations: {},
    run: async (_input: unknown, ctx: { sqlClient: { query: (s: string) => Promise<unknown> } }) => {
      await ctx.sqlClient.query('SELECT 1');
      return { kind: 'ok', summary: 'done', data: {} };
    },
  } as never, {} as never);
  return handler!;
}
const principal = (role: string) => ({
  userId: 5, organizationId: 7, organizationUuid: '73629479-bb69-405d-9ff0-b7b8150eca13', role,
  email: null, clientId: 'c', scopes: ['c2c:read'], tokenUse: 'mcp',
});

beforeEach(() => {
  h.sent = [];
  h.connects = 0;
});

describe('the MCP tool call connection and the platform role', () => {
  it.each(['app_super_admin', 'APP_SUPER_ADMIN', ' app_super_admin ', 'App_Super_Admin\n'])(
    'principal role %j: refused before any connection, and nothing reaches app.current_user_role',
    async (role) => {
      const call = registered()({}, { authInfo: { extra: { principal: principal(role) } } });
      await expect(call).rejects.toMatchObject({ code: 'PLATFORM_SCOPE_ROLE_REFUSED' });
      expect(h.connects).toBe(0);
      expect(h.sent.filter((s) => s.sql.includes('app.current_user_role'))).toEqual([]);
    },
  );

  it('an ordinary role is applied to the call\'s connection', async () => {
    await registered()({}, { authInfo: { extra: { principal: principal('editor') } } });
    const applied = h.sent.find((s) => s.sql.includes('app.current_user_role'));
    expect(applied?.params).toEqual(['7', 'editor', '73629479-bb69-405d-9ff0-b7b8150eca13']);
  });
});
