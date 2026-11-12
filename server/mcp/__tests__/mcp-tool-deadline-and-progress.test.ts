/**
 * A connector tool call is answered inside the edge's 60 s, and says so when it cannot be (MR-03 Stage 6 step 9, OPS-17).
 *
 * CloudFront and the ALB close a connection that carries nothing for 60 s. The
 * connector's long tools (the agency-response draft goes to a model; the CRL
 * pre-mortem scans up to 60,000 characters against the precedent corpus) had
 * no progress and no deadline, so a slow call was cut at the edge and the
 * client saw a broken connection, not an answer.
 *
 * The runtime now sends notifications/progress every 15 s when the request
 * carries a progress token, and answers a tool that writes nothing governed at
 * 50 s with an error result, never a partial one. A governed tool is not cut:
 * its record may already be written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { audits, released } = vi.hoisted(() => ({
  audits: [] as Array<Record<string, any>>,
  released: { count: 0 },
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async (entry: Record<string, unknown>) => { audits.push(entry); return { persisted: true }; }) },
}));
vi.mock('../../middleware/lazyRequestDbClient', () => ({
  LazyRequestDbClient: class {
    async query() { return { rows: [] }; }
    async release() { released.count += 1; }
  },
}));
vi.mock('../../services/part11/editor-role', () => ({
  editorRoleDecision: async () => ({ allowed: true }),
  editorRoleRefusalText: () => 'refused',
}));

import { MCP_PROGRESS_INTERVAL_MS, MCP_TOOL_DEADLINE_MS, registerTool } from '../tools/runtime';

type Handler = (input: Record<string, unknown>, extra: Record<string, unknown>) => Promise<any>;

function capture(spec: Record<string, unknown>) {
  let handler: Handler | null = null;
  const server = { registerTool: (_name: string, _meta: unknown, fn: Handler) => { handler = fn; } };
  registerTool(server as any, spec as any, {} as any);
  return handler!;
}

const principal = {
  userId: 42, organizationId: 7, organizationUuid: null, role: 'member',
  email: 'author@tenant.example', clientId: 'claude', scopes: ['c2c:draft', 'c2c:file'], tokenUse: 'platform',
};
const authInfo = { token: 't', clientId: 'claude', scopes: principal.scopes, extra: { principal } };

/** A tool whose work takes `ms`, and records the signal it was given. */
function slowTool(ms: number, opts: { governed?: boolean } = {}) {
  const seen: { signal?: AbortSignal } = {};
  const run = vi.fn((_input: unknown, ctx: { ana: { signal?: AbortSignal } }) => {
    seen.signal = ctx.ana.signal;
    return new Promise((resolve) => setTimeout(() => resolve({ kind: 'ok', summary: 'Draft complete.', data: { body: 'all of it' } }), ms));
  });
  const spec = { name: opts.governed ? 'c2c_file_draft_for_review' : 'c2c_draft_agency_response', title: 't', description: 'd',
    inputSchema: {}, scope: opts.governed ? 'c2c:file' : 'c2c:draft', governed: Boolean(opts.governed), implementation: 'test', run };
  return { spec, run, seen };
}

beforeEach(() => {
  vi.useFakeTimers();
  audits.length = 0;
  released.count = 0;
  return () => vi.useRealTimers();
});

describe('the 50 s deadline', () => {
  it('sits under the edge, with progress more often than the edge waits', () => {
    expect(MCP_TOOL_DEADLINE_MS).toBe(50_000);
    expect(MCP_TOOL_DEADLINE_MS).toBeLessThan(60_000);
    expect(MCP_PROGRESS_INTERVAL_MS).toBe(15_000);
  });

  it('a tool that takes 70 s is answered at 50 s with an error, not a partial result', async () => {
    const { spec, seen } = slowTool(70_000);
    const pending = capture(spec)({}, { authInfo });
    await vi.advanceTimersByTimeAsync(49_999);
    let answered = false;
    void pending.then(() => { answered = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const out = await pending;
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toMatch(/did not finish within the connector's time limit \(50 s\); nothing partial was returned\. Continue in the app/);
    expect(out.structuredContent).toMatchObject({ tool: 'c2c_draft_agency_response', refused: true, deadlineMs: 50_000 });
    expect(JSON.stringify(out)).not.toContain('all of it');
    expect(seen.signal?.aborted).toBe(true);
    expect(audits.at(-1)?.details).toMatchObject({ outcome: 'failed', tool: 'c2c_draft_agency_response' });
  });

  it("releases the call's database connection only once the abandoned work settles", async () => {
    const { spec } = slowTool(70_000);
    const pending = capture(spec)({}, { authInfo });
    await vi.advanceTimersByTimeAsync(50_000);
    await pending;
    expect(released.count).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(released.count).toBe(1);
  });

  it('a tool that finishes in time is answered with its result, and nothing fires later', async () => {
    const { spec, seen } = slowTool(10_000);
    const pending = capture(spec)({}, { authInfo });
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await pending;
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toMatchObject({ body: 'all of it' });
    expect(released.count).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(seen.signal?.aborted).toBe(false);
    expect(audits.length).toBe(1);
  });

  it('a governed tool is not cut: its record may already be written', async () => {
    const { spec } = slowTool(70_000, { governed: true });
    const pending = capture(spec)({}, { authInfo });
    await vi.advanceTimersByTimeAsync(70_000);
    const out = await pending;
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent).toMatchObject({ body: 'all of it' });
  });
});

describe('progress notifications', () => {
  it('every 15 s while the call runs, for a request that carries a progress token', async () => {
    const sendNotification = vi.fn(async () => undefined);
    const { spec } = slowTool(40_000);
    const pending = capture(spec)({}, { authInfo, _meta: { progressToken: 'p-1' }, sendNotification });
    await vi.advanceTimersByTimeAsync(40_000);
    await pending;
    expect(sendNotification.mock.calls.map((c: any[]) => c[0])).toEqual([
      { method: 'notifications/progress', params: { progressToken: 'p-1', progress: 1, message: 'c2c_draft_agency_response is still working (15 s)' } },
      { method: 'notifications/progress', params: { progressToken: 'p-1', progress: 2, message: 'c2c_draft_agency_response is still working (30 s)' } },
    ]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it('none without a token', async () => {
    const sendNotification = vi.fn(async () => undefined);
    const { spec } = slowTool(40_000);
    const pending = capture(spec)({}, { authInfo, sendNotification });
    await vi.advanceTimersByTimeAsync(40_000);
    await pending;
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('a notification that cannot be sent does not fail the call', async () => {
    const sendNotification = vi.fn(async () => { throw new Error('stream closed'); });
    const { spec } = slowTool(20_000);
    const pending = capture(spec)({}, { authInfo, _meta: { progressToken: 3 }, sendNotification });
    await vi.advanceTimersByTimeAsync(20_000);
    const out = await pending;
    expect(out.structuredContent).toMatchObject({ body: 'all of it' });
  });
});

describe('the agency-response draft', () => {
  it("passes the call's signal to the model call, so a call cut at 50 s stops its model request", async () => {
    vi.resetModules();
    const chat = vi.fn(async (_s: string, _u: string, opts: { signal?: AbortSignal }) => {
      expect(opts.signal).toBeInstanceOf(AbortSignal);
      return { content: 'draft', provider: 'anthropic', model: 'm', requestId: 'r', usage: {} };
    });
    vi.doMock('../../services/ai-gateway/gateway', () => ({
      getGateway: () => ({ getModels: () => [{ enabled: true }], isDeterministic: () => false, chat }),
    }));
    const { draftAgencyResponse } = await import('../tools/drafting');
    const controller = new AbortController();
    await draftAgencyResponse.run(
      { agency: 'FDA', deficiency: 'Provide the stability data for lot 3.', facts: ['Lot 3 was stored at 25 C.'], tone: 'formal' } as never,
      { principal, ana: { organizationId: 7, userId: 42, organizationUuid: null, signal: controller.signal } } as never,
    );
    expect(chat).toHaveBeenCalledTimes(1);
    expect((chat.mock.calls[0] as any[])[2].signal).toBe(controller.signal);
  });
});
