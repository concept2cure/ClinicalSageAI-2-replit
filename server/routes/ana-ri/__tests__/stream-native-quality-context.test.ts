/** Actual stream route: selected native context keeps its dispatch checkpoint in every model round. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayRequest } from '../../../services/ai-gateway/types';

const io = vi.hoisted(() => ({ read: vi.fn(), capture: vi.fn(), guard: vi.fn() }));
const harnessModule = vi.hoisted(() => () => import('./support/stream-route-harness.js'));
vi.mock('../../../db.js', async () => (await harnessModule()).mocks.db());
vi.mock('../shared.js', async original => (await harnessModule()).mocks.shared(await original<Record<string, unknown>>()));
vi.mock('../post-processing.js', async () => (await harnessModule()).mocks.postProcessing());
vi.mock('../../../services/ana/AnaToolExecutor.js', async () => (await harnessModule()).mocks.toolExecutor());
vi.mock('../../../services/ana/governed-toolset.js', async () => (await harnessModule()).mocks.governedToolset());
vi.mock('../../../services/ana/run-control.js', async original =>
  (await harnessModule()).mocks.runControl(await original<typeof import('../../../services/ana/run-control.js')>()));
vi.mock('../../../services/ana-ri/orchestrator.js', async () => (await harnessModule()).mocks.orchestrator());
vi.mock('../../../services/ana-ri/chat-context-builder.js', async original =>
  (await harnessModule()).mocks.chatContextBuilder(await original<Record<string, unknown>>()));
vi.mock('../../../services/lumen-context-builder.js', async () => (await harnessModule()).mocks.lumen());
vi.mock('../../../services/memory-context-assembler.js', async () => (await harnessModule()).mocks.memory());
vi.mock('../../../services/ana-ri/context-enrichment.js', async () => (await harnessModule()).mocks.enrichment());
vi.mock('../../../services/chat-thread-helpers.js', async () => ({
  ...(await harnessModule()).mocks.chatThreads(), programIdForThread: (id: string) => id,
}));
vi.mock('../../../services/ana-session-bootstrap.js', async () => (await harnessModule()).mocks.sessionBootstrap());
vi.mock('../../../services/kernel-adaptive-policy.js', async () => (await harnessModule()).mocks.kernelPolicy());
vi.mock('../../../services/ana/ana-input-guard.js', async () => (await harnessModule()).mocks.inputGuard());
vi.mock('../../../services/auditService.js', async () => (await harnessModule()).mocks.audit());
vi.mock('../../../services/toolRegistry.js', async () => (await harnessModule()).mocks.toolRegistry());
vi.mock('../../../services/ana-ri/relational-profile-service.js', async () => (await harnessModule()).mocks.relationalProfile());
vi.mock('../../../services/ana/tool-telemetry.js', async () => (await harnessModule()).mocks.toolTelemetry());
vi.mock('../../../services/ana-ri-metrics.js', async () => (await harnessModule()).mocks.metrics());
vi.mock('../../../services/anthropic-files.js', async () => (await harnessModule()).mocks.anthropicFiles());
// Canonical access and the native reader/closure are qualified separately. Here
// they admit exact context so the real route's two outbound seams are observable.
vi.mock('../../../services/ana/source-context-admission', () => ({
  admitAnaSelectedSources: async () => {}, assertAnaUploadAccess: async () => {},
}));
vi.mock('../../../services/clinical-regulatory-evidence/evidence-spine.service', () => ({ resolveSourceUploadIds: async () => [] }));
vi.mock('../../../services/clinical-regulatory-evidence/retained-source-context', () => ({
  readRetainedSourceContexts: io.read, nativeSourceDispatchGuard: io.capture,
}));

import { mountStreamRoute } from '../stream';
import { GatewayPolicyError } from '../../../services/ai-gateway/gateway';
import { harness as h, resetHarness, streamApp, turn } from './support/stream-route-harness';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const source = { sourceId: 9, title: 'NC-1', sha256: 'a'.repeat(64), textSha256: 'b'.repeat(64),
  text: 'Recorded nonconformance; pending disposition. No approval asserted.', truncated: false,
  originalFileAvailable: false as const, representationId: 'native:9', origin: 'native_record_snapshot' as const };
const app = streamApp(mountStreamRoute);
const baseRoute = h.gateway.route;
let seen: Array<GatewayRequest['beforeDispatch']>;
const savedEnforce = process.env.ENTITLEMENTS_ENFORCE;
beforeAll(() => { process.env.ENTITLEMENTS_ENFORCE = 'off'; });
afterAll(() => {
  if (savedEnforce === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = savedEnforce;
});
beforeEach(() => {
  resetHarness(); vi.clearAllMocks(); seen = [];
  io.read.mockResolvedValue([source]);
  io.guard.mockResolvedValue(undefined);
  io.capture.mockImplementation((_scope, contexts: Array<{ origin?: string }>) =>
    contexts.some(item => item.origin === 'native_record_snapshot') ? io.guard : undefined);
  vi.spyOn(h.gateway, 'route').mockImplementation(async (request: GatewayRequest) => {
    seen.push(request.beforeDispatch);
    try { await request.beforeDispatch?.(); }
    catch { throw Object.assign(new GatewayPolicyError('Selected project sources changed.'), { code: 'SOURCE_CONTEXT_UNAVAILABLE' }); }
    return baseRoute(request);
  });
});
afterEach(() => { vi.restoreAllMocks(); });
const body = { message: 'Review the selected Quality record', project_id: PROGRAM, source_ids: [9] };
const tool = { id: 'tool-1', name: 'list_app_screens', input: {} };

describe('native Quality context at the stream dispatch seams', () => {
  it('passes the same authenticated captured checkpoint to initial and follow-up dispatch', async () => {
    h.state.script = [[tool], 'The recorded disposition remains pending.'];
    await turn(app, body);
    expect(h.state.gatewayCalls).toBe(2);
    expect(io.capture).toHaveBeenCalledExactlyOnceWith({ organizationId: 7, programId: PROGRAM, userId: 3 }, [source]);
    expect(seen).toEqual([io.guard, io.guard]);
    expect(io.guard).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.state.requests[0].messages)).toContain(source.text);
  });

  it('ends with a source refusal before initial provider dispatch when the checkpoint rejects', async () => {
    io.guard.mockRejectedValue(new Error('private native source was withdrawn'));
    const events = await turn(app, body);
    expect(h.state.gatewayCalls).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'SOURCE_CONTEXT_UNAVAILABLE' }));
    expect(h.state.post).toBeNull();
  });

  it('rechecks after tool work and refuses stale context before the follow-up provider dispatch', async () => {
    io.guard.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('native snapshot superseded'));
    h.state.script = [[tool], 'This answer must never be generated.'];
    const events = await turn(app, body);
    expect(h.state.gatewayCalls).toBe(1);
    expect(seen).toEqual([io.guard, io.guard]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'SOURCE_CONTEXT_UNAVAILABLE' }));
    expect(JSON.stringify(events)).not.toContain('This answer must never be generated.');
    expect(h.state.post).toBeNull();
  });

  it('preserves legacy retained-only dispatch without a native checkpoint', async () => {
    io.read.mockResolvedValue([{ ...source, origin: undefined, representationId: 'vault:legacy' }]);
    h.state.script = [[tool], 'Retained source reviewed.'];
    await turn(app, body);
    expect(h.state.gatewayCalls).toBe(2);
    expect(seen).toEqual([undefined, undefined]);
    expect(io.guard).not.toHaveBeenCalled();
  });
});
