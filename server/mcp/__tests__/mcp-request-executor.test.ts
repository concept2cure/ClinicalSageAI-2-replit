/** Wrapper/executor lifetime proof; actor policy and RLS use independent native suites. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), release: vi.fn(), setup: vi.fn(), clear: vi.fn() }));
vi.mock('../../db', () => ({ pool: { connect: h.connect } }));
vi.mock('../../db/sessionScope', () => ({ applySessionScope: h.setup, clearSessionScope: h.clear }));
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
import { registerTool, type ToolRunContext, type ToolOutcome } from '../tools/runtime';
const principal = { userId: 42, organizationId: 7, organizationUuid: '862955dc-b260-4e98-882b-89051db38dba',
  role: 'viewer', email: 'viewer@tenant.example', clientId: 'first-party', scopes: ['c2c:read'], tokenUse: 'platform' };
const authInfo = { token: 'test-only', clientId: 'first-party', scopes: principal.scopes, extra: { principal } };
type Handler = (input: Record<string, unknown>, extra: { authInfo: typeof authInfo; signal?: AbortSignal }) => Promise<any>;
function capture(run: (ctx: ToolRunContext) => Promise<ToolOutcome>): Handler {
  let handler: Handler | undefined;
  const server = { registerTool: (_name: string, _meta: unknown, fn: Handler) => { handler = fn; } };
  registerTool(server as never, { name: 'c2c_test_read', title: 'Read', description: 'Test read', inputSchema: {},
    scope: 'c2c:read', governed: false, implementation: 'test-only', annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: async (_input, ctx) => run(ctx),
  }, {} as never);
  return handler!;
}
beforeEach(() => {
  vi.clearAllMocks(); h.query.mockResolvedValue({ rows: [] });
  h.connect.mockResolvedValue({ query: h.query, release: h.release });
});
describe('authenticated MCP tool request executor', () => {
  it('uses the same pinned executor for Vault and AnA, applying and clearing the verified principal once', async () => {
    let saved: ToolRunContext | undefined;
    const handler = capture(async ctx => {
      saved = ctx;
      expect(ctx.sqlClient).toBe(ctx.ana.sqlClient);
      await ctx.sqlClient!.query('SELECT first');
      await ctx.ana.sqlClient!.query('SELECT second');
      return { kind: 'ok', summary: 'Read', data: {} };
    });
    expect((await handler({}, { authInfo })).isError).not.toBe(true);
    expect(h.connect).toHaveBeenCalledTimes(1);
    expect(h.setup).toHaveBeenCalledWith(expect.objectContaining({ query: h.query }), { tenantId: '7', role: 'viewer', orgUuid: principal.organizationUuid });
    expect(h.clear).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
    await expect(saved!.sqlClient!.query('SELECT released')).rejects.toThrow('released request DB client');
  });
  it('does not release an in-flight query on abort, and stops subsequent statements before acquisition', async () => {
    const controller = new AbortController();
    let finish!: (value: { rows: never[] }) => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    h.query.mockImplementation(() => { started(); return new Promise(resolve => { finish = resolve; }); });
    const handler = capture(async ctx => {
      await ctx.sqlClient!.query('SELECT in_flight');
      await ctx.sqlClient!.query('SELECT after_abort');
      return { kind: 'ok', summary: 'Read', data: {} };
    });
    const pending = handler({}, { authInfo, signal: controller.signal });
    await ready; controller.abort();
    expect(h.clear).not.toHaveBeenCalled(); expect(h.release).not.toHaveBeenCalled();
    finish({ rows: [] });
    expect((await pending).isError).toBe(true);
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.clear).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
  });
  it('does not report a successfully completed commit as failed when abort occurs during it', async () => {
    const controller = new AbortController();
    h.query.mockImplementation(async () => { controller.abort(); return { rows: [] }; });
    const handler = capture(async ctx => {
      await ctx.sqlClient!.query('COMMIT');
      return { kind: 'ok', summary: 'Committed', data: {} };
    });
    expect((await handler({}, { authInfo, signal: controller.signal })).isError).not.toBe(true);
    expect(h.release).toHaveBeenCalledTimes(1);
  });
});
